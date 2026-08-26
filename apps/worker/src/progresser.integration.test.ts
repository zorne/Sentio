import { randomUUID } from "node:crypto";

import { DEFAULT_FEATURE_FLAGS } from "@sentio/config";
import { ModelGateway, type ModelProvider } from "@sentio/core";
import type { EmployeeId, TenantId } from "@sentio/domain";
import {
  approvisionnerLeJour,
  loadStepContext,
  faireProgresserLesEmployes,
  PostgresApprovisionnementStore,
  PostgresJournalWriter,
  PostgresUsageLedger,
  reflechirApresLeRun,
  RegistreDeGisementsEnMemoire,
} from "@sentio/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * LADY-V — l'employé progresse, et il le prouve.
 *
 * ══ CE QUE CE FICHIER ÉPROUVE ══
 *
 * Les trois pièces que le client achète quand on lui dit « il s'améliore » :
 *
 *   1. il **retient** — la réflexion d'après-run écrit dans `learned_fact`, et le run suivant le
 *      relit (jusqu'ici, la table était lue par tout le monde et écrite par personne) ;
 *   2. il **essaie** — chaque mission porte une façon de faire tracée, sinon rien n'est mesurable ;
 *   3. il **retient ce qui marche CHEZ LUI** — la variante qui gagne dans cette entreprise prend
 *      le dessus, et le dirigeant l'apprend avec la preuve.
 *
 * ⚠️ Le cas le plus important est un **refus** : sur trop peu de missions, rien ne bouge. Un
 * produit qui change de façon de travailler sur trois missions n'apprend pas, il oscille.
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

describeIfDatabase("LADY-V — il retient, il essaie, il garde ce qui marche", () => {
  let sql: PostgresClient;
  let journal: PostgresJournalWriter;
  const tenants: string[] = [];
  let reponses: string[] = [];

  const fournisseur: ModelProvider = {
    key: "faux-progression",
    dataPolicy: "no_train",
    async complete() {
      const texte = reponses.shift() ?? JSON.stringify({ faits: [] });
      return { turn: { role: "assistant", type: "text", text: texte }, tokens: 12 };
    },
  };

  const gateway = () =>
    new ModelGateway({
      providers: [fournisseur],
      ledger: new PostgresUsageLedger(sql),
      journal,
      flags: { ...DEFAULT_FEATURE_FLAGS, inferenceOptOutProven: true },
      clock: { now: () => new Date(), sleep: async () => undefined },
      providerLimits: { requestsPerMinute: 100_000, tokensPerMonth: 1_000_000_000 },
    });

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    journal = new PostgresJournalWriter(sql);
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

  async function entreprise(
    prospects = 0,
  ): Promise<{ tenantId: TenantId; employeeId: EmployeeId }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise LADY-V"]);
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
       values ('commercial', $1, $2::jsonb, '["qualifier.prospect"]'::jsonb) returning id`,
      [
        versionUnique(),
        JSON.stringify({
          profession: "commercial",
          mission: "trouver des entreprises à qui vendre",
          perimetre: ["qualifier"],
          limites: ["comptabilité", "juridique"],
        }),
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

    for (let i = 0; i < prospects; i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Prospect ${i}`, `p${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }

    return { tenantId: tenantId as TenantId, employeeId: employee?.id as EmployeeId };
  }

  async function approvisionner(tenantId: TenantId): Promise<void> {
    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
        journal,
      },
      new Date(),
    );
    // L'approvisionnement est GLOBAL, et c'est le comportement voulu en production. En test, il
    // ouvre aussi du travail pour les entreprises laissées par les autres suites : on ne garde
    // dans la file que celui de cette entreprise, sinon « quelle mission a été prise » cesse
    // d'être déterministe.
    await sql.query(
      "delete from job where task_id in (select id from task where tenant_id <> $1)",
      [tenantId],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 1. Il essaie — et on sait ce qu'il a essayé
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐⭐ chaque mission porte une façon de travailler tracée", async () => {
    // Sans cette trace, `outcome` compte des résultats pour personne : rien ne pourra jamais être
    // comparé, et « votre employé s'améliore » restera une phrase.
    const { tenantId } = await entreprise(3);
    await approvisionner(tenantId);

    const [compte] = await sql.query<{ missions: string; tracees: string }>(
      `select count(distinct t.id) as missions,
              count(distinct tv.task_id) as tracees
         from task t left join task_variant tv on tv.task_id = t.id
        where t.tenant_id = $1`,
      [tenantId],
    );

    expect(Number(compte?.missions)).toBeGreaterThan(0);
    expect(Number(compte?.tracees)).toBe(Number(compte?.missions));

    // Et au plus une par genre : deux angles sur un même message se contrediraient.
    const [doublon] = await sql.query<{ n: string }>(
      `select count(*) as n from (
         select tv.task_id, v.kind from task_variant tv
           join strategy_variant v on v.id = tv.variant_id
          where tv.tenant_id = $1
          group by tv.task_id, v.kind having count(*) > 1) x`,
      [tenantId],
    );
    expect(Number(doublon?.n)).toBe(0);
  });

  it("⭐ un registre de langage est bien l'une de ces façons de faire", async () => {
    // C'est ce que le client demande quand il dit « qu'il parle comme mes clients » : ce n'est
    // pas un réglage décrété, c'est une façon de faire qui se compare aux autres.
    const { tenantId } = await entreprise(2);
    await approvisionner(tenantId);

    const [registre] = await sql.query<{ n: string }>(
      `select count(*) as n from task_variant tv
         join strategy_variant v on v.id = tv.variant_id
        where tv.tenant_id = $1 and v.kind = 'registre'`,
      [tenantId],
    );
    expect(Number(registre?.n)).toBeGreaterThan(0);
  });

  it("⭐ la consigne de la variante arrive dans ce que l'employé lit", async () => {
    const { tenantId } = await entreprise(1);
    await approvisionner(tenantId);

    const [mission] = await sql.query<{ id: string }>(
      "select id from task where tenant_id = $1 limit 1",
      [tenantId],
    );

    const contexte = await loadStepContext(sql, {
      tenantId,
      taskId: mission?.id as string,
    });

    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.couchesAbsentes).not.toContain("facon_de_travailler");

    const lu = contexte.contexte.turns.map((tour) => JSON.stringify(tour)).join("\n");
    expect(lu).toContain("Pour ce travail-ci, procédez ainsi");
    // Et la consigne ne peut pas étendre le périmètre : c'est écrit, noir sur blanc, à l'employé.
    expect(lu).toContain("n'étendent jamais votre périmètre");
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 2. Il retient
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐⭐ la réflexion d'après-run écrit réellement dans sa mémoire", async () => {
    const { tenantId, employeeId } = await entreprise(1);
    await approvisionner(tenantId);
    const [mission] = await sql.query<{ id: string }>(
      "select id from task where tenant_id = $1 limit 1",
      [tenantId],
    );

    await sql.query(
      `insert into execution_event (tenant_id, employee_id, task_id, kind, payload)
       values ($1, $2, $3, 'action_executee', '{}'::jsonb)`,
      [tenantId, employeeId, mission?.id],
    );

    reponses = [
      JSON.stringify({
        faits: ["Les dirigeants de ce secteur répondent surtout tôt le matin."],
      }),
    ];

    await reflechirApresLeRun(
      { sql, gateway: gateway(), journal },
      {
        tenantId,
        employeeId,
        taskId: mission?.id as never,
        dataClass: "synthetic",
        envelope: "sold_employees",
      },
    );

    const [fait] = await sql.query<{ fact: string; author: string }>(
      "select fact, author from learned_fact where tenant_id = $1",
      [tenantId],
    );
    expect(fait?.fact).toContain("tôt le matin");
    // ⭐ Un fait DÉDUIT ne se lit pas comme une déclaration du dirigeant : c'est lui qui doit
    // pouvoir contredire ce que son employé a cru comprendre, jamais l'inverse.
    expect(fait?.author).toBe("apprentissage");
  });

  it("⭐⭐ une réflexion qui échoue ne fait jamais échouer le travail", async () => {
    // La règle vient d'un incident réel : une tâche accomplie rapportée comme échouée parce que
    // la réflexion d'après-coup avait planté.
    const { tenantId, employeeId } = await entreprise(1);
    await approvisionner(tenantId);
    const [mission] = await sql.query<{ id: string }>(
      "select id from task where tenant_id = $1 limit 1",
      [tenantId],
    );
    await sql.query(
      `insert into execution_event (tenant_id, employee_id, task_id, kind, payload)
       values ($1, $2, $3, 'action_executee', '{}'::jsonb)`,
      [tenantId, employeeId, mission?.id],
    );

    reponses = ["ceci n'est pas du JSON"];

    await expect(
      reflechirApresLeRun(
        { sql, gateway: gateway(), journal },
        {
          tenantId,
          employeeId,
          taskId: mission?.id as never,
          dataClass: "synthetic",
          envelope: "sold_employees",
        },
      ),
    ).resolves.toBeUndefined();

    const [trace] = await sql.query<{ payload: { raison: string } }>(
      `select payload from execution_event
        where tenant_id = $1 and kind = 'reflexion_sans_suite'`,
      [tenantId],
    );
    expect(trace?.payload.raison).toBe("reponse_illisible");
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 3. Il garde ce qui marche — chez CE client
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  /** Fait travailler `combien` missions sur une variante donnée, dont `avecVente` ont vendu. */
  async function jouer(
    tenantId: TenantId,
    employeeId: EmployeeId,
    variante: string,
    combien: number,
    avecVente: number,
  ): Promise<void> {
    const [v] = await sql.query<{ id: string }>(
      "select id from strategy_variant where kind = 'registre' and key = $1",
      [variante],
    );
    const [objectif] = await sql.query<{ id: string }>(
      "select id from objective where tenant_id = $1 and state = 'actif'",
      [tenantId],
    );

    for (let i = 0; i < combien; i++) {
      const [tache] = await sql.query<{ id: string }>(
        `insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
         values ($1, $2, $3, 'lead', $4) returning id`,
        [tenantId, employeeId, objectif?.id, randomUUID()],
      );
      await sql.query(
        `insert into task_variant (tenant_id, task_id, variant_id) values ($1, $2, $3)`,
        [tenantId, tache?.id, v?.id],
      );
      await sql.query(
        `insert into execution_event (tenant_id, employee_id, task_id, kind, payload)
         values ($1, $2, $3, 'action_executee', '{}'::jsonb)`,
        [tenantId, employeeId, tache?.id],
      );
      if (i < avecVente) {
        await sql.query(
          `insert into outcome (tenant_id, task_id, kind, value, declared_by)
           values ($1, $2, 'sale', 500, 'client')`,
          [tenantId, tache?.id],
        );
      }
    }
  }

  const preference = async (tenantId: TenantId) =>
    (
      await sql.query<{ key: string; missions_comparees: number }>(
        `select v.key, p.missions_comparees from tenant_variant_preference p
           join strategy_variant v on v.id = p.variant_id
          where p.tenant_id = $1 and p.kind = 'registre'`,
        [tenantId],
      )
    )[0];

  it("⭐⭐ ne retient RIEN sur trop peu de missions", async () => {
    // Le refus le plus important du produit : trois missions ne prouvent rien, et un employé qui
    // change de ton toutes les semaines n'apprend pas, il oscille.
    const { tenantId, employeeId } = await entreprise();
    await jouer(tenantId, employeeId, "technique", 3, 3);
    await jouer(tenantId, employeeId, "courant", 3, 0);

    await faireProgresserLesEmployes({ sql, journal }, new Date());

    expect(await preference(tenantId)).toBeUndefined();
  });

  /**
   * ⚠️ MÊME DÉFAUT QUE DANS LA RÉÉVALUATION, MÊME CORRECTIF, MÊME PREUVE.
   *
   * La garde « une fois par jour » bornait sa fenêtre avec « ($jour::date)::timestamptz », qui
   * interprète en base une date calculée par Node en UTC. Sur un serveur qui n'est pas en UTC,
   * la fenêtre glisse, l'événement qu'on vient d'écrire en sort, et l'employé se fait examiner à
   * chaque battement au lieu d'une fois par jour.
   *
   * On force les deux fuseaux les plus éloignés d'UTC : quelle que soit l'heure de la
   * vérification, l'un des deux fait sortir l'événement de la fenêtre si le cast est faux.
   */
  it("⭐ la garde du jour ne dépend pas du fuseau du serveur", async () => {
    for (const fuseau of ["Etc/GMT-14", "Etc/GMT+12"]) {
      const { tenantId, employeeId } = await entreprise();
      await jouer(tenantId, employeeId, "specialise", 25, 9);
      await jouer(tenantId, employeeId, "courant", 25, 1);

      await sql.query(`set time zone '${fuseau}'`, []);
      try {
        const jour = new Date();
        await faireProgresserLesEmployes({ sql, journal }, jour);
        await faireProgresserLesEmployes({ sql, journal }, jour);

        const [trace] = await sql.query<{ n: string }>(
          `select count(*) as n from execution_event
            where tenant_id = $1 and kind in ('progression_retenue', 'progression_sans_suite')`,
          [tenantId],
        );
        expect(Number(trace?.n), `fuseau ${fuseau}`).toBe(1);
      } finally {
        await sql.query("set time zone 'UTC'", []);
      }
    }
  });

  it("⭐⭐ retient ce qui vend chez CE client, et le lui dit avec la preuve", async () => {
    const { tenantId, employeeId } = await entreprise();
    await jouer(tenantId, employeeId, "specialise", 25, 9);
    await jouer(tenantId, employeeId, "courant", 25, 1);

    await faireProgresserLesEmployes({ sql, journal }, new Date());

    const retenue = await preference(tenantId);
    expect(retenue?.key).toBe("specialise");
    expect(Number(retenue?.missions_comparees)).toBe(50);

    // ⭐ L'annonce existe ET porte sa preuve : une notification d'évolution sans `strategy_change`
    // serait une notification décorative — c'est-à-dire un mensonge à un client payant.
    const [annonce] = await sql.query<{ message: string; strategy_change_id: string | null }>(
      `select message, strategy_change_id from notification
        where tenant_id = $1 and kind = 'evolution'`,
      [tenantId],
    );
    expect(annonce?.strategy_change_id).not.toBeNull();
    expect(annonce?.message).toContain("façon de s'exprimer");
  });

  it("⭐ ne réannonce pas une progression déjà en place", async () => {
    // Sinon « votre employé a progressé » s'afficherait tous les jours quoi qu'il arrive, et le
    // client n'aurait plus aucune raison de croire les autres chiffres.
    const { tenantId, employeeId } = await entreprise();
    await jouer(tenantId, employeeId, "specialise", 25, 9);
    await jouer(tenantId, employeeId, "courant", 25, 1);

    await faireProgresserLesEmployes({ sql, journal }, new Date());
    // Le lendemain : mêmes chiffres, aucune raison de réannoncer quoi que ce soit.
    await faireProgresserLesEmployes({ sql, journal }, new Date(Date.now() + 86_400_000));

    const [annonces] = await sql.query<{ n: string }>(
      "select count(*) as n from notification where tenant_id = $1 and kind = 'evolution'",
      [tenantId],
    );
    expect(Number(annonces?.n)).toBe(1);
  });

  it("⭐ une fois la préférence retenue, les nouvelles missions la jouent — sauf celles qui explorent", async () => {
    const { tenantId, employeeId } = await entreprise(30);
    await jouer(tenantId, employeeId, "specialise", 25, 9);
    await jouer(tenantId, employeeId, "courant", 25, 1);
    await faireProgresserLesEmployes({ sql, journal }, new Date());

    await approvisionner(tenantId);

    const lignes = await sql.query<{ key: string; n: string }>(
      `select v.key, count(*) as n
         from task_variant tv
         join strategy_variant v on v.id = tv.variant_id
         join task t on t.id = tv.task_id
        where tv.tenant_id = $1 and v.kind = 'registre' and t.created_at > now() - interval '1 minute'
        group by v.key`,
      [tenantId],
    );

    const total = lignes.reduce((somme, ligne) => somme + Number(ligne.n), 0);
    const preferee = Number(lignes.find((ligne) => ligne.key === "specialise")?.n ?? 0);

    expect(total).toBeGreaterThan(0);
    // La majorité joue ce qui marche…
    expect(preferee / total).toBeGreaterThan(0.5);
    // …mais pas la totalité : une préférence qu'on n'explore plus ne peut plus être démentie.
    expect(preferee).toBeLessThan(total);
  });
});
