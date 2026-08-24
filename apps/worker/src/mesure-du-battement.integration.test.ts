import { randomUUID } from "node:crypto";

import { DEFAULT_FEATURE_FLAGS, INFERENCE_PROVIDER_LIMITS, REGLAGES_RUNTIME_PAR_DEFAUT } from "@sentio/config";
import { CapabilityRegistry, ModelGateway, PolicyEngine, type ModelProvider } from "@sentio/core";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresApprovisionnementStore, RegistreDeGisementsEnMemoire } from "@sentio/runtime";
import { PostgresApprovalStore } from "@sentio/runtime";
import { PostgresEffectLedger } from "@sentio/runtime";
import { PostgresFileDeTravaux } from "@sentio/runtime";
import { PostgresJournalWriter } from "@sentio/runtime";
import { PostgresUsageLedger } from "@sentio/runtime";
import { PostgresMoteurs } from "@sentio/runtime";
import { approvisionnerLeJour } from "@sentio/runtime";
import { executerLesTravauxDus, type BoucleDeps } from "@sentio/runtime";

/**
 * D16 — combien de temps dure un battement, pour de vrai.
 *
 * ══ POURQUOI CETTE MESURE EXISTE ══
 *
 * [`adr/0021`](../../../docs/adr/0021-execution-serveur-en-ue.md) signale explicitement le risque :
 * « le battement du lot 3 s'il tentait de traiter plusieurs runs d'affilée ». Une fonction serveur
 * a une durée d'exécution bornée. Choisir cet hébergement sans avoir mesuré reviendrait à
 * découvrir la limite sur le premier client — c'est-à-dire au pire moment.
 *
 * ══ CE QUE LA MESURE SÉPARE, ET POURQUOI C'EST TOUT L'INTÉRÊT ══
 *
 * Un battement dépense son temps à deux endroits **de natures complètement différentes** :
 *
 *   · le **travail propre** — requêtes, verrous, journal, décisions. C'est ce que nous écrivons,
 *     et c'est ce qu'une optimisation peut réduire ;
 *   · l'**attente du modèle** — la latence du fournisseur, et surtout le **lissage de débit** que
 *     le Gateway impose lui-même pour ne pas dépasser le quota par minute. C'est de l'attente
 *     pure, elle ne consomme aucun processeur, et **aucune optimisation ne l'enlèvera**.
 *
 * Les confondre donnerait un chiffre inutilisable. Ici le fournisseur répond instantanément et le
 * lissage est neutralisé : ce qui est mesuré est le travail propre. L'attente, elle, se **calcule**
 * exactement — inutile de dormir vraiment pour savoir combien on dormirait.
 *
 * Les seuils sont larges à dessein : ce test n'est pas un banc de performance, c'est un garde-fou
 * contre une régression d'un ordre de grandeur.
 */

let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

const CAPACITE = "qualifier.prospect";
/** Ce que la mesure rapporte, pour que le compte rendu ne soit pas une impression. */
const mesures: { quoi: string; ms: number; detail?: string }[] = [];

describeIfDatabase("D16 — la durée réelle d'un battement", () => {
  let sql: PostgresClient;

  /** L'heure SELON LA BASE — voir la note détaillée dans `boucle.integration.test.ts`. */
  async function maintenantSelonLaBase(): Promise<Date> {
    const [ligne] = await sql.query<{ maintenant: Date }>("select now() as maintenant", []);
    return ligne?.maintenant as Date;
  }
  const tenants: string[] = [];
  let appels = 0;

  const fournisseur: ModelProvider = {
    key: "mesure-conforme",
    dataPolicy: "no_train",
    async complete() {
      appels += 1;
      return {
        turn: {
          role: "assistant",
          type: "text",
          text: JSON.stringify({
            action: "agir",
            capacite: CAPACITE,
            entree: { lead_id: randomUUID() },
            pourquoi: "ce prospect correspond à la cible",
          }),
        },
        tokens: 900,
      };
    },
  };

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    await sql.query(
      `insert into provider_credential (provider_key, data_policy, opt_out_proven_at, enabled)
       values ($1, 'no_train', now(), true) on conflict (provider_key) do nothing`,
      [fournisseur.key],
    );
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await sql.withTransaction(async (tx) => {
        await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
        await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
        await tx.query("delete from tenant where id = $1", [tenantId]);
      });
    }
    await sql.close();

    process.stdout.write(`\n── D16 · durée d'un battement (Postgres local) ──\n`);
    for (const mesure of mesures) {
      process.stdout.write(
        `   ${mesure.quoi.padEnd(46)} ${String(Math.round(mesure.ms)).padStart(6)} ms` +
          `${mesure.detail === undefined ? "" : `   ${mesure.detail}`}\n`,
      );
    }
    process.stdout.write("\n");
  });

  beforeEach(async () => {
    await sql.query("delete from job", []);
  });

  function deps(): BoucleDeps {
    const journal = new PostgresJournalWriter(sql);
    const registry = new CapabilityRegistry();
    registry.registerContract({
      key: CAPACITE,
      effectClass: "internal_write",
      description: "Vérifier qu'un prospect correspond à ce que le client vend.",
    });
    registry.registerEngine({
      engineKey: "base",
      capabilityKey: CAPACITE,
      execute: async () => ({ qualification: "qualifie", raison: "cible déclarée" }),
    });
    const gateway = new ModelGateway({
      providers: [fournisseur],
      ledger: new PostgresUsageLedger(sql),
      journal,
      flags: { ...DEFAULT_FEATURE_FLAGS, inferenceOptOutProven: true },
      // ⚠️ Lissage neutralisé et fournisseur instantané : on mesure le TRAVAIL PROPRE. L'attente
      // est calculée plus bas, elle n'a pas besoin d'être subie.
      clock: { now: () => new Date(), sleep: async () => undefined },
      providerLimits: { requestsPerMinute: 1_000_000, tokensPerMonth: 1_000_000_000 },
    });
    const moteurs = new PostgresMoteurs(sql, registry);
    return {
      sql,
      file: new PostgresFileDeTravaux(sql),
      journal,
      gateway,
      policy: new PolicyEngine(new PostgresApprovalStore(sql), journal),
      registry,
      ledger: new PostgresEffectLedger(sql),
      moteurPour: (tenantId, capabilityKey) => moteurs.pour(tenantId, capabilityKey),
    };
  }

  async function entreprise(prospects: number): Promise<string> {
    const tenantId = randomUUID();
    tenants.push(tenantId);
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Mesure D16"]);
    await sql.query(
      `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
       select $1, p.id, 'active', now() - interval '1 day', now() + interval '29 days'
         from plan p where p.tier = 'start'`,
      [tenantId],
    );
    await sql.query(
      `insert into objective (tenant_id, metric, target_value, horizon)
       values ($1, 'rendez_vous_qualifies', 10, 'ce mois')`,
      [tenantId],
    );
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, $2::jsonb, '["relancer.prospect","qualifier.prospect"]'::jsonb) returning id`,
      [
        versionUnique(),
        JSON.stringify({
          profession: "commercial",
          mission: "trouver des entreprises à qui vendre",
          perimetre: ["qualifier"],
          limites: ["comptabilité"],
        }),
      ],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
       values ($1, $2, $3, 'confirm_once') returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    await sql.query(
      `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
       select $1, $2, c.id, true from capability c where c.key = $3`,
      [tenantId, employee?.id, CAPACITE],
    );
    for (let i = 0; i < prospects; i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Prospect ${i}`, `p${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }
    return tenantId;
  }

  function chronometre<T>(quoi: string, detail?: string): (travail: Promise<T>) => Promise<T> {
    const debut = performance.now();
    return async (travail: Promise<T>): Promise<T> => {
      const resultat = await travail;
      mesures.push({ quoi, ms: performance.now() - debut, ...(detail === undefined ? {} : { detail }) });
      return resultat;
    };
  }

  function derniere(): number {
    return mesures[mesures.length - 1]?.ms ?? 0;
  }

  it("mesure un battement à vide — le cas le plus fréquent, et de loin", async () => {
    // Un employé qui n'a rien à faire est la situation normale de la plupart des battements.
    // C'est donc ce chiffre qui décide du coût de la cadence, pas le pire cas.
    const mesurer = chronometre("battement à vide (rien de dû)");
    await mesurer(
      executerLesTravauxDus(deps(), {
        prisPar: "mesure",
        maintenant: new Date(Date.now() - 3_600_000),
        dataClass: "synthetic",
      }),
    );
    expect(derniere()).toBeLessThan(2_000);
  });

  it("mesure l'approvisionnement de dix missions", async () => {
    const tenantId = await entreprise(REGLAGES_RUNTIME_PAR_DEFAUT.missionsMaxParJour);
    const mesurer = chronometre("approvisionnement de 10 missions");
    await mesurer(
      approvisionnerLeJour(
        {
          store: new PostgresApprovisionnementStore(sql),
          gisements: RegistreDeGisementsEnMemoire.commercial(sql),
          journal: new PostgresJournalWriter(sql),
        },
        new Date(),
      ),
    );
    const [n] = await sql.query<{ n: string }>(
      "select count(*) as n from task where tenant_id = $1",
      [tenantId],
    );
    expect(Number(n?.n)).toBe(10);
    expect(derniere()).toBeLessThan(5_000);
  });

  it("mesure dix pas complets — travail propre, modèle instantané", async () => {
    await entreprise(10);
    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
        journal: new PostgresJournalWriter(sql),
      },
      new Date(),
    );

    appels = 0;
    const mesurer = chronometre<{ traites: number; echoues: number }>(
      "10 pas complets (modèle instantané)",
    );
    const rapport = await mesurer(
      executerLesTravauxDus(deps(), {
        prisPar: "mesure",
        maintenant: await maintenantSelonLaBase(),
        dataClass: "synthetic",
        maxTravaux: 10,
      }),
    );

    expect(rapport.traites).toBe(10);
    expect(appels).toBe(10);

    const parPas = derniere() / 10;
    mesures.push({ quoi: "  → dont, par pas", ms: parPas });
    expect(derniere()).toBeLessThan(15_000);
  });

  it("calcule l'attente que le lissage de débit impose, et que rien ne peut réduire", () => {
    // ⚠️ LE chiffre qui décide de D16. Le Gateway lisse lui-même les appels pour ne pas dépasser
    // le quota du fournisseur (`smoothRate`). Ce n'est pas une lenteur : c'est la condition pour
    // que les appels passent. Aucune optimisation de notre code ne l'enlèvera.
    const intervalleMs = 60_000 / INFERENCE_PROVIDER_LIMITS.requestsPerMinute;
    const pas = REGLAGES_RUNTIME_PAR_DEFAUT.pasMaximumParRun;

    for (const n of [1, 2, 5, pas]) {
      const attente = (n - 1) * intervalleMs;
      mesures.push({
        quoi: `attente de lissage pour ${n} appel(s)`,
        ms: attente,
        detail: `(${INFERENCE_PROVIDER_LIMITS.requestsPerMinute} req/min → 1 toutes les ${intervalleMs / 1000} s)`,
      });
    }

    // Deux appels dans un même battement imposent déjà une demi-minute d'attente pure. C'est ce
    // fait, et non la vitesse de nos requêtes, qui contraint le choix d'hébergement.
    expect(intervalleMs).toBeGreaterThanOrEqual(30_000);
  });
});
