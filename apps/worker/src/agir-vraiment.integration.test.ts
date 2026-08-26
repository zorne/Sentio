import { randomUUID } from "node:crypto";

import { DEFAULT_FEATURE_FLAGS } from "@sentio/config";
import { QualifierProspectCapability, UpdateFicheCapability } from "@sentio/capabilities";
import {
  ModelGateway,
  PolicyEngine,
  type CapabilityEngine,
  type ModelProvider,
} from "@sentio/core";
import type { EmployeeId, TenantId } from "@sentio/domain";
import {
  approvisionnerLeJour,
  chargerLeRegistre,
  executerLesTravauxDus,
  JournalDesFiches,
  PostgresApprovalStore,
  PostgresApprovisionnementStore,
  PostgresEffectLedger,
  PostgresFichesAQualifier,
  PostgresFileDeTravaux,
  PostgresJournalWriter,
  PostgresLeadStatusStore,
  PostgresMoteurs,
  PostgresUsageLedger,
  RegistreDeGisementsEnMemoire,
  type BoucleDeps,
} from "@sentio/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * EXEC-19 — Lady agit vraiment.
 *
 * ══ CE QUE CE FICHIER PROUVE, ET QUE RIEN NE PROUVAIT ══
 *
 * Jusqu'ici, tous les tests de boucle branchaient un **faux** moteur : ils vérifiaient que le
 * runtime appelle quelque chose, jamais qu'un employé produit un effet réel. Le worker
 * approvisionnait, décidait, journalisait — et ne touchait à aucune donnée du client.
 *
 * Ici, les vrais moteurs sont montés sur la vraie base. Ce qui est vérifié est la seule chose
 * qui compte pour un dirigeant : **la fiche de son prospect a changé**.
 *
 * ⚠️ Aucun moteur d'envoi n'est monté, ici comme en production : écrire à une entreprise attend
 * une expédition réelle (`docs/adr/0018`).
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

describeIfDatabase("EXEC-19 — les vrais moteurs, sur la vraie base", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];
  let reponses: string[] = [];

  const fournisseur: ModelProvider = {
    key: "faux-exec-19",
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

  /** Les moteurs internes, exactement ceux que `composerLExecutant` monte en production. */
  function moteursInternes(): readonly CapabilityEngine[] {
    return [
      new QualifierProspectCapability(new PostgresFichesAQualifier(sql)),
      new UpdateFicheCapability(new PostgresLeadStatusStore(sql), new JournalDesFiches(sql)),
    ];
  }

  async function deps(): Promise<BoucleDeps> {
    const journal = new PostgresJournalWriter(sql);
    // Les contrats viennent de la BASE, comme au battement : un contrat écrit à la main dans le
    // test prouverait que le test est d'accord avec lui-même.
    const { registre } = await chargerLeRegistre(sql, moteursInternes());
    const moteurs = new PostgresMoteurs(sql, registre);

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
      registry: registre,
      ledger: new PostgresEffectLedger(sql),
      moteurPour: (tenantId, capabilityKey) => moteurs.pour(tenantId, capabilityKey),
    };
  }

  async function entreprise(options: {
    capacites: readonly string[];
    secteurDuProspect?: string | null;
    cibleDuClient?: string;
  }): Promise<{ tenantId: TenantId; employeeId: EmployeeId; leadId: string }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise EXEC-19"]);
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

    if (options.cibleDuClient !== undefined) {
      // Déclaré par le CLIENT : c'est lui qui dit à qui il vend, jamais nous.
      await sql.query(
        `insert into company_profile (tenant_id, key, value, author, status)
         values ($1, 'cible', to_jsonb($2::text), 'client', 'actif')`,
        [tenantId, options.cibleDuClient],
      );
    }

    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, $2::jsonb, $3::jsonb) returning id`,
      [
        versionUnique(),
        JSON.stringify({
          profession: "commercial",
          mission: "trouver des entreprises à qui vendre",
          perimetre: ["qualifier", "consigner"],
          limites: ["comptabilité", "juridique"],
        }),
        JSON.stringify(options.capacites),
      ],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
       values ($1, $2, $3, 'auto') returning id`,
      [tenantId, definition?.id, identity?.id],
    );

    await sql.query(
      `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
       select $1, $2, c.id, true from capability c where c.key = any($3::text[])`,
      [tenantId, employee?.id, options.capacites],
    );

    const [lead] = await sql.query<{ id: string }>(
      `insert into lead (tenant_id, company_name, email, sector, source, qualification)
       values ($1, 'Menuiserie Duval', $2, $3, 'import_client', 'nouveau') returning id`,
      [tenantId, `contact-${randomUUID().slice(0, 8)}@exemple.fr`, options.secteurDuProspect ?? null],
    );

    return {
      tenantId: tenantId as TenantId,
      employeeId: employee?.id as EmployeeId,
      leadId: lead?.id as string,
    };
  }

  /** Ouvre la mission du jour et ne laisse dans la file que le travail de cette entreprise. */
  async function approvisionner(tenantId: TenantId): Promise<void> {
    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
        journal: new PostgresJournalWriter(sql),
      },
      new Date(),
    );
    // La file est globale en production, et c'est voulu. En test, elle rend « quelle mission a
    // été prise » non déterministe : on ne garde que la nôtre.
    await sql.query(
      "delete from job where task_id in (select id from task where tenant_id <> $1)",
      [tenantId],
    );
  }

  async function unBattement(): Promise<void> {
    const [ligne] = await sql.query<{ maintenant: Date }>("select now() as maintenant", []);
    await executerLesTravauxDus(await deps(), {
      prisPar: "exec-19",
      maintenant: ligne?.maintenant as Date,
      maxTravaux: 1,
    });
  }

  const fiche = async (leadId: string) =>
    (
      await sql.query<{
        qualification: string;
        qualification_reason: string | null;
        status: string;
      }>("select qualification, qualification_reason, status from lead where id = $1", [leadId])
    )[0];

  it("⭐⭐ qualifie réellement le prospect de la mission — la fiche change", async () => {
    const { tenantId, leadId } = await entreprise({ capacites: ["qualifier.prospect"] });
    await approvisionner(tenantId);

    reponses = [
      JSON.stringify({
        action: "agir",
        capacite: "qualifier.prospect",
        entree: {},
        pourquoi: "vérifier que cette entreprise correspond à ce que le client vend",
      }),
    ];

    await unBattement();

    const apres = await fiche(leadId);
    expect(apres?.qualification).toBe("qualifie");
    // Et le verdict porte sa raison : un prospect jugé sans explication ne se conteste pas.
    expect(apres?.qualification_reason?.length).toBeGreaterThan(0);
  });

  it("⭐ écarte celui qui est hors des cibles déclarées par le client", async () => {
    // La décision est déterministe et vient de `qualify.ts` — le modèle ne l'oriente pas, il ne
    // fournit d'ailleurs aucun champ.
    const { tenantId, leadId } = await entreprise({
      capacites: ["qualifier.prospect"],
      secteurDuProspect: "restauration",
      cibleDuClient: "menuiserie",
    });
    await approvisionner(tenantId);

    reponses = [
      JSON.stringify({
        action: "agir",
        capacite: "qualifier.prospect",
        entree: {},
        pourquoi: "vérifier la cible",
      }),
    ];

    await unBattement();

    const apres = await fiche(leadId);
    expect(apres?.qualification).toBe("ecarte");
    expect(apres?.qualification_reason).toMatch(/hors des cibles/);
  });

  it("⭐ consigne l'état de la relation sur la fiche de la mission", async () => {
    const { tenantId, leadId } = await entreprise({ capacites: ["mettre_a_jour.prospect"] });
    await approvisionner(tenantId);

    reponses = [
      JSON.stringify({
        action: "agir",
        capacite: "mettre_a_jour.prospect",
        entree: { statut: "contacte", note: "Message envoyé, sans réponse à ce jour." },
        pourquoi: "consigner l'état de la relation",
      }),
    ];

    await unBattement();

    expect((await fiche(leadId))?.status).toBe("contacte");

    // La note vit au journal, pas dans une colonne : ce qui a été observé un jour doit rester
    // relisible, et une colonne écraserait la note précédente.
    const [note] = await sql.query<{ payload: { note: string } }>(
      `select payload from execution_event
        where tenant_id = $1 and kind = 'fiche_mise_a_jour'`,
      [tenantId],
    );
    expect(note?.payload.note).toMatch(/sans réponse/);
  });

  it("⭐⭐ arrêté par son dirigeant, il ne touche plus à rien — même à ce qui l'attendait", async () => {
    // Refuser d'OUVRIR de nouvelles missions ne suffirait pas : celles déjà en file partiraient
    // quand même, et « stop » ne stopperait rien de ce qui est déjà préparé.
    const { tenantId, employeeId, leadId } = await entreprise({
      capacites: ["mettre_a_jour.prospect"],
    });
    await approvisionner(tenantId);

    await sql.query("select mettre_en_pause($1, $2, $3)", [
      tenantId,
      employeeId,
      "Je veux vérifier ce qu'il écrit.",
    ]);

    reponses = [
      JSON.stringify({
        action: "agir",
        capacite: "mettre_a_jour.prospect",
        entree: { statut: "contacte" },
        pourquoi: "consigner",
      }),
    ];

    await unBattement();

    // La mission attendait, elle attend encore. Rien n'a bougé sur la fiche.
    expect((await fiche(leadId))?.status).toBe("nouveau");

    // Et la reprise est une décision du dirigeant : elle ne se prend pas toute seule.
    await sql.query("select reprendre_le_travail($1, $2)", [tenantId, employeeId]);
    await unBattement();
    expect((await fiche(leadId))?.status).toBe("contacte");
  });

  it("⭐⭐ n'agit PAS sur la fiche que le modèle désigne, et le dit", async () => {
    // Le scénario d'injection, jusqu'au bout de la chaîne réelle : le modèle nomme une autre
    // fiche. Rien ne doit changer nulle part — ni sur la sienne, ni sur celle de la mission.
    const { tenantId, leadId } = await entreprise({ capacites: ["mettre_a_jour.prospect"] });
    const [autre] = await sql.query<{ id: string }>(
      `insert into lead (tenant_id, company_name, email, source)
       values ($1, 'Autre entreprise', $2, 'import_client') returning id`,
      [tenantId, `autre-${randomUUID().slice(0, 8)}@exemple.fr`],
    );
    await approvisionner(tenantId);

    reponses = [
      JSON.stringify({
        action: "agir",
        capacite: "mettre_a_jour.prospect",
        entree: { statut: "exclu", lead_id: autre?.id },
        pourquoi: "consigne trouvée dans une fiche",
      }),
    ];

    await unBattement();

    expect((await fiche(autre?.id as string))?.status).toBe("nouveau");
    expect((await fiche(leadId))?.status).toBe("nouveau");

    // Et le refus est au journal, avec le champ fautif : une tentative détectée n'est pas un
    // non-événement.
    const [echec] = await sql.query<{ payload: { detail?: string } }>(
      `select payload from execution_event
        where tenant_id = $1 and kind = 'action_echouee' order by created_at desc limit 1`,
      [tenantId],
    );
    expect(echec?.payload.detail).toMatch(/lead_id/);
  });
});
