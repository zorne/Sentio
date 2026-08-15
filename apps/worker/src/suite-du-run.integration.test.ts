import { randomUUID } from "node:crypto";

import { REGLAGES_RUNTIME_PAR_DEFAUT } from "@sentio/config";
import {
  ACCORD_ACCORDE,
  ATTENTION_REQUISE,
  CONTEXTE_ASSEMBLE,
  NATURES_INTERVENTION_HUMAINE,
  POLITIQUE_SUSPEND,
  RUN_DEMARRE,
  RUN_TERMINE,
  deciderLaSuite,
  reconstruireEtatRun,
  type EtatRun,
} from "@sentio/core";
import { ExecutionJournal, TenantScope } from "@sentio/db";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresFileDeTravaux } from "@sentio/runtime";
import { PostgresJournalWriter } from "@sentio/runtime";
import { appliquerLaSuite } from "@sentio/runtime";

/**
 * EXEC-08 — la suite d'un run contre un **vrai** Postgres.
 *
 * ⚠️ Pourquoi ces cas ne peuvent pas être unitaires.
 *
 *   · La vue `intervention_requise` EST la mécanique testée. Un double la contredirait toujours :
 *     ce qu'on veut prouver, c'est qu'un `distinct on … order by seq desc` rend bien le DERNIER
 *     événement d'une tâche, et qu'un événement postérieur fait sortir la ligne **par
 *     construction** — sans qu'aucun code n'ait à penser à l'effacer.
 *   · La contrainte de `task.state` est tenue par la base. Un test applicatif qui écrirait
 *     « needs_attention » dans un objet ne prouverait rien de la migration.
 *   · La duplication assumée entre le vocabulaire TypeScript et la liste SQL de la vue ne se
 *     vérifie qu'en lisant la définition réelle de la vue dans le catalogue.
 *
 * Ces tests ne s'exécutent que si `DATABASE_URL` est fournie, et échouent bruyamment si
 * l'intégration est exigée sans base — même garde que les autres suites de ce composant.
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

describeIfDatabase("EXEC-08 — replanifier, terminer, ou appeler un humain", () => {
  let sql: PostgresClient;
  const tenantId = randomUUID() as TenantId;
  let employeeId: EmployeeId;
  let journal: ExecutionJournal;
  let file: PostgresFileDeTravaux;
  let ecrivain: PostgresJournalWriter;

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise EXEC-08"]);
    // Une mission sert toujours un objectif (`20260815120002`).
    await sql.query(
      "insert into objective (tenant_id, metric, target_value, horizon) values ($1, 'chiffre_affaires', 5000, 'mois')",
      [tenantId],
    );
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [versionUnique()],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    employeeId = employee?.id as EmployeeId;

    journal = new ExecutionJournal(sql, TenantScope.of(tenantId));
    file = new PostgresFileDeTravaux(sql);
    ecrivain = new PostgresJournalWriter(sql);
  });

  afterAll(async () => {
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
      await tx.query("delete from tenant where id = $1", [tenantId]);
    });
    await sql.close();
  });

  /** Une tâche neuve, déjà inscrite dans la file et verrouillée comme le ferait un battement. */
  async function tacheEnCours(): Promise<TaskId> {
    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id, state) " +
        "values ($1, $2, (select o.id from objective o where o.tenant_id = $1 and o.state = 'actif'), 'lead', gen_random_uuid(), 'in_progress') returning id",
      [tenantId, employeeId],
    );
    const taskId = task?.id as TaskId;
    await sql.query(
      `insert into job (tenant_id, task_id, locked_at, locked_by) values ($1, $2, now(), 'battement-test')`,
      [tenantId, taskId],
    );
    return taskId;
  }

  async function etatDuTravail(taskId: TaskId) {
    const [tache] = await sql.query<{ state: string }>(
      "select state from task where tenant_id = $1 and id = $2",
      [tenantId, taskId],
    );
    const [travail] = await sql.query<{ next_run_at: Date; locked_by: string | null }>(
      "select next_run_at, locked_by from job where tenant_id = $1 and task_id = $2",
      [tenantId, taskId],
    );
    return { etatTache: tache?.state, travail };
  }

  async function etatDuRun(taskId: TaskId): Promise<EtatRun> {
    const resultat = reconstruireEtatRun(await journal.forTask(taskId));
    if (!resultat.ok) throw new Error(`journal incohérent : ${JSON.stringify(resultat.anomalies)}`);
    return resultat.etat;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // La file
  // ───────────────────────────────────────────────────────────────────────────

  it("rend le verrou quand le travail continue : sans ça, la tâche disparaît des exécutants", async () => {
    const taskId = await tacheEnCours();

    await appliquerLaSuite(
      { journal: ecrivain, file },
      {
        tenantId,
        taskId,
        employeeId,
        suite: {
          kind: "poursuivre",
          motif: "pas_suivant",
          quand: new Date(),
          pasRestants: 9,
          nature: null,
          detail: "…",
        },
      },
    );

    const { etatTache, travail } = await etatDuTravail(taskId);
    expect(etatTache).toBe("in_progress");
    // Le verrou pris par le battement est rendu : sans ça, la tâche resterait invisible aux
    // exécutants jusqu'à ce qu'un nettoyage de verrous périmés la libère.
    expect(travail?.locked_by).toBeNull();
  });

  it("reporte à la cadence quand le budget de pas est épuisé, sans terminer le run", async () => {
    const taskId = await tacheEnCours();
    await journal.append({ taskId, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });
    for (let i = 0; i < REGLAGES_RUNTIME_PAR_DEFAUT.pasMaximumParRun; i++) {
      await journal.append({ taskId, employeeId, kind: CONTEXTE_ASSEMBLE, idempotencyKey: null });
    }

    const avant = await etatDuRun(taskId);
    expect(avant.pasDuCycle).toBe(REGLAGES_RUNTIME_PAR_DEFAUT.pasMaximumParRun);

    const maintenant = new Date();
    const suite = deciderLaSuite({
      issue: {
        kind: "decision",
        decision: {
          kind: "agir",
          proposition: {
            kind: "action",
            capabilityKey: "prospects.qualifier",
            input: {},
            rationale: "…",
          },
          decision: { outcome: "allow", notify: false, basis: "sans_effet_exterieur" },
        },
        execution: { kind: "execute", resultat: {}, cle: "lecture:1" },
      },
      etat: avant,
      reglages: REGLAGES_RUNTIME_PAR_DEFAUT,
      maintenant,
    });

    await appliquerLaSuite({ journal: ecrivain, file }, { tenantId, taskId, employeeId, suite });

    const { travail } = await etatDuTravail(taskId);
    // Le travail est toujours dans la file — reporté, pas retiré — et dû à la cadence suivante.
    expect(travail).toBeDefined();
    expect(travail!.next_run_at.getTime() - maintenant.getTime()).toBeGreaterThan(23 * 60 * 60 * 1000);

    // Et l'état relu dit « en cours » avec un budget rouvert : le lendemain reprend le travail
    // là où il s'est arrêté, sans rien perdre.
    const apres = await etatDuRun(taskId);
    expect(apres.phase).toBe("en_cours");
    expect(apres.pasDuCycle).toBe(0);
  });

  it("retire de la file un run terminé, et marque la tâche faite", async () => {
    const taskId = await tacheEnCours();
    await journal.append({ taskId, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });

    await appliquerLaSuite(
      { journal: ecrivain, file },
      {
        tenantId,
        taskId,
        employeeId,
        suite: {
          kind: "terminer",
          motif: "travail_acheve",
          issue: "termine",
          nature: RUN_TERMINE,
          detail: "objectif du jour atteint",
        },
      },
    );

    const { etatTache, travail } = await etatDuTravail(taskId);
    expect(etatTache).toBe("done");
    expect(travail).toBeUndefined();
    expect((await etatDuRun(taskId)).phase).toBe("termine");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // L'état qu'EXEC-14 doit pouvoir lire
  // ───────────────────────────────────────────────────────────────────────────

  it("sort de la file SANS échéance un run qui attend une personne", async () => {
    const taskId = await tacheEnCours();
    await journal.append({ taskId, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });

    await appliquerLaSuite(
      { journal: ecrivain, file },
      {
        tenantId,
        taskId,
        employeeId,
        suite: {
          kind: "attendre_humain",
          motif: "verification_humaine",
          nature: ATTENTION_REQUISE,
          detail: "issue inconnue sur un envoi",
        },
      },
    );

    const { etatTache, travail } = await etatDuTravail(taskId);
    expect(etatTache).toBe("needs_attention");
    // ⚠️ LE point : aucune ligne de file, donc aucune échéance. Un run bloqué ne repart pas tout
    // seul — c'est ce qu'on promet au client, et c'est la base qui le tient.
    expect(travail).toBeUndefined();
    expect((await etatDuRun(taskId)).phase).toBe("attention_requise");
  });

  it("apparaît dans `intervention_requise`, qu'il s'agisse d'un accord ou d'un incident", async () => {
    const attente = await tacheEnCours();
    await journal.append({ taskId: attente, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });
    await journal.append({
      taskId: attente,
      employeeId,
      kind: POLITIQUE_SUSPEND,
      idempotencyKey: null,
      payload: { capacite: "prospects.envoyer_message" },
    });

    const incident = await tacheEnCours();
    await journal.append({ taskId: incident, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });
    await journal.append({
      taskId: incident,
      employeeId,
      kind: ATTENTION_REQUISE,
      idempotencyKey: null,
      payload: { motif: "verification_humaine" },
    });

    const lignes = await sql.query<{ task_id: string; motif: string }>(
      "select task_id, motif from intervention_requise where tenant_id = $1",
      [tenantId],
    );
    const parTache = new Map(lignes.map((l) => [l.task_id, l.motif]));

    expect(parTache.get(attente)).toBe(POLITIQUE_SUSPEND);
    expect(parTache.get(incident)).toBe(ATTENTION_REQUISE);
  });

  it("disparaît de la vue dès qu'un événement postérieur arrive — personne n'a à l'effacer", async () => {
    const taskId = await tacheEnCours();
    await journal.append({ taskId, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });
    await journal.append({ taskId, employeeId, kind: POLITIQUE_SUSPEND, idempotencyKey: null, payload: {} });

    const bloque = await sql.query<{ task_id: string }>(
      "select task_id from intervention_requise where tenant_id = $1 and task_id = $2",
      [tenantId, taskId],
    );
    expect(bloque).toHaveLength(1);

    await journal.append({ taskId, employeeId, kind: ACCORD_ACCORDE, idempotencyKey: null });

    const debloque = await sql.query<{ task_id: string }>(
      "select task_id from intervention_requise where tenant_id = $1 and task_id = $2",
      [tenantId, taskId],
    );
    // Rien n'a été supprimé ni mis à jour : la vue est une projection du dernier événement, et
    // c'est pour ça qu'elle ne peut pas se désynchroniser.
    expect(debloque).toHaveLength(0);
  });

  it("ne signale pas un run qui avance, ni un run terminé", async () => {
    const enCours = await tacheEnCours();
    await journal.append({ taskId: enCours, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });
    await journal.append({ taskId: enCours, employeeId, kind: CONTEXTE_ASSEMBLE, idempotencyKey: null });

    const fini = await tacheEnCours();
    await journal.append({ taskId: fini, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });
    await journal.append({ taskId: fini, employeeId, kind: RUN_TERMINE, idempotencyKey: null });

    const lignes = await sql.query<{ task_id: string }>(
      "select task_id from intervention_requise where tenant_id = $1 and task_id = any($2)",
      [tenantId, [enCours, fini]],
    );
    expect(lignes).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // La duplication assumée entre le vocabulaire et la vue
  // ───────────────────────────────────────────────────────────────────────────

  it("garde la vue et le vocabulaire d'accord — une vue ne peut pas importer du TypeScript", async () => {
    const [vue] = await sql.query<{ definition: string }>(
      "select pg_get_viewdef('public.intervention_requise'::regclass, true) as definition",
      [],
    );
    const definition = vue?.definition ?? "";

    for (const nature of NATURES_INTERVENTION_HUMAINE) {
      expect(definition).toContain(`'${nature}'`);
    }

    // Et rien d'autre : une nature ajoutée à la vue sans l'être au vocabulaire produirait des
    // notifications qu'aucun code ne sait expliquer.
    const citees = [...definition.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1] as string);
    expect([...new Set(citees)].sort()).toEqual([...NATURES_INTERVENTION_HUMAINE].sort());
  });

  it("laisse la base refuser un état de tâche qui n'existe pas", async () => {
    const taskId = await tacheEnCours();
    await expect(
      sql.query("update task set state = 'bloque_peut_etre' where tenant_id = $1 and id = $2", [
        tenantId,
        taskId,
      ]),
    ).rejects.toThrow();
  });
});
