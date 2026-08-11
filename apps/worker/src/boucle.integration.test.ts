import { randomUUID } from "node:crypto";

import { DEFAULT_FEATURE_FLAGS, REGLAGES_RUNTIME_PAR_DEFAUT } from "@sentio/config";
import {
  ACTION_EXECUTEE,
  CONTEXTE_ASSEMBLE,
  CapabilityRegistry,
  ModelGateway,
  PolicyEngine,
  RUN_DEMARRE,
  RUN_REPORTE,
  type ModelProvider,
} from "@sentio/core";
import { ExecutionJournal, TenantScope } from "@sentio/db";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import type { EmployeeId, TenantId } from "@sentio/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresApprovisionnementStore, RegistreDeGisementsParMetier } from "@sentio/runtime";
import { PostgresApprovalStore } from "@sentio/runtime";
import { PostgresEffectLedger } from "@sentio/runtime";
import { PostgresFileDeTravaux } from "@sentio/runtime";
import { PostgresJournalWriter } from "@sentio/runtime";
import { PostgresUsageLedger } from "@sentio/runtime";
import { PostgresMoteurs } from "@sentio/runtime";
import { approvisionnerLeJour } from "@sentio/runtime";
import { executerLesTravauxDus, type BoucleDeps } from "@sentio/runtime";

/**
 * EXEC-12 — la boucle complète, contre un **vrai** Postgres.
 *
 * ⚠️ Ce fichier est le seul endroit où l'on vérifie que Sentio **tourne** : approvisionnement,
 * file, verrou, état relu, contexte, proposition, politique, effet, journal, suite. Tout le reste
 * teste une pièce ; ici on teste la machine.
 *
 * ══ CE QUI EST FAUX, ET POURQUOI C'EST LE BON CHOIX ══
 *
 *   · **le fournisseur de modèle** — un vrai appel rendrait le test lent, payant, non
 *     reproductible, et ferait transiter des données vers un tiers depuis une suite de tests.
 *     Le Gateway, lui, est le VRAI : routage, enveloppes, plafonds et comptage sont exercés.
 *   · **le moteur de capacité** — `qualifier_un_prospect` n'a pas encore de moteur dans
 *     `packages/capabilities` (voir le compte rendu). Le faux est enregistré sous la même clé de
 *     moteur (`base`) que la liaison réelle en base : c'est donc bien `capability_binding` qui
 *     le résout, pas le test.
 *
 * Tout le reste est réel : les tables, les index, les verrous, les transactions.
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

/** La capacité que l'employé propose dans ces tests : écriture interne, donc pas de suspension. */
const CAPACITE = "qualifier_un_prospect";

describeIfDatabase("EXEC-12 — la boucle complète", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];
  /** Ce que le faux moteur a réellement exécuté, dans l'ordre. */
  let effets: unknown[] = [];
  /** Ce que le faux fournisseur répondra au prochain appel. */
  let reponses: string[] = [];
  let appelsAuModele = 0;

  const fournisseur: ModelProvider = {
    key: "faux-conforme",
    dataPolicy: "no_train",
    async complete() {
      appelsAuModele += 1;
      const texte = reponses.shift() ?? JSON.stringify({ action: "terminer", pourquoi: "fini" });
      return { turn: { role: "assistant", type: "text", text: texte }, tokens: 12 };
    },
  };

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    // Le comptage d'enveloppe écrit dans `provider_quota`, dont la clé étrangère exige un
    // fournisseur déclaré. Le faux en est un : il doit exister en base comme les vrais.
    await sql.query(
      `insert into provider_credential (provider_key, data_policy, opt_out_proven_at, enabled)
       values ($1, 'no_train', now(), true)
       on conflict (provider_key) do nothing`,
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

  // La file est GLOBALE : sans ce nettoyage, un test prendrait le travail laissé par le
  // précédent, et « quelle mission a été prise ? » cesserait d'être déterministe. Les suites de
  // ce composant s'exécutent en série (`vitest.config.ts`), donc vider la file est sans effet de
  // bord sur les autres.
  beforeEach(async () => {
    await sql.query("delete from job", []);
  });

  function registre(): CapabilityRegistry {
    const registry = new CapabilityRegistry();
    registry.registerContract({
      key: CAPACITE,
      effectClass: "internal_write",
      description: "Vérifier qu'un prospect correspond à ce que le client vend.",
    });
    registry.registerEngine({
      // Même clé de moteur que la liaison semée par la migration de l'ADN Commercial : c'est
      // `capability_binding` qui le choisit, pas ce test.
      engineKey: "base",
      capabilityKey: CAPACITE,
      execute: async (input: unknown) => {
        effets.push(input);
        return { qualification: "qualifie", raison: "correspond à la cible déclarée" };
      },
    });
    return registry;
  }

  function deps(client: PostgresClient = sql): BoucleDeps {
    const journal = new PostgresJournalWriter(client);
    const registry = registre();
    const gateway = new ModelGateway({
      providers: [fournisseur],
      ledger: new PostgresUsageLedger(client),
      journal,
      flags: { ...DEFAULT_FEATURE_FLAGS, inferenceOptOutProven: true },
      // Aucun lissage de débit : le test ne doit pas attendre une minute entre deux pas.
      clock: { now: () => new Date(), sleep: async () => undefined },
      providerLimits: { requestsPerMinute: 100_000, tokensPerMonth: 1_000_000_000 },
    });
    const moteurs = new PostgresMoteurs(client, registry);

    return {
      sql: client,
      file: new PostgresFileDeTravaux(client),
      journal,
      gateway,
      policy: new PolicyEngine(new PostgresApprovalStore(client), journal),
      registry,
      ledger: new PostgresEffectLedger(client),
      moteurPour: (tenantId, capabilityKey) => moteurs.pour(tenantId, capabilityKey),
    };
  }

  /** Une entreprise prête à travailler : abonnement, objectif, employé, capacité, prospects. */
  async function entreprise(
    options: { prospects?: number; capaciteActive?: boolean } = {},
  ): Promise<{ tenantId: TenantId; employeeId: EmployeeId }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise EXEC-12"]);
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
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, $2::jsonb) returning id`,
      [
        versionUnique(),
        JSON.stringify({
          profession: "commercial",
          mission: "trouver des entreprises à qui vendre",
          perimetre: ["qualifier", "écrire"],
          limites: ["comptabilité", "juridique"],
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

    if (options.capaciteActive !== false) {
      await sql.query(
        `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
         select $1, $2, c.id, true from capability c where c.key = $3`,
        [tenantId, employee?.id, CAPACITE],
      );
    }

    for (let i = 0; i < (options.prospects ?? 0); i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Prospect ${i}`, `p${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }

    return { tenantId: tenantId as TenantId, employeeId: employee?.id as EmployeeId };
  }

  async function approvisionner(...tenantIds: TenantId[]): Promise<void> {
    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsParMetier.commercial(sql),
        journal: new PostgresJournalWriter(sql),
      },
      new Date(),
    );
    // ⚠️ L'approvisionnement est GLOBAL : il ouvre du travail pour tous les employés, y compris
    // ceux laissés par une autre suite. La file l'est aussi, et `prendre()` ne connaît pas les
    // entreprises — c'est le comportement voulu en production, et une source d'intermittence en
    // test : « quelle mission a été prise ? » cessait d'être déterministe une fois sur trois.
    // On ne garde donc dans la file que le travail de CETTE entreprise.
    await sql.query(
      `delete from job where task_id in (select id from task where tenant_id <> all($1::uuid[]))`,
      [tenantIds],
    );

    // Garde-fou du test lui-même : sans mission, tout ce qui suit ne prouverait rien.
    const [n] = await sql.query<{ n: string }>(
      "select count(*) as n from task where tenant_id = any($1::uuid[])",
      [tenantIds],
    );
    expect(Number(n?.n)).toBeGreaterThan(0);
  }

  async function natures(tenantId: TenantId, taskId: string): Promise<string[]> {
    const journal = new ExecutionJournal(sql, TenantScope.of(tenantId));
    return (await journal.forTask(taskId)).map((evenement) => evenement.kind);
  }

  async function laMission(tenantId: TenantId): Promise<string> {
    const [tache] = await sql.query<{ id: string }>(
      "select id from task where tenant_id = $1 order by created_at limit 1",
      [tenantId],
    );
    return tache?.id as string;
  }

  function proposerUneAction(combien: number): void {
    reponses = Array.from({ length: combien }, () =>
      JSON.stringify({
        action: "agir",
        capacite: CAPACITE,
        entree: { lead_id: randomUUID() },
        pourquoi: "ce prospect correspond à la cible déclarée",
      }),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // La boucle, de bout en bout
  // ═══════════════════════════════════════════════════════════════════════════

  it("va de la file au journal : verrou, démarrage, contexte, proposition, politique, effet, suite", async () => {
    effets = [];
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    proposerUneAction(1);

    const rapport = await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      maintenant: new Date(),
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    expect(rapport).toEqual({ traites: 1, echoues: 0 });

    // La chaîne complète est au journal, dans l'ordre, et `run_demarre` ouvre la marche.
    const chaine = await natures(tenantId, await laMission(tenantId));
    expect(chaine[0]).toBe(RUN_DEMARRE);
    expect(chaine).toContain(CONTEXTE_ASSEMBLE);
    expect(chaine).toContain("proposition_recue");
    expect(chaine).toContain("politique_allow");
    expect(chaine).toContain("action_engagee");
    expect(chaine).toContain(ACTION_EXECUTEE);

    // L'effet a réellement traversé `capability_binding` jusqu'au moteur.
    expect(effets).toHaveLength(1);

    // Et le travail est de nouveau dû, verrou rendu : le pas suivant peut être pris.
    const [travail] = await sql.query<{ locked_by: string | null; next_run_at: Date }>(
      `select j.locked_by, j.next_run_at from job j
         join task t on t.id = j.task_id where t.tenant_id = $1`,
      [tenantId],
    );
    expect(travail?.locked_by).toBeNull();
    expect(travail?.next_run_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("n'écrit `run_demarre` qu'une seule fois, quel que soit le nombre de pas", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    proposerUneAction(3);

    for (let i = 0; i < 3; i++) {
      await executerLesTravauxDus(deps(), {
        prisPar: "exécutant-de-test",
        maintenant: new Date(),
        dataClass: "synthetic",
        maxTravaux: 1,
      });
    }

    const chaine = await natures(tenantId, await laMission(tenantId));
    expect(chaine.filter((kind) => kind === RUN_DEMARRE)).toHaveLength(1);
    // Trois pas : trois contextes assemblés. Le journal est la preuve, pas un compteur en mémoire.
    expect(chaine.filter((kind) => kind === CONTEXTE_ASSEMBLE)).toHaveLength(3);
  });

  it("referme le cycle au budget de pas, et repose l'échéance à la cadence", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    proposerUneAction(REGLAGES_RUNTIME_PAR_DEFAUT.pasMaximumParRun + 2);

    for (let i = 0; i < REGLAGES_RUNTIME_PAR_DEFAUT.pasMaximumParRun; i++) {
      await executerLesTravauxDus(deps(), {
        prisPar: "exécutant-de-test",
        maintenant: new Date(),
        dataClass: "synthetic",
        maxTravaux: 1,
      });
    }

    const chaine = await natures(tenantId, await laMission(tenantId));
    expect(chaine).toContain(RUN_REPORTE);

    const [travail] = await sql.query<{ next_run_at: Date }>(
      `select j.next_run_at from job j join task t on t.id = j.task_id where t.tenant_id = $1`,
      [tenantId],
    );
    // Demain, pas tout de suite : le cycle du jour est fini.
    expect(travail!.next_run_at.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it("s'arrête proprement quand le modèle juge le travail fini", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    reponses = [JSON.stringify({ action: "terminer", pourquoi: "plus rien à faire ici" })];

    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      maintenant: new Date(),
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const [tache] = await sql.query<{ state: string }>(
      "select state from task where tenant_id = $1",
      [tenantId],
    );
    expect(tache?.state).toBe("done");

    const [restant] = await sql.query<{ n: string }>(
      `select count(*) as n from job j join task t on t.id = j.task_id where t.tenant_id = $1`,
      [tenantId],
    );
    expect(Number(restant?.n)).toBe(0);
  });

  it("ne rappelle jamais le modèle quand rien n'est dû", async () => {
    const avant = appelsAuModele;
    const rapport = await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      // Une heure dans le passé : rien n'est encore dû.
      maintenant: new Date(Date.now() - 3600_000),
      dataClass: "synthetic",
    });
    expect(rapport.traites).toBe(0);
    expect(appelsAuModele).toBe(avant);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Concurrence, reprise, idempotence
  // ═══════════════════════════════════════════════════════════════════════════

  it("MUTATION — deux exécutants simultanés ne prennent jamais le même travail", async () => {
    const { tenantId } = await entreprise({ prospects: 4 });
    await approvisionner(tenantId);

    const second = createPostgresClient(connectionString as string);
    try {
      const file = new PostgresFileDeTravaux(sql);
      const autre = new PostgresFileDeTravaux(second);
      const maintenant = new Date();

      const pris = await Promise.all([
        file.prendre({ pris_par: "A", maintenant }),
        autre.prendre({ pris_par: "B", maintenant }),
        file.prendre({ pris_par: "A", maintenant }),
        autre.prendre({ pris_par: "B", maintenant }),
      ]);

      const identifiants = pris.filter((t) => t !== null).map((t) => t!.taskId);
      // Quatre prises, quatre missions distinctes : `skip locked` a fait son travail.
      expect(new Set(identifiants).size).toBe(identifiants.length);
      expect(identifiants.length).toBeGreaterThan(1);
    } finally {
      await second.close();
    }
  });

  it("MUTATION — un travail verrouillé est invisible tant que le bail court", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    const file = new PostgresFileDeTravaux(sql);
    const maintenant = new Date();

    expect(await file.prendre({ pris_par: "A", maintenant })).not.toBeNull();
    // Le second passage ne le revoit pas : le bail n'a pas expiré.
    const [deuxieme] = await sql.query<{ n: string }>(
      `select count(*) as n from job j join task t on t.id = j.task_id
        where t.tenant_id = $1 and j.locked_by = 'A'`,
      [tenantId],
    );
    expect(Number(deuxieme?.n)).toBe(1);
  });

  it("MUTATION — un exécutant mort ne bloque pas un travail : le bail expire et la reprise se compte", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);

    // Un exécutant prend le travail… puis meurt. Le verrou n'est jamais rendu.
    const bail = new PostgresFileDeTravaux(sql, 10);
    expect(await bail.prendre({ pris_par: "mort", maintenant: new Date() })).not.toBeNull();

    // Onze minutes plus tard, un autre le reprend — et compte la reprise.
    const plusTard = new Date(Date.now() + 11 * 60 * 1000);
    const repris = await bail.prendre({ pris_par: "vivant", maintenant: plusTard });
    expect(repris).not.toBeNull();
    expect(repris!.reprises).toBe(1);
    expect(repris!.tenantId).toBe(tenantId);
  });

  it("MUTATION — une mission qui tue l'exécutant est confiée à un humain, pas rejouée sans fin", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);

    // On simule des reprises déjà comptées : c'est exactement ce que laisse une mission qui fait
    // tomber l'exécutant à chaque tentative.
    await sql.query(
      `update job set attempts = $2
        from task t where t.id = job.task_id and t.tenant_id = $1`,
      [tenantId, REGLAGES_RUNTIME_PAR_DEFAUT.repriseMaxApresInterruption],
    );

    const avant = appelsAuModele;
    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      maintenant: new Date(),
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    // Aucun appel payant : la mission est écartée AVANT le modèle.
    expect(appelsAuModele).toBe(avant);

    const [tache] = await sql.query<{ state: string }>(
      "select state from task where tenant_id = $1",
      [tenantId],
    );
    expect(tache?.state).toBe("needs_attention");

    const [signale] = await sql.query<{ n: string }>(
      "select count(*) as n from intervention_requise where tenant_id = $1",
      [tenantId],
    );
    expect(Number(signale?.n)).toBe(1);
  });

  it("MUTATION — le même effet n'est jamais produit deux fois, même en rejouant le pas", async () => {
    effets = [];
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);

    // La MÊME entrée deux fois : même clé d'idempotence, donc un seul effet réel.
    const meme = JSON.stringify({
      action: "agir",
      capacite: CAPACITE,
      entree: { lead_id: "6f0f6b8e-0000-4000-8000-000000000001" },
      pourquoi: "le même prospect, deux fois",
    });
    reponses = [meme, meme];

    for (let i = 0; i < 2; i++) {
      await executerLesTravauxDus(deps(), {
        prisPar: "exécutant-de-test",
        maintenant: new Date(),
        dataClass: "synthetic",
        maxTravaux: 1,
      });
    }

    // Deux pas, deux propositions identiques — un seul appel de moteur. C'est l'index unique de
    // `execution_event` qui l'a tranché, pas un `if` de ce code.
    expect(effets).toHaveLength(1);

    const chaine = await natures(tenantId, await laMission(tenantId));
    expect(chaine.filter((kind) => kind === "action_engagee")).toHaveLength(1);
  });

  it("MUTATION — la file est remise d'accord avec le journal quand elle le contredit", async () => {
    // L'état laissé par un exécutant tué juste après le journal, avant la file.
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    const taskId = await laMission(tenantId);
    const journal = new ExecutionJournal(sql, TenantScope.of(tenantId));
    const [employe] = await sql.query<{ employee_id: string }>(
      "select employee_id from task where id = $1",
      [taskId],
    );
    await journal.append({
      taskId,
      employeeId: employe?.employee_id as string,
      kind: RUN_DEMARRE,
      idempotencyKey: null,
    });
    await journal.append({
      taskId,
      employeeId: employe?.employee_id as string,
      kind: "run_termine",
      idempotencyKey: null,
    });

    const avant = appelsAuModele;
    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      maintenant: new Date(),
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    // Le journal fait foi : aucun modèle appelé, et la file cesse de porter ce travail.
    expect(appelsAuModele).toBe(avant);
    const [restant] = await sql.query<{ n: string }>(
      `select count(*) as n from job j join task t on t.id = j.task_id where t.tenant_id = $1`,
      [tenantId],
    );
    expect(Number(restant?.n)).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Isolation
  // ═══════════════════════════════════════════════════════════════════════════

  it("MUTATION — deux entreprises traversent la même boucle sans jamais se mélanger", async () => {
    effets = [];
    const a = await entreprise({ prospects: 2 });
    const b = await entreprise({ prospects: 2 });
    // Un seul appel : l'approvisionnement est global, il sert les deux entreprises à la fois.
    await approvisionner(a.tenantId, b.tenantId);
    proposerUneAction(8);

    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      maintenant: new Date(),
      dataClass: "synthetic",
      maxTravaux: 8,
    });

    // Aucun événement de journal ne porte la tâche d'une autre entreprise.
    const [croises] = await sql.query<{ n: string }>(
      `select count(*) as n from execution_event e
         join task t on t.id = e.task_id
        where e.tenant_id <> t.tenant_id`,
      [],
    );
    expect(Number(croises?.n)).toBe(0);

    // Et chaque entreprise a bien travaillé pour elle-même.
    for (const tenantId of [a.tenantId, b.tenantId]) {
      const [n] = await sql.query<{ n: string }>(
        `select count(*) as n from execution_event
          where tenant_id = $1 and kind = $2`,
        [tenantId, CONTEXTE_ASSEMBLE],
      );
      expect(Number(n?.n)).toBeGreaterThan(0);
    }
  });

  it("refuse une capacité que le client n'a pas activée, sans appeler aucun moteur", async () => {
    effets = [];
    const { tenantId } = await entreprise({ prospects: 1, capaciteActive: false });
    await approvisionner(tenantId);
    proposerUneAction(1);

    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      maintenant: new Date(),
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const chaine = await natures(tenantId, await laMission(tenantId));
    expect(chaine).toContain("politique_refuse");
    expect(chaine).not.toContain("action_engagee");
    expect(effets).toHaveLength(0);
  });
});
