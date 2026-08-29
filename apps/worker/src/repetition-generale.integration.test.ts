import { randomUUID } from "node:crypto";

import { DEFAULT_FEATURE_FLAGS } from "@sentio/config";
import {
  ACTION_EXECUTEE,
  CapabilityRegistry,
  ModelGateway,
  POLITIQUE_SUSPEND,
  PolicyEngine,
  type ModelProvider,
} from "@sentio/core";
import { recommend, type DiagnosticProfile } from "@sentio/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PostgresApprovalStore,
  PostgresApprovisionnementStore,
  PostgresEffectLedger,
  PostgresFileDeTravaux,
  PostgresJournalWriter,
  PostgresMoteurs,
  PostgresUsageLedger,
  RegistreDeGisementsEnMemoire,
  approvisionnerLeJour,
  executerLesTravauxDus,
  type BoucleDeps,
} from "@sentio/runtime";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * LADY-P — **la répétition générale**. Le parcours entier, en une exécution, sans qu'aucune
 * donnée ne soit écrite à la main.
 *
 * ══ CE QUE CE FICHIER PROUVE, ET QU'AUCUN AUTRE NE PROUVE ══
 *
 * Toutes les autres suites vérifient une pièce. Celle-ci vérifie que les pièces s'emboîtent :
 *
 *     un dirigeant décrit son entreprise
 *       → Sentio constate, diagnostique, compose une configuration
 *       → il paie
 *       → une Lady est recrutée, configurée, dotée de pouvoirs
 *       → il se connecte et retrouve son entreprise
 *       → du travail s'ouvre tout seul
 *       → Lady propose une action irréversible et S'ARRÊTE pour demander
 *       → il accorde
 *       → l'action s'exécute
 *       → il déclare un résultat
 *
 * ⚠️ **Aucune ligne de `task`, `employee`, `lady_configuration`, `job` ou `tenant_member` n'est
 * écrite par ce test.** Tout vient des chemins de production. Si un seul chaînon manque, le
 * parcours s'arrête là où il est rompu — et c'est ce qu'on veut apprendre ici plutôt qu'en
 * production. C'est ainsi que le trou `EXEC-11` a été trouvé : le client accordait, et rien ne
 * repartait.
 *
 * Ce qui reste faux, et pourquoi : le fournisseur de modèle (un vrai appel serait lent, payant et
 * ferait sortir des données vers un tiers depuis une suite de tests) et le moteur d'envoi (il
 * expédierait un courriel). Les deux sont enregistrés sous les mêmes clés que les vrais : c'est
 * donc bien `capability_binding` qui les résout, pas ce test.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

/** Ce que le dirigeant a raconté. Rien d'autre n'entre dans le système. */
const CE_QUE_LE_DIRIGEANT_RACONTE: DiagnosticProfile = {
  sector: "menuiserie",
  headcount: 6,
  friction: "aucune_relance",
  objective: { metric: "rendez_vous_qualifies", target: 10, horizon: "ce mois" },
  targetCustomers: "architectes et maîtres d'œuvre",
  hasProspectList: true,
  inboundHandling: "traite",
};

describeIfDatabase("LADY-P — la répétition générale, de la conversation au résultat", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];
  /** Ce que le faux moteur d'envoi a réellement exécuté. */
  const effets: unknown[] = [];
  let reponses: string[] = [];

  const fournisseur: ModelProvider = {
    key: "faux-repetition",
    dataPolicy: "no_train",
    async complete() {
      const texte = reponses.shift() ?? JSON.stringify({ action: "terminer", pourquoi: "fini" });
      return { turn: { role: "assistant", type: "text", text: texte }, tokens: 12 };
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
  });

  function deps(): BoucleDeps {
    const journal = new PostgresJournalWriter(sql);
    const registry = new CapabilityRegistry();
    registry.registerContract({
      key: "envoyer.prospect",
      effectClass: "external_irreversible",
      description: "Écrire à une entreprise depuis le domaine du client.",
    });
    registry.registerEngine({
      engineKey: "base",
      capabilityKey: "envoyer.prospect",
      execute: async (input: unknown) => {
        effets.push(input);
        return { message_id: randomUUID() };
      },
    });
    const moteurs = new PostgresMoteurs(sql, registry);
    return {
      sql,
      file: new PostgresFileDeTravaux(sql),
      journal,
      gateway: new ModelGateway({
        providers: [fournisseur],
        ledger: new PostgresUsageLedger(sql),
        journal,
        flags: { ...DEFAULT_FEATURE_FLAGS, inferenceOptOutProven: true },
        clock: { now: () => new Date(), sleep: async () => undefined },
        providerLimits: { requestsPerMinute: 100_000, tokensPerMonth: 1_000_000_000 },
      }),
      policy: new PolicyEngine(new PostgresApprovalStore(sql), journal),
      registry,
      ledger: new PostgresEffectLedger(sql),
      moteurPour: (tenantId, capabilityKey) => moteurs.pour(tenantId, capabilityKey),
    };
  }

  /** L'heure SELON LA BASE — `job.next_run_at` vient de son horloge, pas de celle du processus. */

  it("va de la conversation au résultat, sans qu'aucune donnée ne soit écrite à la main", async () => {
    // ══ 1. LE DIAGNOSTIC ═══════════════════════════════════════════════════════════════════
    // Le moteur constate, pondère, compose. Le modèle n'a pas encore été appelé une seule fois.
    const decision = recommend(CE_QUE_LE_DIRIGEANT_RACONTE);
    expect(decision.status).toBe("recommande");
    if (decision.status !== "recommande") return;

    const calibrage = decision.calibration;
    expect(calibrage.capabilities).toContain("envoyer.prospect");

    // ══ 2. CE QUI EST GARDÉ DE LA CONVERSATION ═════════════════════════════════════════════
    const [session] = await sql.query<{ id: string }>(
      `insert into diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
       values ($1, $2::jsonb, $3) returning id`,
      [
        `repetition-${randomUUID().slice(0, 8)}`,
        JSON.stringify(CE_QUE_LE_DIRIGEANT_RACONTE),
        CE_QUE_LE_DIRIGEANT_RACONTE.friction,
      ],
    );

    const [reco] = await sql.query<{ id: string }>(
      `insert into recommendation (diagnostic_session_id, configuration_proposee, justification, status)
       values ($1, $2::jsonb, $3, 'proposed') returning id`,
      [
        session?.id,
        JSON.stringify({
          role: calibrage.role,
          priorites: calibrage.priorities,
          limites: calibrage.exclusions,
          autonomie: "confirm",
          capacites: calibrage.capabilities,
        }),
        decision.grounds.join(". "),
      ],
    );

    // Le noyau que Sentio publie doit concevoir ce que la composition a proposé. C'est la
    // vérification que `recruter()` fait AVANT de consommer une identité.
    // ⚠️ La version est calculée, pas tirée au sort. `recruter()` prend le noyau le PLUS RÉCENT
    // — ce qui est juste en production, où il n'y en a qu'un — mais en test les suites publient
    // toutes des noyaux, et un numéro tiré au hasard se fait dépasser. Le recrutement échouait
    // alors sur un noyau qui ne conçoit pas ce que la composition a proposé : trois fois sur
    // quatre, et pour une raison qui n'avait rien à voir avec ce qu'on vérifie ici.
    await sql.query(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', (select coalesce(max(version), 0) + 1 from employee_definition),
               $1::jsonb, $2::jsonb)`,
      [
        JSON.stringify({
          mission: "servir cette entreprise là où elle a le plus besoin de renfort",
          perimetre: ["ce que la configuration active"],
          limites: ["professions réglementées"],
        }),
        JSON.stringify(calibrage.capabilities),
      ],
    );

    // ══ 3. IL PAIE ═════════════════════════════════════════════════════════════════════════
    const [recrutement] = await sql.query<{ tenant_id: string; employee_id: string }>(
      "select * from recruter($1, $2, $3, $4, $5)",
      [
        reco?.id,
        "Menuiserie de la Rance",
        "start",
        `bac-a-sable-${randomUUID().slice(0, 8)}`,
        "dirigeant@menuiserie-rance.fr",
      ],
    );
    const tenantId = recrutement?.tenant_id as string;
    tenants.push(tenantId);

    // Sa Lady existe, et ses pouvoirs sont EXACTEMENT ceux de sa configuration.
    const ouvertes = await sql.query<{ key: string }>(
      `select c.key from employee_capability ec
         join capability c on c.id = ec.capability_id
        where ec.tenant_id = $1 and ec.enabled order by c.key`,
      [tenantId],
    );
    expect(ouvertes.map((r) => r.key).sort()).toEqual([...calibrage.capabilities].sort());

    // ══ 4. IL SE CONNECTE ══════════════════════════════════════════════════════════════════
    const acheteur = randomUUID();
    await sql.query("insert into auth.users (id) values ($1)", [acheteur]);
    const [rattachement] = await sql.query<{ rattacher_par_email: string | null }>(
      "select rattacher_par_email($1, $2)",
      [acheteur, "dirigeant@menuiserie-rance.fr"],
    );
    expect(rattachement?.rattacher_par_email).toBe(tenantId);

    // ══ 5. DU TRAVAIL S'OUVRE TOUT SEUL ════════════════════════════════════════════════════
    // Le client confie UN prospect. Une seule mission : « laquelle a été reprise ? » ne se pose
    // pas, et le test ne dépend pas de l'ordre de la file.
    await sql.query(
      `insert into lead (tenant_id, company_name, email, source, qualification)
       values ($1, $2, $3, 'import_client', 'qualifie')`,
      [tenantId, "Cabinet Rance", `contact-${randomUUID().slice(0, 8)}@exemple.fr`],
    );

    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
        journal: new PostgresJournalWriter(sql),
      },
      new Date(),
    );

    const missions = await sql.query<{ id: string }>(
      "select id from task where tenant_id = $1",
      [tenantId],
    );
    expect(missions.length).toBe(1);

    // La file est GLOBALE, et `prendre()` ne connaît pas les entreprises — c'est le comportement
    // voulu en production, et une source d'interférence entre suites.
    // La précondition est VÉRIFIÉE, pas supposée : exactement un travail, le sien. Sans ça, un
    // échec plus loin se lit « l'accord n'a pas abouti » alors que la cause est que l'exécutant a
    // pris autre chose — et l'enquête recommence à zéro.
    const seulDansLaFile = async () => {
      await sql.query("delete from job where tenant_id <> $1", [tenantId]);
      const [file] = await sql.query<{ miens: string; autres: string }>(
        `select count(*) filter (where tenant_id = $1)::text as miens,
                count(*) filter (where tenant_id <> $1)::text as autres
           from job`,
        [tenantId],
      );
      if (Number(file?.miens) !== 1 || Number(file?.autres) !== 0) {
        throw new Error(
          `File non déterministe avant exécution : ${file?.miens} travail(aux) à cette ` +
            `entreprise, ${file?.autres} à d'autres. Attendu 1 et 0.`,
        );
      }
    };

    // ══ 6. LADY PROPOSE, ET S'ARRÊTE POUR DEMANDER ═════════════════════════════════════════
    // Son autonomie vaut « confirm » : une action irréversible ne part pas sans une personne.
    reponses = [
      JSON.stringify({
        action: "agir",
        capacite: "envoyer.prospect",
        entree: { objet: "Votre chantier", corps: "Bonjour," },
        pourquoi: "premier contact",
      }),
    ];

    await seulDansLaFile();
    await executerLesTravauxDus(deps(), {
      prisPar: "répétition-générale",
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const [suspension] = await sql.query<{ n: string }>(
      "select count(*) as n from execution_event where tenant_id = $1 and kind = $2",
      [tenantId, POLITIQUE_SUSPEND],
    );
    expect(Number(suspension?.n)).toBe(1);
    expect(effets).toHaveLength(0); // rien n'est parti sans accord

    const [demande] = await sql.query<{ id: string }>(
      "select id from approval where tenant_id = $1 and state = 'requested'",
      [tenantId],
    );
    expect(demande?.id).toBeDefined();

    // ══ 7. IL ACCORDE, DEPUIS SON ESPACE ═══════════════════════════════════════════════════
    // Exactement ce que fait le bouton « Autoriser » : une mise à jour sous RLS, rien d'autre.
    await sql.query("update approval set state = 'granted', resolved_at = now() where id = $1", [
      demande?.id,
    ]);

    // ══ 8. L'ACTION S'EXÉCUTE ══════════════════════════════════════════════════════════════
    //
    // ⚠️ Aucune réponse de modèle n'est préparée ici, et c'est le cœur d'EXEC-11 : le runtime
    // n'a rien à redemander. Il exécute l'action que le client vient d'autoriser — pas « une
    // action de ce genre », celle-là. Si le modèle était rappelé, il en proposerait une autre
    // que la politique suspendrait de nouveau, et le client accorderait indéfiniment dans le vide.
    reponses = [];

    await seulDansLaFile();
    await executerLesTravauxDus(deps(), {
      prisPar: "répétition-générale",
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const chaine = (
      await sql.query<{ kind: string }>(
        "select kind from execution_event where tenant_id = $1 order by seq",
        [tenantId],
      )
    ).map((e) => e.kind);

    if (!chaine.includes(ACTION_EXECUTEE)) {
      throw new Error(`L'accord n'a pas abouti. Journal :\n  ${chaine.join(" → ")}`);
    }
    expect(chaine).toContain("accord_accorde");
    expect(effets).toHaveLength(1); // et cette fois, c'est parti — une fois

    // ══ 9. IL DÉCLARE UN RÉSULTAT ══════════════════════════════════════════════════════════
    // Le succès se mesure par rapport à l'objectif du dirigeant, jamais par une métrique technique.
    const [mission] = missions;
    await sql.query(
      `insert into outcome (tenant_id, task_id, kind, value, declared_by)
       values ($1, $2, 'sale', 3000, 'client')`,
      [tenantId, mission?.id],
    );

    const [resultats] = await sql.query<{ n: string }>(
      "select count(*) as n from outcome where tenant_id = $1",
      [tenantId],
    );
    expect(Number(resultats?.n)).toBe(1);
  });
});
