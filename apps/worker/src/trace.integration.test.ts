import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACTION_ENGAGEE,
  ACTION_EXECUTEE,
  CONTEXTE_ASSEMBLE,
  RUN_DEMARRE,
  expliquerLePas,
  raconterLePas,
} from "@sentio/core";
import { ExecutionJournal, TenantScope } from "@sentio/db";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import type { EmployeeId, TenantId } from "@sentio/domain";

/** Versions uniques par appel : `Date.now()` collisionne entre deux fixtures de la même ms. */
let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

/**
 * EXEC-07 — la chaîne explicative, contre un **vrai** Postgres.
 *
 * ⚠️ Pourquoi ce cas ne peut pas être unitaire.
 *
 * La reconstruction de la chaîne est pure et testée sans base. Ce qui ne l'est pas : que le
 * journal SÉPARE réellement deux pas d'une même tâche. C'est précisément la situation où
 * « deviner à partir de l'ordre » devient faux — deux pas qui se chevauchent produisent des
 * événements entrelacés, et sans `step_id` on reconstitue une chaîne qui n'a jamais existé.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("La chaîne explicative d'un pas, sur un vrai Postgres", () => {
  let sql: PostgresClient;
  let journal: ExecutionJournal;

  const tenantId = randomUUID() as TenantId;
  let employeeId: EmployeeId;
  let taskId: string;

  const pasA = randomUUID();
  const pasB = randomUUID();

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Trace EXEC-07"]);
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
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", ["commercial"]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    employeeId = employee?.id as EmployeeId;

    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id) " +
        "values ($1, $2, (select o.id from objective o where o.tenant_id = $1 and o.state = 'actif'), 'lead', gen_random_uuid()) returning id",
      [tenantId, employeeId],
    );
    taskId = task?.id as string;

    journal = new ExecutionJournal(sql, TenantScope.of(tenantId));

    // Le run démarre, hors de tout pas.
    await journal.append({ taskId, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });

    // ── Deux pas ENTRELACÉS. C'est le cas que `step_id` existe pour tenir : sans lui, l'ordre
    //    seul mélangerait le contexte de A avec la décision de B.
    await journal.append({
      taskId,
      employeeId,
      kind: CONTEXTE_ASSEMBLE,
      idempotencyKey: null,
      stepId: pasA,
      payload: { couchesAbsentes: ["secteur"], objectif: "OBJECTIF_DU_PAS_A", faitsEcartes: [] },
    });
    await journal.append({
      taskId,
      employeeId,
      kind: CONTEXTE_ASSEMBLE,
      idempotencyKey: null,
      stepId: pasB,
      payload: { couchesAbsentes: [], objectif: "OBJECTIF_DU_PAS_B", faitsEcartes: [] },
    });
    await journal.append({
      taskId,
      employeeId,
      kind: "proposition_recue",
      idempotencyKey: null,
      stepId: pasB,
      payload: { proposition: { capabilityKey: "CAPACITE_DU_PAS_B", rationale: "motif de B" } },
    });
    await journal.append({
      taskId,
      employeeId,
      kind: "proposition_recue",
      idempotencyKey: null,
      stepId: pasA,
      payload: { proposition: { capabilityKey: "CAPACITE_DU_PAS_A", rationale: "motif de A" } },
    });
    await journal.append({
      taskId,
      employeeId,
      kind: "politique_allow",
      idempotencyKey: null,
      stepId: pasA,
      payload: { capacite: "CAPACITE_DU_PAS_A", fondement: "accord_permanent" },
    });
    await journal.append({
      taskId,
      employeeId,
      kind: "politique_refuse",
      idempotencyKey: null,
      stepId: pasB,
      payload: { capacite: "CAPACITE_DU_PAS_B" },
    });
    await journal.append({
      taskId,
      employeeId,
      kind: ACTION_ENGAGEE,
      idempotencyKey: `cle-${randomUUID()}`,
      stepId: pasA,
      payload: { capacite: "CAPACITE_DU_PAS_A" },
    });
    await journal.append({
      taskId,
      employeeId,
      kind: ACTION_EXECUTEE,
      idempotencyKey: null,
      stepId: pasA,
      payload: { cle: "cle-a", resultat: { messageId: "m-a" } },
    });
  });

  afterAll(async () => {
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
      await tx.query("delete from tenant where id = $1", [tenantId]);
    });
    await sql.close();
  });

  // ── LE test de cette tranche ───────────────────────────────────────────────

  it("sépare deux pas entrelacés sur la même tâche", async () => {
    const traceA = expliquerLePas(await journal.forStep(taskId, pasA));
    const traceB = expliquerLePas(await journal.forStep(taskId, pasB));

    const recitA = raconterLePas(traceA).join("\n");
    const recitB = raconterLePas(traceB).join("\n");

    // Chaque chaîne ne contient QUE son propre raisonnement.
    expect(recitA).toContain("OBJECTIF_DU_PAS_A");
    expect(recitA).toContain("CAPACITE_DU_PAS_A");
    expect(recitA).not.toContain("PAS_B");

    expect(recitB).toContain("OBJECTIF_DU_PAS_B");
    expect(recitB).toContain("CAPACITE_DU_PAS_B");
    expect(recitB).not.toContain("PAS_A");
  });

  it("sans le pas, l'ordre seul reconstitue une chaîne qui n'a jamais existé", async () => {
    // La démonstration de ce que `step_id` évite : la tâche entière, lue d'un bloc, mélange les
    // deux raisonnements en un récit faux.
    const melange = raconterLePas(expliquerLePas(await journal.forTask(taskId))).join("\n");

    expect(melange).toContain("PAS_A");
    expect(melange).toContain("PAS_B");
  });

  it("rend la chaîne du pas A complète, du contexte au résultat", async () => {
    const trace = expliquerLePas(await journal.forStep(taskId, pasA));

    expect(trace.maillons.map((m) => m.etape)).toEqual([
      "contexte",
      "proposition",
      "politique",
      "engagement",
      "resultat",
    ]);
    expect(trace.complete).toBe(true);
    expect(trace.manquants).toEqual([]);
  });

  it("rend la chaîne du pas B complète alors qu'aucun effet n'a eu lieu — le refus EST l'issue", async () => {
    const trace = expliquerLePas(await journal.forStep(taskId, pasB));

    expect(trace.maillons.map((m) => m.etape)).toEqual(["contexte", "proposition", "politique"]);
    expect(trace.complete).toBe(true);
    expect(raconterLePas(trace).join("\n")).toContain("hors de ce que fait ce métier");
  });

  it("le pas voyage jusqu'à la base et en revient", async () => {
    const evenements = await journal.forStep(taskId, pasA);
    expect(evenements.every((e) => e.stepId === pasA)).toBe(true);

    // Le démarrage du run n'appartient à aucun pas : il ne doit pas s'y glisser.
    const tous = await journal.forTask(taskId);
    const demarrage = tous.find((e) => e.kind === RUN_DEMARRE);
    expect(demarrage?.stepId).toBeNull();
  });

  it("ne mélange jamais les pas de deux entreprises", async () => {
    const autreTenant = randomUUID() as TenantId;
    const autreJournal = new ExecutionJournal(sql, TenantScope.of(autreTenant));

    // Même identifiant de pas, autre entreprise : la portée le rend invisible ici.
    expect(await autreJournal.forStep(taskId, pasA)).toEqual([]);
  });

  // La conséquence de l'effacement, écrite noir sur blanc dans un test plutôt qu'en commentaire.
  it("après effacement, la FORME de la chaîne survit — son contenu, non", async () => {
    const avant = expliquerLePas(await journal.forStep(taskId, pasA));
    expect(raconterLePas(avant).join("\n")).toContain("OBJECTIF_DU_PAS_A");

    await sql.query("select * from erase_tenant($1)", [tenantId]);

    const apres = expliquerLePas(await journal.forStep(taskId, pasA));
    // Les cinq maillons sont toujours là : on peut prouver que le processus a été suivi.
    expect(apres.maillons.map((m) => m.etape)).toEqual([
      "contexte",
      "proposition",
      "politique",
      "engagement",
      "resultat",
    ]);
    // Mais plus rien de ce que l'entreprise avait confié.
    expect(raconterLePas(apres).join("\n")).not.toContain("OBJECTIF_DU_PAS_A");
  });
});
