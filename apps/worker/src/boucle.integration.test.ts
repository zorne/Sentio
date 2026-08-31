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
 *   · **le moteur de capacité** — `qualifier.prospect` n'a pas encore de moteur dans
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
const CAPACITE = "qualifier.prospect";
/**
 * Une capacité connue du registre, applicable au même sujet (`lead`), mais JAMAIS activée pour
 * l'employé. C'est la seule forme qui atteigne le verrou « hors de la liste de cet employé » sans
 * être interceptée avant par le garde du contrat manquant.
 */
const CAPACITE_NON_ACTIVEE = "mettre_a_jour.prospect";

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
    // ⚠️ UN SECOND CONTRAT, ET IL A UNE RAISON PRÉCISE.
    //
    // Pour éprouver le verrou « capacité hors de la liste de cet employé », il faut une capacité
    // qui EXISTE au registre mais qui n'est PAS activée. Sans elle, proposer une capacité inconnue
    // ferait refuser par l'AUTRE garde — celui du contrat manquant, quelques lignes plus bas dans
    // `decideNextAction` — et le test passerait au vert sans jamais toucher le verrou qu'il vise.
    // Mesuré par mutation : c'est exactement ce qui se produisait.
    registry.registerContract({
      key: CAPACITE_NON_ACTIVEE,
      effectClass: "internal_write",
      description: "Consigner l'état d'une fiche.",
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
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, $2::jsonb, '["relancer.prospect","qualifier.prospect"]'::jsonb) returning id`,
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

  /**
   * L'heure SELON LA BASE.
   *
   * ⚠️ Ce n'est pas une coquetterie : c'est la cause d'un échec intermittent poursuivi sur trois
   * étapes. `job.next_run_at` reçoit le `now()` de Postgres ; `prendre()` compare
   * `next_run_at <= maintenant`, où `maintenant` venait de l'horloge du processus Node. Un
   * décalage d'une milliseconde entre les deux horloges suffit à rendre le travail « pas encore
   * dû » — l'exécutant ne prend rien, le journal reste vide, et le test échoue sur une assertion
   * qui n'a rien à voir avec ce qu'elle vérifie.
   *
   * En production le même décalage est sans conséquence : le battement suivant reprend le travail
   * quelques minutes plus tard. En test, il n'y a pas de battement suivant.
   */

  async function approvisionner(...tenantIds: TenantId[]): Promise<void> {
    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
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

  /** Proposer une capacité PRÉCISE — sert à éprouver le garde aval sur une capacité hors liste. */
  function proposerLaCapacite(cle: string, combien: number): void {
    reponses = Array.from({ length: combien }, () =>
      JSON.stringify({ action: "agir", capacite: cle, entree: {}, pourquoi: "essai du garde aval" }),
    );
  }

  function proposerUneAction(combien: number): void {
    reponses = Array.from({ length: combien }, () =>
      JSON.stringify({
        action: "agir",
        capacite: CAPACITE,
        // ⚠️ Vide, et c'est le sujet : depuis `attelage.ts`, le modèle ne nomme jamais la fiche
        // sur laquelle il agit. Elle vient de la mission.
        entree: {},
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
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    // ⚠️ `motifs` compte ce que le pas a PRODUIT, pas seulement qu'il est passé. Sans lui,
    // « traité » ne disait que « aucune exception levée » — un run reporté faute de fournisseur
    // conforme comptait donc comme un succès.
    expect(rapport).toMatchObject({ traites: 1, echoues: 0, motifs: { pas_suivant: 1 } });

    // ⚠️ Et le même détail RATTACHÉ À SON EMPLOYÉ : c'est ce que le compteur relit pour répondre
    // « du travail se fait-il ? » entreprise par entreprise. Les compteurs globaux ne le peuvent
    // pas : dix entreprises qui travaillent masquent la onzième qui ne travaille pas.
    expect(rapport.pas).toEqual([
      {
        tenantId,
        employeeId: expect.any(String),
        motif: "pas_suivant",
        manque: null,
        // Le run a bien exécuté une action : il n'a pas payé pour rien.
        aPayeSansRienProduire: false,
      },
    ]);

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
      const pris = await Promise.all([
        file.prendre({ pris_par: "A" }),
        autre.prendre({ pris_par: "B" }),
        file.prendre({ pris_par: "A" }),
        autre.prendre({ pris_par: "B" }),
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

    expect(await file.prendre({ pris_par: "A" })).not.toBeNull();
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
    expect(
      await bail.prendre({ pris_par: "mort" }),
    ).not.toBeNull();

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
      entree: {},
      pourquoi: "le même prospect, deux fois",
    });
    reponses = [meme, meme];

    for (let i = 0; i < 2; i++) {
      await executerLesTravauxDus(deps(), {
        prisPar: "exécutant-de-test",
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
    // ⚠️ CE CAS A DÛ ÊTRE RÉÉCRIT DEUX FOIS, ET LA SECONDE EST LA PLUS INSTRUCTIVE.
    //
    // Il recrutait d'abord SANS capacité. Le filtrage par capacité de l'approvisionnement l'a
    // rendu muet : plus aucune mission ne s'ouvrait. On a donc activé puis révoqué en vol.
    //
    // Puis le FILTRAGE PAR SUJET de `next-step` l'a rendu muet à son tour : une liste vide
    // s'arrête AVANT le modèle, en `capacite_absente`, et le garde aval n'était plus atteint. Le
    // test passait au vert pour la mauvaise raison — exactement le risque que ce filtre fait
    // courir : prendre silencieusement la place de la frontière qu'il devait seulement soulager.
    //
    // La forme juste est donc celle-ci : l'employé GARDE une capacité applicable (la liste n'est
    // pas vide, le filtre laisse passer), et le modèle en propose une AUTRE, non activée. C'est
    // le seul chemin qui atteint encore `decideNextAction` — et c'est le vrai scénario de
    // production, puisqu'un modèle peut toujours nommer ce qu'on ne lui a pas proposé.
    const { tenantId } = await entreprise({ prospects: 1, capaciteActive: true });
    await approvisionner(tenantId);
    proposerLaCapacite(CAPACITE_NON_ACTIVEE, 1);

    // ⚠️ Ce cas n'exécute QU'UN travail et vérifie que c'est le sien. Or la file est globale :
    // rien ne garantit que le travail pris soit celui de cette entreprise, et un reliquat d'un
    // cas précédent le faisait échouer par intermittence — mesuré le 2026-08-15 à 2 échecs sur 9
    // quand la suite tourne au sein de l'ensemble des paquets, 0 sur 16 quand elle tourne seule.
    //
    // On repousse donc les travaux des AUTRES entreprises au lieu de les supprimer : ce qu'ils
    // ont écrit reste intact, ils ne disputent simplement plus le tour. Un test qui échoue au
    // hasard ne vaut pas mieux qu'un test qui ne teste rien — on ne relance pas jusqu'au vert.
    await sql.query("update job set next_run_at = now() + interval '1 hour' where tenant_id <> $1", [
      tenantId,
    ]);

    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    // ⚠️ Diagnostic avant assertion. Ce cas a déjà échoué sur un journal vide, et « vide » a
    // deux causes très différentes : soit la mission n'a jamais été ouverte, soit elle l'a été
    // mais l'exécutant a pris le travail d'un autre. Les distinguer ici évite de rejouer
    // l'enquête à chaque occurrence — un test instable qu'on ne sait pas lire se contourne au
    // lieu de se corriger.
    const mission = await laMission(tenantId);
    expect(mission, "aucune mission ouverte : l'approvisionnement a refusé").toBeDefined();

    const chaine = await natures(tenantId, mission);
    expect(chaine, "journal vide : l'exécutant a pris le travail d'une autre entreprise").toContain(
      "politique_refuse",
    );
    expect(chaine).not.toContain("action_engagee");
    expect(effets).toHaveLength(0);
  });

  it("⭐ aucune capacité applicable : la mission s'ARRÊTE avant le modèle, et dit ce qui manque", async () => {
    // ⚠️ LE CAS QUE LE FILTRAGE PAR SUJET A CRÉÉ, ET QU'IL DOIT DONC FERMER LUI-MÊME.
    //
    // Filtrer la liste rend possible qu'elle devienne vide. Livrer le filtre en laissant ce cas
    // ouvert aurait introduit un mode de défaillance silencieux dans le lot même qui prétend en
    // fermer un.
    //
    // Trois choses se vérifient ici, et la troisième est la plus importante :
    //   · AUCUN appel au modèle — on ne paie pas pour une liste vide ;
    //   · l'état est `needs_attention`, jamais `failed` — le dirigeant PEUT y remédier ;
    //   · le motif nomme le sujet et ce qui est activé, pour que le futur canal d'alerte ait
    //     quelque chose d'utile à acheminer plutôt qu'un « ça a échoué ».
    effets = [];
    const { tenantId, employeeId } = await entreprise({ prospects: 1, capaciteActive: true });
    await approvisionner(tenantId);
    // On retire la seule capacité applicable : la liste filtrée devient vide.
    await sql.query(
      "update employee_capability set enabled = false where tenant_id = $1 and employee_id = $2",
      [tenantId, employeeId],
    );

    const appelsAvant = appelsAuModele;
    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const mission = await laMission(tenantId);
    const chaine = await natures(tenantId, mission);
    expect(chaine, "journal vide : l'exécutant a pris le travail d'une autre entreprise").toContain(
      "attention_requise",
    );
    expect(chaine).not.toContain("proposition_recue");
    expect(chaine).not.toContain("action_engagee");
    expect(appelsAuModele).toBe(appelsAvant);
    expect(effets).toHaveLength(0);

    const [etat] = await sql.query<{ state: string }>("select state from task where id = $1", [mission]);
    expect(etat?.state).toBe("needs_attention");

    const [evenement] = await sql.query<{ payload: Record<string, unknown> }>(
      `select payload from execution_event
        where tenant_id = $1 and task_id = $2 and kind = 'attention_requise'
        order by seq desc limit 1`,
      [tenantId, mission],
    );
    expect(String(evenement?.payload["detail"])).toContain("lead");

    // ⚠️ LA CAUSE, ET PAS SEULEMENT LE MOTIF. Le motif est unifié pour la reprise ; c'est la cause
    // qui décide À QUI l'on parle. Ici le dirigeant peut activer l'outil : elle doit le dire.
    expect(evenement?.payload["cause"]).toBe("capacite_non_activee");
  });

  it("⭐ même arrêt, mais la cause dit que le manque est CHEZ NOUS", async () => {
    // ⚠️ LE CAS 9 — DEUX MANQUES SOUS UN SEUL MOTIF, ET DEUX DESTINATAIRES.
    //
    // Ici la capacité applicable EST activée : le dirigeant a fait son travail. C'est le moteur
    // qui manque, et le monter est un déploiement — le nôtre. Le motif reste `capacite_absente`,
    // parce que la reprise traite les deux de la même façon : ce sont deux attentes qu'une même
    // relance résout. Mais la cause diffère, et c'est elle qui empêche d'envoyer le dirigeant
    // chercher un bouton qui n'existe pas.
    effets = [];
    const { tenantId, employeeId } = await entreprise({ prospects: 1, capaciteActive: true });
    await approvisionner(tenantId);

    // La seule capacité activée devient une capacité applicable au sujet que ce registre ne sert
    // PAS. La liste applicable n'est donc pas vide ; la liste autorisée, si.
    await sql.query(
      "update employee_capability set enabled = false where tenant_id = $1 and employee_id = $2",
      [tenantId, employeeId],
    );
    await sql.query(
      `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
       select $1, $2, c.id, true from capability c where c.key = 'envoyer.prospect'
       on conflict (employee_id, capability_id) do update set enabled = true`,
      [tenantId, employeeId],
    );

    const appelsAvant = appelsAuModele;
    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const mission = await laMission(tenantId);
    const [evenement] = await sql.query<{ payload: Record<string, unknown> }>(
      `select payload from execution_event
        where tenant_id = $1 and task_id = $2 and kind = 'attention_requise'
        order by seq desc limit 1`,
      [tenantId, mission],
    );

    expect(evenement?.payload["motif"], "la reprise doit continuer à trouver ce motif").toBe(
      "capacite_absente",
    );
    expect(evenement?.payload["cause"]).toBe("moteur_non_monte");
    // Toujours aucun appel payant : on s'arrête avant le modèle dans les deux cas.
    expect(appelsAuModele).toBe(appelsAvant);
  });

  it("⭐ une capacité SANS MOTEUR n'est jamais proposée — aucun appel payant n'est brûlé", async () => {
    // ⚠️ CE CAS ÉCONOMISE UN APPEL FACTURÉ, ET IL A ÉTÉ CONÇU EN LE MESURANT.
    //
    // `envoyer.prospect` peut être activée pour l'employé sans qu'aucun moteur ne la serve — c'est
    // exactement l'état de la production aujourd'hui (`composition.ts` ne la monte pas). Avant ce
    // filtre : elle passait, le modèle la proposait — appel facturé —, puis `engineFor` échouait
    // et la mission mourait en `failed`, terminale, son prospect exclu du vivier pour toujours.
    //
    // ⚠️ Et la question se pose au REGISTRE DE CET HÔTE, jamais à `capability.disponible`. Ce test
    // le prouve : `qualifier.prospect` reste proposée parce que CE registre la sert, quoi que dise
    // la colonne — un hôte qui monte ses propres moteurs ne doit pas voir son travail écarté.
    effets = [];
    const { tenantId, employeeId } = await entreprise({ prospects: 1, capaciteActive: true });
    await approvisionner(tenantId);

    // On active AUSSI une capacité qu'aucun moteur de ce registre ne sert.
    await sql.query(
      `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
       select $1, $2, c.id, true from capability c where c.key = 'envoyer.prospect'
       on conflict (employee_id, capability_id) do update set enabled = true`,
      [tenantId, employeeId],
    );

    // Le modèle propose la capacité sans moteur. Elle ne devrait même pas lui être offerte.
    proposerLaCapacite("envoyer.prospect", 1);

    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const mission = await laMission(tenantId);
    const chaine = await natures(tenantId, mission);

    // La proposition a bien eu lieu — la mission n'est pas bloquée, `qualifier.prospect` reste
    // proposable — mais `envoyer.prospect` a été REFUSÉE sans qu'aucun moteur ne soit approché.
    expect(chaine).toContain("politique_refuse");
    expect(chaine).not.toContain("action_engagee");
    expect(effets).toHaveLength(0);
  });

  it("MUTATION — une mission créée HORS approvisionnement est refusée si la capacité n'est pas activée", async () => {
    // ⚠️ DÉFENSE EN PROFONDEUR, ET LE TEST QUI LA GARDE.
    //
    // L'approvisionnement écarte désormais en amont tout travail qu'aucune capacité activée ne
    // sert. C'est une ÉCONOMIE — ne pas ouvrir une mission vouée à l'échec —, jamais une
    // frontière de sécurité. La frontière reste ici, au moment d'agir : `next-step` relit les
    // capacités à chaque pas et `decideNextAction` refuse ce qui n'y figure pas.
    //
    // Le cas est donc construit en contournant totalement l'approvisionnement — exactement ce que
    // ferait un script de reprise, un futur gisement, ou un chemin qu'on n'a pas encore écrit. La
    // capacité n'a JAMAIS été activée pour cet employé : ce n'est pas une révocation en vol (cas
    // du test précédent), c'est une mission qui n'aurait jamais dû exister.
    effets = [];
    // La capacité activée reste `qualifier.prospect` : la liste filtrée n'est donc pas vide et le
    // filtre amont laisse passer. Le modèle propose `envoyer.prospect`, jamais activée — seul le
    // garde aval peut la refuser.
    const { tenantId, employeeId } = await entreprise({ prospects: 1, capaciteActive: true });

    const [prospect] = await sql.query<{ id: string }>(
      "select id from lead where tenant_id = $1 limit 1",
      [tenantId],
    );
    const [mission] = await sql.query<{ id: string }>(
      `insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id, state)
       select $1, $2, (select o.id from objective o where o.tenant_id = $1 and o.state = 'actif'),
              'lead', $3, 'pending'
       returning id`,
      [tenantId, employeeId, prospect?.id],
    );
    await sql.query("insert into job (tenant_id, task_id, priority) values ($1, $2, 0)", [
      tenantId,
      mission?.id,
    ]);

    // Même précaution que le cas précédent : la file est globale, on écarte le travail des autres.
    await sql.query("update job set next_run_at = now() + interval '1 hour' where tenant_id <> $1", [
      tenantId,
    ]);
    proposerLaCapacite(CAPACITE_NON_ACTIVEE, 1);

    await executerLesTravauxDus(deps(), {
      prisPar: "exécutant-de-test",
      dataClass: "synthetic",
      maxTravaux: 1,
    });

    const chaine = await natures(tenantId, mission?.id as string);
    expect(chaine, "journal vide : l'exécutant a pris le travail d'une autre entreprise").toContain(
      "politique_refuse",
    );
    expect(chaine).not.toContain("action_engagee");
    expect(effets).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // L'ÉCHÉANCE — quelle horloge tranche, et pourquoi ce n'est pas celle du processus.
  //
  // ⚠️ CE CAS EST DÉTERMINISTE, ET IL REPRODUIT UN DÉFAUT QUI NE L'ÉTAIT PAS.
  //
  // `repetition-generale` échouait une fois sur quatre : l'accord du dirigeant était écrit, et
  // l'action n'arrivait jamais. Cause mesurée : `next_run_at` est posé par Postgres en
  // MICROsecondes, et un `Date` JS n'en garde que la milliseconde. L'aller-retour rabotait
  // jusqu'à 999 µs, donc un travail tout juste inséré redevenait « pas encore dû ».
  //
  // Ici, on force la microseconde au lieu de l'attendre : `next_run_at` porte 500 µs au-delà de
  // sa milliseconde. Le défaut cesse d'être une course et devient un fait vérifiable.
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐⭐ prend un travail dû à 500 µs près — la base tranche, pas l'horloge du processus", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    const file = new PostgresFileDeTravaux(sql);

    // Une échéance à 500 µs au-delà de sa milliseconde, dans le passé : elle est DUE.
    const [pose] = await sql.query<{ echeance: Date }>(
      `update job
          set next_run_at = date_trunc('milliseconds', now()) + interval '500 microseconds'
                            - interval '1 second'
        where tenant_id = $1
       returning next_run_at as echeance`,
      [tenantId],
    );
    expect(pose?.echeance).toBeDefined();

    // Ce que l'application aurait comparé : la même échéance, rabotée à la milliseconde. Elle
    // devient ANTÉRIEURE de 500 µs — donc « pas encore due ».
    const rabotee = new Date(pose!.echeance.getTime());

    // ⚠️ L'ANCIEN COMPORTEMENT, reproduit exprès : avec cet instant, le travail est manqué.
    expect(await file.prendre({ pris_par: "horloge-du-processus", maintenant: rabotee })).toBeNull();

    // ⭐ Sans instant, la base compare ses propres microsecondes : le travail est pris.
    const pris = await file.prendre({ pris_par: "horloge-de-la-base" });
    expect(pris).not.toBeNull();
    expect(pris!.tenantId).toBe(tenantId);
  });

  it("un instant CHOISI reste honoré — l'horloge injectable n'a pas disparu", async () => {
    const { tenantId } = await entreprise({ prospects: 1 });
    await approvisionner(tenantId);
    const file = new PostgresFileDeTravaux(sql);

    // Une heure avant l'échéance : rien n'est dû, et c'est le test qui le décide.
    const uneHeureAvant = new Date(Date.now() - 3_600_000);
    expect(await file.prendre({ pris_par: "voyageur", maintenant: uneHeureAvant })).toBeNull();

    // Le même travail, sans instant imposé : dû.
    expect(await file.prendre({ pris_par: "maintenant" })).not.toBeNull();
  });
});
