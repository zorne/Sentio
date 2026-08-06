import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACTION_DECIDEE,
  ACTION_EXECUTEE,
  POLITIQUE_SUSPEND,
  RUN_DEMARRE,
  reconstruireEtatRun,
} from "@sentio/core";

import {
  ExecutionJournal,
  TenantScope,
  createPostgresClient,
  type PostgresClient,
} from "@sentio/db";

/**
 * EXEC-02 — la reconstruction d'un run contre un **vrai** Postgres.
 *
 * Ce fichier vit dans `apps/worker` et non dans `packages/db` : il fait se rencontrer le noyau
 * (`reconstruireEtatRun`) et la base (`ExecutionJournal`), et c'est précisément le rôle de ce
 * composant — `packages/db` ne connaît pas `@sentio/core`, et ne doit pas l'apprendre
 * (`docs/02-architecture.md`).
 *
 * ⚠️ Pourquoi ces cas ne peuvent pas être unitaires.
 *
 * Tout ce qui est testé ici dépend de la persistance elle-même, et un double le contredirait
 * jamais :
 *
 *   · `created_at` vaut `now()` = l'heure de DÉBUT DE TRANSACTION. Aucun test unitaire ne peut
 *     prouver que Postgres se comporte ainsi — il faut le lui demander. C'est ce comportement
 *     qui rendait l'ordre de relecture d'un pas de run aléatoire, et le seul moyen de vérifier
 *     que `seq` le corrige est d'écrire vraiment plusieurs événements dans une transaction.
 *   · L'unicité des clés d'idempotence est tenue par un index, pas par le code appelant.
 *   · La reprise après interruption consiste précisément à ne RIEN garder en mémoire : la seule
 *     preuve utile est un état relu depuis la base par un client tout neuf.
 *
 * Ces tests ne s'exécutent que si `DATABASE_URL` est fournie, et échouent bruyamment si
 * l'intégration est exigée sans base — même garde que `repository.integration.test.ts`.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("Le journal et la reconstruction d'un run, sur un vrai Postgres", () => {
  let sql: PostgresClient;
  const tenantId = randomUUID();
  let employeeId: string;
  let taskId: string;
  let journal: ExecutionJournal;

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise EXEC-02"]);
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [Date.now() % 100000],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", ["commercial"]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    employeeId = employee?.id as string;

    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id) values ($1, $2) returning id",
      [tenantId, employeeId],
    );
    taskId = task?.id as string;

    journal = new ExecutionJournal(sql, TenantScope.of(tenantId));
  });

  afterAll(async () => {
    // Le journal refuse la suppression, y compris par cascade : il faut le chemin autorisé.
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
      await tx.query("delete from tenant where id = $1", [tenantId]);
    });
    await sql.close();
  });

  async function ajouter(kind: string, cle: string | null = null, payload?: unknown) {
    return journal.append({ taskId, employeeId, kind, idempotencyKey: cle, payload });
  }

  it("rend un rang exploitable, et non le texte que node-postgres renvoie pour un bigint", async () => {
    const evenement = await ajouter(RUN_DEMARRE);
    expect(typeof evenement.seq).toBe("number");
    expect(Number.isSafeInteger(evenement.seq)).toBe(true);
  });

  // LE test de cette tranche. Sans `seq`, ces trois événements sont indiscernables par
  // `created_at` et l'ordre relu était celui, arbitraire, des lignes physiques.
  it("préserve l'ordre causal d'événements écrits dans UNE MÊME transaction", async () => {
    await sql.withTransaction(async (tx) => {
      const dansLaTransaction = new ExecutionJournal(tx, TenantScope.of(tenantId));
      await dansLaTransaction.append({ taskId, employeeId, kind: ACTION_DECIDEE, idempotencyKey: null });
      await dansLaTransaction.append({
        taskId,
        employeeId,
        kind: ACTION_EXECUTEE,
        idempotencyKey: `mail:${randomUUID()}`,
      });
      await dansLaTransaction.append({ taskId, employeeId, kind: ACTION_DECIDEE, idempotencyKey: null });
    });

    const evenements = await journal.forTask(taskId);
    const dansLaTransaction = evenements.slice(1);

    // Un seul horodatage pour les trois : la démonstration que `created_at` n'ordonne rien.
    const horodatages = new Set(dansLaTransaction.map((e) => e.createdAt.getTime()));
    expect(horodatages.size).toBe(1);

    // Les rangs, eux, sont strictement croissants et respectent l'ordre d'écriture.
    expect(dansLaTransaction.map((e) => e.kind)).toEqual([ACTION_DECIDEE, ACTION_EXECUTEE, ACTION_DECIDEE]);
    for (let i = 1; i < evenements.length; i++) {
      expect(evenements[i]!.seq).toBeGreaterThan(evenements[i - 1]!.seq);
    }
  });

  // Le test qui tient le `order by`. Les deux tests précédents passeraient encore avec
  // `order by created_at` : Postgres rend souvent les lignes dans leur ordre physique, qui
  // coïncide avec l'ordre d'insertion. Vérifié en remettant l'ancien tri — la suite restait
  // verte. Ici, l'horodatage contredit délibérément le rang : seul un tri sur `seq` peut rendre
  // le bon ordre, et c'est exactement la situation que produisent deux transactions concurrentes
  // (celle qui a commencé le plus tôt peut écrire en dernier).
  it("rend l'ordre d'écriture même quand les horodatages disent l'inverse", async () => {
    const [tache] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id) values ($1, $2) returning id",
      [tenantId, employeeId],
    );
    const contradictoire = tache?.id as string;

    // Écriture directe : c'est le seul moyen de poser un `created_at` à contre-sens du rang.
    await sql.query(
      `insert into execution_event (tenant_id, task_id, employee_id, kind, created_at)
       values ($1, $2, $3, $4, now()), ($1, $2, $3, $5, now() - interval '1 hour')`,
      [tenantId, contradictoire, employeeId, RUN_DEMARRE, ACTION_DECIDEE],
    );

    const evenements = await journal.forTask(contradictoire);

    // L'ordre par horodatage donnerait « action décidée » d'abord, donc un run qui agit avant
    // d'avoir démarré — la reconstruction refuserait le journal.
    expect(evenements.map((e) => e.kind)).toEqual([RUN_DEMARRE, ACTION_DECIDEE]);
    expect(evenements[0]!.createdAt.getTime()).toBeGreaterThan(evenements[1]!.createdAt.getTime());

    const resultat = reconstruireEtatRun(evenements);
    expect(resultat.ok).toBe(true);
  });

  it("reconstruit un état cohérent à partir de ce qui a réellement été écrit", async () => {
    const resultat = reconstruireEtatRun(await journal.forTask(taskId));
    if (!resultat.ok) throw new Error(`journal incohérent : ${JSON.stringify(resultat.anomalies)}`);

    expect(resultat.etat.phase).toBe("en_cours");
    expect(resultat.etat.actionsExecutees).toBe(1);
  });

  // La reprise après interruption : aucun état en mémoire, un client neuf, le même résultat.
  it("retrouve exactement le même état après « redémarrage » du worker", async () => {
    const avant = reconstruireEtatRun(await journal.forTask(taskId));

    const autreClient = createPostgresClient(connectionString as string);
    try {
      const journalNeuf = new ExecutionJournal(autreClient, TenantScope.of(tenantId));
      const apres = reconstruireEtatRun(await journalNeuf.forTask(taskId));

      expect(apres).toEqual(avant);
    } finally {
      await autreClient.close();
    }
  });

  it("reprend là où le journal s'est arrêté, et n'oublie aucun effet déjà produit", async () => {
    const avant = reconstruireEtatRun(await journal.forTask(taskId));
    if (!avant.ok) throw new Error("état attendu");

    const cle = `mail:${randomUUID()}`;
    const ajoute = await ajouter(ACTION_EXECUTEE, cle);

    const apres = reconstruireEtatRun(await journal.forTask(taskId));
    if (!apres.ok) throw new Error("état attendu");

    expect(apres.etat.reprendreApres).toBe(ajoute.seq);
    expect(apres.etat.reprendreApres!).toBeGreaterThan(avant.etat.reprendreApres!);
    expect(apres.etat.effetsDejaProduits.has(cle)).toBe(true);
    expect(apres.etat.actionsExecutees).toBe(avant.etat.actionsExecutees + 1);
  });

  it("laisse la BASE refuser un effet rejoué — pas le code appelant", async () => {
    const cle = `mail:${randomUUID()}`;
    await ajouter(ACTION_EXECUTEE, cle);

    await expect(ajouter(ACTION_EXECUTEE, cle)).rejects.toThrow();

    // Et le journal reste cohérent : le rejeu n'a rien ajouté.
    const resultat = reconstruireEtatRun(await journal.forTask(taskId));
    expect(resultat.ok).toBe(true);
  });

  it("porte l'action suspendue jusqu'à l'état relu, sans mémoire intermédiaire", async () => {
    await ajouter(POLITIQUE_SUSPEND, null, { outil: "mail.send", a: "julie@exemple.fr" });

    const resultat = reconstruireEtatRun(await journal.forTask(taskId));
    if (!resultat.ok) throw new Error(`journal incohérent : ${JSON.stringify(resultat.anomalies)}`);

    expect(resultat.etat.phase).toBe("attente_accord");
    expect(resultat.etat.actionEnAttente).toEqual({ outil: "mail.send", a: "julie@exemple.fr" });
  });

  it("ne mélange jamais deux tâches : chaque run se reconstruit sur son seul journal", async () => {
    const [autre] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id) values ($1, $2) returning id",
      [tenantId, employeeId],
    );
    const autreTaskId = autre?.id as string;

    await journal.append({ taskId: autreTaskId, employeeId, kind: RUN_DEMARRE, idempotencyKey: null });

    const evenements = await journal.forTask(autreTaskId);
    expect(evenements).toHaveLength(1);

    const resultat = reconstruireEtatRun(evenements);
    if (!resultat.ok) throw new Error("état attendu");
    expect(resultat.etat.phase).toBe("en_cours");
    expect(resultat.etat.actionsExecutees).toBe(0);
  });
});
