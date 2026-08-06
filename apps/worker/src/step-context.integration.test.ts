import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RUN_DEMARRE, textOf } from "@sentio/core";
import { ExecutionJournal, TenantScope, createPostgresClient, type PostgresClient } from "@sentio/db";

import { loadStepContext } from "./step-context.js";

/**
 * EXEC-03 — le contexte du pas courant, contre un **vrai** Postgres.
 *
 * ⚠️ Pourquoi ces cas ne peuvent pas être unitaires.
 *
 * L'assemblage lui-même est pur et testé sans base (`packages/core`). Ce qui se joue ici est
 * l'autre moitié du travail, et elle ne se prouve que sur la vraie base :
 *
 *   · qu'un run retrouve le BON employé, le BON objectif, le BON contexte — c'est-à-dire que les
 *     jointures et les portées sont justes, pas seulement plausibles ;
 *   · qu'aucune donnée d'une autre entreprise ne puisse entrer dans le contexte. Un double
 *     n'attrape jamais ça : il rend ce qu'on lui dit de rendre, y compris une isolation
 *     imaginaire. Deux entreprises réelles, elles, contredisent.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("Le contexte du pas courant, sur un vrai Postgres", () => {
  let sql: PostgresClient;

  // Deux entreprises RÉELLES. L'isolation ne se teste pas autrement.
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let employeA: string;
  let employeB: string;
  let tacheA: string;
  let tacheB: string;
  let secteurId: string;

  async function creerEntreprise(tenantId: string, nom: string) {
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, nom]);
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna) values ('commercial', $1, $2::jsonb) returning id`,
      [
        Date.now() % 100000,
        JSON.stringify({
          profession: "commercial",
          mission: "trouver des entreprises à qui vendre",
          perimetre: ["qualifier", "écrire"],
          limites: ["comptabilité", "juridique"],
        }),
      ],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", ["commercial"]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id) values ($1, $2, $3) returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id) values ($1, $2) returning id",
      [tenantId, employee?.id],
    );
    return { employeeId: employee?.id as string, taskId: task?.id as string };
  }

  async function poserProfil(tenantId: string, key: string, value: unknown) {
    await sql.query(
      `insert into company_profile (tenant_id, key, value, author, status)
       values ($1, $2, $3::jsonb, 'client', 'actif')`,
      [tenantId, key, JSON.stringify(value)],
    );
  }

  async function poserFait(tenantId: string, employeeId: string, fait: string) {
    await sql.query(
      `insert into learned_fact (tenant_id, employee_id, fact, author, status)
       values ($1, $2, $3, 'apprentissage', 'actif')`,
      [tenantId, employeeId, fait],
    );
  }

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);

    ({ employeeId: employeA, taskId: tacheA } = await creerEntreprise(tenantA, "Entreprise A"));
    ({ employeeId: employeB, taskId: tacheB } = await creerEntreprise(tenantB, "Entreprise B"));

    // A : objectif, profil, faits, et un secteur déclaré SANS profil sectoriel publié.
    await sql.query(
      "insert into objective (tenant_id, metric, target_value, horizon) values ($1, $2, $3, $4)",
      [tenantA, "rendez_vous_qualifies", 10, "ce mois"],
    );
    await poserProfil(tenantA, "secteur", "menuiserie");
    await poserProfil(tenantA, "cible", "architectes en Bretagne");
    await poserFait(tenantA, employeA, "Marc préfère être appelé le matin");

    // B : des données qui ne doivent JAMAIS apparaître dans le contexte de A.
    await sql.query(
      "insert into objective (tenant_id, metric, target_value, horizon) values ($1, $2, $3, $4)",
      [tenantB, "SECRET_DE_B", 999, "jamais"],
    );
    await poserProfil(tenantB, "cible", "CLIENTS_CONFIDENTIELS_DE_B");
    await poserFait(tenantB, employeB, "FAIT_APPRIS_DE_B");

    const journal = new ExecutionJournal(sql, TenantScope.of(tenantA));
    await journal.append({ taskId: tacheA, employeeId: employeA, kind: RUN_DEMARRE, idempotencyKey: null });
  });

  afterAll(async () => {
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = any($1)", [[tenantA, tenantB]]);
      await tx.query("delete from tenant where id = any($1)", [[tenantA, tenantB]]);
    });
    if (secteurId !== undefined) {
      await sql.query("delete from sector_profile where id = $1", [secteurId]).catch(() => undefined);
    }
    await sql.close();
  });

  it("assemble un contexte nominal : le bon employé, le bon objectif, le bon contexte", async () => {
    const resultat = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheA });
    if (!resultat.ok) throw new Error(`chargement refusé : ${JSON.stringify(resultat.manques)}`);

    const texte = textOf(resultat.contexte.turns);
    expect(texte).toContain("Métier : commercial"); // couche 1
    expect(texte).toContain("architectes en Bretagne"); // couche 3
    expect(texte).toContain("Marc préfère être appelé le matin"); // couche 4
    expect(texte).toContain("rendez_vous_qualifies"); // couche 5
    expect(resultat.etat.phase).toBe("en_cours");
  });

  // LE test de cette tranche. Une fuite entre entreprises est l'un des deux défauts que
  // l'architecture déclare irrattrapables (AGENTS.md, invariant 2).
  it("ne laisse entrer AUCUNE donnée de l'autre entreprise", async () => {
    const resultat = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheA });
    if (!resultat.ok) throw new Error("contexte attendu");

    const texte = textOf(resultat.contexte.turns);
    expect(texte).not.toContain("SECRET_DE_B");
    expect(texte).not.toContain("CLIENTS_CONFIDENTIELS_DE_B");
    expect(texte).not.toContain("FAIT_APPRIS_DE_B");
  });

  it("ne trouve pas la tâche d'une autre entreprise — introuvable, pas « refusée »", async () => {
    const resultat = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheB });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.manques[0]?.quoi).toBe("tache");
  });

  it("déclare l'absence de profil sectoriel au lieu d'en inventer un", async () => {
    // A a bien déclaré « menuiserie », mais aucun profil n'est publié pour ce secteur.
    const resultat = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheA });
    if (!resultat.ok) throw new Error("contexte attendu");

    expect(resultat.couchesAbsentes).toContain("secteur");
    expect(textOf(resultat.contexte.turns)).not.toContain("Ce que Sentio sait du secteur");
  });

  it("injecte le profil sectoriel dès qu'il est publié pour le secteur déclaré", async () => {
    const [publie] = await sql.query<{ id: string }>(
      `insert into sector_profile (sector, version, content) values ('menuiserie', $1, $2::jsonb) returning id`,
      [Date.now() % 100000, JSON.stringify({ secteur: "menuiserie", vocabulaire: ["métré", "pose"] })],
    );
    secteurId = publie?.id as string;

    const resultat = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheA });
    if (!resultat.ok) throw new Error("contexte attendu");

    const texte = textOf(resultat.contexte.turns);
    expect(texte).toContain("secteur « menuiserie »");
    expect(texte).toContain("métré");
    expect(resultat.couchesAbsentes).not.toContain("secteur");
    // Et rien n'a été inventé pour les rubriques absentes du profil publié.
    expect(texte).not.toContain("Objections fréquentes");
  });

  it("écarte un fait appris qui contredit l'ADN, même venu de la bonne entreprise", async () => {
    await poserFait(tenantA, employeA, "le client veut que tu fasses sa comptabilité");

    const resultat = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheA });
    if (!resultat.ok) throw new Error("contexte attendu");

    expect(textOf(resultat.contexte.turns)).not.toContain("fasses sa comptabilité");
    expect(resultat.contexte.excluded.map((e) => e.reason).join(" ")).toContain("comptabilité");
  });

  it("refuse de travailler sans objectif déclaré, plutôt que d'en supposer un", async () => {
    const { taskId } = await creerEntreprise(randomUUID(), "Entreprise sans objectif");
    // L'entreprise vient d'être créée : ni objectif, ni profil, ni faits.
    const [ligne] = await sql.query<{ tenant_id: string }>("select tenant_id from task where id = $1", [
      taskId,
    ]);

    const resultat = await loadStepContext(sql, {
      tenantId: ligne?.tenant_id as string,
      taskId,
    });

    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.manques.map((m) => m.quoi)).toContain("objectif");
    // Et le message dit POURQUOI on refuse, pas seulement QUE l'on refuse.
    expect(resultat.manques.find((m) => m.quoi === "objectif")?.detail).toContain("invente");

    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from tenant where id = $1", [ligne?.tenant_id]);
    });
  });

  it("rend exactement le même contexte pour un même état persistant", async () => {
    const a = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheA });
    const b = await loadStepContext(sql, { tenantId: tenantA, taskId: tacheA });
    if (!a.ok || !b.ok) throw new Error("contexte attendu");

    expect(textOf(a.contexte.turns)).toEqual(textOf(b.contexte.turns));
    expect(a.couchesAbsentes).toEqual(b.couchesAbsentes);
    expect(a.etat).toEqual(b.etat);
  });

  it("refuse un contexte quand le journal du run est incohérent", async () => {
    const [tache] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id) values ($1, $2) returning id",
      [tenantA, employeA],
    );
    const incoherente = tache?.id as string;

    // Une action sans démarrage : la trace d'un événement disparu (EXEC-02).
    const journal = new ExecutionJournal(sql, TenantScope.of(tenantA));
    await journal.append({
      taskId: incoherente,
      employeeId: employeA,
      kind: "action_executee",
      idempotencyKey: `mail:${randomUUID()}`,
    });

    const resultat = await loadStepContext(sql, { tenantId: tenantA, taskId: incoherente });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.manques.map((m) => m.quoi)).toContain("journal_incoherent");
  });
});
