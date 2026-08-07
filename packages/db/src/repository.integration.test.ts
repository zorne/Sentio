import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./postgres-client.js";
import { GlobalReadRepository, TenantScopedRepository } from "./repository.js";
import { ExecutionJournal } from "./journal.js";
import { TenantScope } from "./tenant-scope.js";

/**
 * Tests d'intégration : les repositories contre un **vrai** Postgres, sur le vrai schéma.
 *
 * ⚠️ Pourquoi ce fichier existe.
 *
 * Les tests unitaires de `repository.test.ts` tournent contre un client factice. Ils prouvent que
 * la portée d'entreprise est toujours posée — ils ne prouvent **rien** sur le fait que la requête
 * fonctionne. Trois bugs réels ont vécu sous 22 tests verts : des noms de colonnes en casse
 * incompatible, un champ de domaine sans colonne, et une référence erronée. Un faux client
 * renvoie ce qu'on lui dit de renvoyer ; il ne contredit jamais.
 *
 * Ces tests ne s'exécutent que si `DATABASE_URL` est fournie. Ils tournent en intégration
 * continue, où la base existe (`.github/workflows/ci.yml`, job `schema`).
 */

const connectionString = process.env["DATABASE_URL"];

// Sauter est acceptable quand personne n'attendait ces tests : en local sans Postgres, et dans
// le job `verify` de l'intégration continue, qui n'a délibérément pas de base.
//
// Ce qui ne l'est pas, c'est de sauter là où on croyait les exécuter. Le job qui doit les faire
// tourner le déclare en posant SENTIO_REQUIRE_DB_TESTS : si la base manque alors, on échoue
// bruyamment. Sans ce garde, retirer DATABASE_URL laisserait la suite verte en n'ayant rien
// vérifié — exactement la situation qui a laissé vivre trois bugs.
if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("Repositories sur un vrai Postgres", () => {
  let sql: PostgresClient;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let employeeId: string;
  let taskId: string;

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);

    // Deux entreprises réelles, pour éprouver l'isolation autrement que par comparaison de chaînes.
    await sql.query("insert into tenant (id, name) values ($1, $2), ($3, $4)", [
      tenantA,
      "Entreprise A",
      tenantB,
      "Entreprise B",
    ]);

    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [Date.now() % 100000],
    );

    const [identity] = await sql.query<{ id: string }>(
      "select * from reserve_identity($1)",
      ["commercial"],
    );

    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantA, definition?.id, identity?.id],
    );
    employeeId = employee?.id as string;

    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, subject_kind, subject_id) " +
        "values ($1, $2, 'lead', gen_random_uuid()) returning id",
      [tenantA, employeeId],
    );
    taskId = task?.id as string;
  });

  afterAll(async () => {
    // ⚠️ Supprimer une entreprise n'est PAS une simple cascade : le journal est en ajout seul et
    // refuse la suppression, y compris quand elle vient d'une cascade. Il faut passer par le
    // chemin autorisé, dans une transaction — hors transaction, `set local` n'a aucune portée.
    //
    // Ce n'est pas un contournement de test : c'est la forme que devra prendre la procédure
    // d'effacement du lot 8 (`CONF-05`), à ceci près qu'elle anonymisera le journal au lieu de le
    // supprimer, pour ne pas détruire la piste d'audit (`docs/10-securite-rgpd.md`).
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = any($1)", [[tenantA, tenantB]]);
      await tx.query("delete from tenant where id = any($1)", [[tenantA, tenantB]]);
    });
    await sql.close();
  });

  it("renvoie des objets dans la casse du domaine, pas celle de la base", async () => {
    // C'est le bug que les tests unitaires ne pouvaient pas voir : Postgres renvoie `tenant_id`,
    // le domaine attend `tenantId`. Sans traduction, chaque champ vaut `undefined`.
    const repo = new TenantScopedRepository<{ id: string; tenantId: string; recruitedAt: Date }>(
      sql,
      "employee",
      TenantScope.of(tenantA),
    );

    const employee = await repo.findById(employeeId);

    expect(employee).not.toBeNull();
    expect(employee?.tenantId).toBe(tenantA);
    expect(employee?.recruitedAt).toBeInstanceOf(Date);
    expect(employee).not.toHaveProperty("tenant_id");
  });

  it("isole réellement deux entreprises", async () => {
    const fromA = new TenantScopedRepository(sql, "employee", TenantScope.of(tenantA));
    const fromB = new TenantScopedRepository(sql, "employee", TenantScope.of(tenantB));

    expect(await fromA.findById(employeeId)).not.toBeNull();
    // B connaît l'identifiant et le demande explicitement : il n'obtient rien.
    expect(await fromB.findById(employeeId)).toBeNull();
    expect(await fromB.list()).toHaveLength(0);
  });

  it("insère en traduisant les noms de champs", async () => {
    const repo = new TenantScopedRepository<{ id: string; targetValue: string; metric: string }>(
      sql,
      "objective",
      TenantScope.of(tenantA),
    );

    // `targetValue` doit atteindre la colonne `target_value`. Une erreur de traduction ferait
    // échouer la requête ici, pas six mois plus tard en production.
    const objective = await repo.insert({
      metric: "chiffre_affaires",
      targetValue: 5000,
      horizon: "mensuel",
    });

    expect(objective.id).toBeDefined();
    expect(objective.metric).toBe("chiffre_affaires");

    const reread = await repo.findById(objective.id);
    expect(reread?.targetValue).toBe("5000");
  });

  it("met à jour sans permettre de changer d'entreprise", async () => {
    const repo = new TenantScopedRepository<{ id: string; horizon: string }>(
      sql,
      "objective",
      TenantScope.of(tenantA),
    );
    const created = await repo.insert({ metric: "ca", targetValue: 1, horizon: "mensuel" });

    const updated = await repo.update(created.id, { horizon: "trimestriel" });
    expect(updated?.horizon).toBe("trimestriel");

    // Depuis l'autre entreprise, la même mise à jour ne touche rien.
    const fromB = new TenantScopedRepository(sql, "objective", TenantScope.of(tenantB));
    expect(await fromB.update(created.id, { horizon: "annuel" })).toBeNull();
  });

  it("trie et borne une liste", async () => {
    const repo = new TenantScopedRepository<{ id: string; metric: string }>(
      sql,
      "objective",
      TenantScope.of(tenantA),
    );
    await repo.insert({ metric: "z", targetValue: 1, horizon: "mensuel" });
    await repo.insert({ metric: "a", targetValue: 1, horizon: "mensuel" });

    const sorted = await repo.list({}, { orderBy: "metric", direction: "asc", limit: 1 });
    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.metric).toBe("a");
  });

  it("lit une table globale sans portée", async () => {
    const plans = await new GlobalReadRepository<{ tier: string; jobPriority: number }>(
      sql,
      "plan",
    ).list();

    expect(plans.map((p) => p.tier).sort()).toEqual(["growth", "scale", "start"]);
    // Traduction vérifiée aussi sur une table globale : `job_priority` → `jobPriority`.
    expect(plans[0]?.jobPriority).toBeGreaterThan(0);
  });

  it("ajoute au journal et refuse le rejeu d'une action à effet extérieur", async () => {
    const journal = new ExecutionJournal(sql, TenantScope.of(tenantA));
    const key = `envoi-${randomUUID()}`;

    const event = await journal.append({
      taskId,
      employeeId,
      kind: "message_envoye",
      idempotencyKey: key,
    });

    expect(event.idempotencyKey).toBe(key);
    expect(event.tenantId).toBe(tenantA);

    // Invariant 3 : le rejeu est refusé par la base, pas par le code appelant.
    await expect(
      journal.append({ taskId, employeeId, kind: "message_envoye", idempotencyKey: key }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("relit les événements d'une tâche dans l'ordre", async () => {
    const journal = new ExecutionJournal(sql, TenantScope.of(tenantA));
    await journal.append({ taskId, employeeId, kind: "premier", idempotencyKey: null });
    await journal.append({ taskId, employeeId, kind: "second", idempotencyKey: null });

    const events = await journal.forTask(taskId);
    const kinds = events.map((e) => e.kind);

    expect(kinds).toContain("premier");
    expect(kinds).toContain("second");
    expect(kinds.indexOf("premier")).toBeLessThan(kinds.indexOf("second"));
  });

  it("ne laisse pas le journal d'une entreprise fuir vers une autre", async () => {
    const fromB = new ExecutionJournal(sql, TenantScope.of(tenantB));
    expect(await fromB.forTask(taskId)).toHaveLength(0);
  });

  /**
   * Ce que le serveur ne peut pas faire non plus.
   *
   * Le rôle de service contourne RLS : un employé numérique travaille sans utilisateur connecté,
   * donc sans jeton. Les politiques d'accès ne le protègent de rien. Les trois garanties
   * ci-dessous sont donc posées en contraintes et en déclencheurs, qui, eux, s'appliquent à tout
   * le monde — y compris à `apps/worker`, et y compris à un script de reprise écrit un soir de
   * panne (migrations 0033, 0034, 0035).
   */
  it("refuse un lien entre deux entreprises, même écrit par le serveur", async () => {
    const [source] = await sql.query<{ employee_definition_id: string }>(
      "select employee_definition_id from employee where id = $1",
      [employeeId],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employeeB] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantB, source?.employee_definition_id, identity?.id],
    );
    const [taskB] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, subject_kind, subject_id) " +
        "values ($1, $2, 'lead', gen_random_uuid()) returning id",
      [tenantB, employeeB?.id],
    );

    // Le repository force le bon `tenant_id` — mais rien ne l'empêchait de désigner la tâche
    // d'un autre client. C'est la clé étrangère qui refuse, pas nous.
    const outcomes = new TenantScopedRepository(sql, "outcome", TenantScope.of(tenantA));
    await expect(
      outcomes.insert({ taskId: taskB?.id, kind: "sale", value: 100, declaredBy: "client" }),
    ).rejects.toThrow(/foreign key|clé étrangère/i);
  });

  it("refuse qu'une ligne change d'entreprise, même par le rôle de service", async () => {
    const repo = new TenantScopedRepository<{ id: string }>(
      sql,
      "objective",
      TenantScope.of(tenantA),
    );
    const created = await repo.insert({ metric: "ca", targetValue: 1, horizon: "mensuel" });

    // Le repository refuse déjà d'en entendre parler…
    await expect(repo.update(created.id, { tenantId: tenantB })).rejects.toThrow(
      /tenant_id ne se passe pas en argument/,
    );

    // …et la base refuse aussi quand on court-circuite le repository.
    await expect(
      sql.query("update objective set tenant_id = $1 where id = $2", [tenantB, created.id]),
    ).rejects.toThrow(/ne change jamais d'entreprise/);
  });

  it("refuse de réécrire l'auteur d'une ligne de mémoire", async () => {
    const [fact] = await sql.query<{ id: string }>(
      `insert into learned_fact (tenant_id, employee_id, fact, author)
       values ($1, $2, 'Les relances du mardi obtiennent plus de réponses.', 'apprentissage')
       returning id`,
      [tenantA, employeeId],
    );

    // « Pourquoi mon employé croit ça ? » n'a de réponse que si la signature ne bouge jamais.
    await expect(
      sql.query("update learned_fact set author = 'client' where id = $1", [fact?.id]),
    ).rejects.toThrow(/auteur d'une ligne de mémoire ne se réécrit pas/);
  });

  it("bute sur le trigger d'immuabilité de l'ADN", async () => {
    // Le repository global n'expose aucune écriture ; on force donc la requête à la main pour
    // vérifier que la base refuse, et pas seulement l'API TypeScript.
    await expect(
      sql.query("update employee_definition set dna = '{}'::jsonb where id is not null", []),
    ).rejects.toThrow(/immuable/i);
  });
});
