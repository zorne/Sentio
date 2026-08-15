import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import type { EmployeeId, TenantId } from "@sentio/domain";

import { PostgresApprovalStore } from "@sentio/runtime";
import { AUTONOMIE_PRUDENTE, PostgresAutonomyResolver } from "@sentio/runtime";
import { capacitesActivees } from "@sentio/runtime";

/** Versions et clés uniques par appel. `Date.now()` collisionne dès que deux fixtures naissent
 *  dans la même milliseconde — ce qui arrive tout le temps entre deux suites. */
let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);


/**
 * EXEC-05 — les accords permanents et le niveau d'autonomie, contre un **vrai** Postgres.
 *
 * ⚠️ Pourquoi ces cas ne peuvent pas être unitaires.
 *
 * Une doublure d'`ApprovalStore` rend ce qu'on lui dit de rendre : elle ne contredira jamais une
 * expiration mal comparée, une révocation oubliée, ni une contrainte d'unicité absente. Or c'est
 * exactement là que se logent les autorisations qu'on croyait bornées :
 *
 *   · l'expiration est comparée par la BASE (`now()`), pas par l'horloge du processus ;
 *   · l'unicité `(employee_id, capability_key)` est tenue par un index, pas par le code ;
 *   · l'interdiction d'une clé de capacité vide — l'autorisation globale déguisée — est une
 *     contrainte de table.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("Accords permanents et autonomie, sur un vrai Postgres", () => {
  let sql: PostgresClient;
  let accords: PostgresApprovalStore;
  let autonomie: PostgresAutonomyResolver;

  const tenantA = randomUUID() as TenantId;
  const tenantB = randomUUID() as TenantId;
  let employeA: EmployeeId;
  let employeB: EmployeeId;
  let tacheA: string;

  async function creerEntreprise(tenantId: string, nom: string) {
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, nom]);
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
    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, subject_kind, subject_id) " +
        "values ($1, $2, 'lead', gen_random_uuid()) returning id",
      [tenantId, employee?.id],
    );
    return { employeeId: employee?.id as EmployeeId, taskId: task?.id as string };
  }

  async function accorder(
    tenantId: string,
    employeeId: string,
    capabilityKey: string,
    options: { expiresAt?: string | null; revoke?: boolean } = {},
  ) {
    await sql.query(
      `insert into standing_approval (tenant_id, employee_id, effect_class, capability_key, expires_at)
       values ($1, $2, 'external_irreversible', $3, $4)`,
      [tenantId, employeeId, capabilityKey, options.expiresAt ?? null],
    );
    if (options.revoke === true) {
      await sql.query(
        `update standing_approval set revoked_at = now()
          where employee_id = $1 and capability_key = $2`,
        [employeeId, capabilityKey],
      );
    }
  }

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    accords = new PostgresApprovalStore(sql);
    autonomie = new PostgresAutonomyResolver(sql);

    ({ employeeId: employeA, taskId: tacheA } = await creerEntreprise(tenantA, "Entreprise A"));
    ({ employeeId: employeB } = await creerEntreprise(tenantB, "Entreprise B"));
  });

  afterAll(async () => {
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = any($1)", [[tenantA, tenantB]]);
      await tx.query("delete from tenant where id = any($1)", [[tenantA, tenantB]]);
    });
    await sql.close();
  });

  // ── L'autonomie ────────────────────────────────────────────────────────────

  describe("le niveau d'autonomie vient de la configuration de l'entreprise", () => {
    it("vaut « confirm » par défaut — un employé non réglé ne s'autorise rien", async () => {
      expect(await autonomie.resolve(tenantA, employeA)).toBe("confirm");
      expect(AUTONOMIE_PRUDENTE).toBe("confirm");
    });

    it("suit le réglage réel du client, relu à chaque appel", async () => {
      await sql.query("update employee set autonomy = 'confirm_once' where id = $1", [employeA]);
      expect(await autonomie.resolve(tenantA, employeA)).toBe("confirm_once");

      // Un client qui abaisse l'autonomie doit être obéi au pas suivant, pas au redémarrage.
      await sql.query("update employee set autonomy = 'confirm' where id = $1", [employeA]);
      expect(await autonomie.resolve(tenantA, employeA)).toBe("confirm");
    });

    it("ne lit jamais le réglage d'un employé d'une autre entreprise", async () => {
      await sql.query("update employee set autonomy = 'auto' where id = $1", [employeB]);

      // Demandé sous l'entreprise A : l'employé de B est introuvable, donc prudent par défaut.
      expect(await autonomie.resolve(tenantA, employeB)).toBe("confirm");
      // Et sous sa propre entreprise, son vrai réglage s'applique.
      expect(await autonomie.resolve(tenantB, employeB)).toBe("auto");
    });

    it("la base refuse un niveau inventé — la liste est close", async () => {
      await expect(
        sql.query("update employee set autonomy = 'total' where id = $1", [employeA]),
      ).rejects.toThrow();
    });
  });

  // ── Les accords permanents ─────────────────────────────────────────────────

  describe("un accord permanent ne couvre que ce qu'il nomme", () => {
    it("vaut pour la capacité accordée", async () => {
      await accorder(tenantA, employeA, "envoyer_message");
      expect(await accords.hasStandingApproval(tenantA, employeA, "envoyer_message")).toBe(true);
    });

    it("ne vaut pas pour une AUTRE capacité du même employé", async () => {
      expect(await accords.hasStandingApproval(tenantA, employeA, "supprimer_donnees")).toBe(false);
    });

    it("ne vaut pas pour un employé d'une autre entreprise", async () => {
      await accorder(tenantB, employeB, "envoyer_message");

      // Le triplet complet est exigé : l'accord de B ne s'applique pas sous A, ni à l'employé de A.
      expect(await accords.hasStandingApproval(tenantA, employeB, "envoyer_message")).toBe(false);
      expect(await accords.hasStandingApproval(tenantB, employeA, "envoyer_message")).toBe(false);
    });

    it("ne vaut plus une fois révoqué, immédiatement", async () => {
      await accorder(tenantA, employeA, "relancer_prospect");
      expect(await accords.hasStandingApproval(tenantA, employeA, "relancer_prospect")).toBe(true);

      await sql.query(
        "update standing_approval set revoked_at = now() where employee_id = $1 and capability_key = $2",
        [employeA, "relancer_prospect"],
      );
      expect(await accords.hasStandingApproval(tenantA, employeA, "relancer_prospect")).toBe(false);
    });

    it("ne vaut plus une fois expiré — comparé par la base, pas par l'horloge du processus", async () => {
      await sql.query(
        `insert into standing_approval (tenant_id, employee_id, effect_class, capability_key, granted_at, expires_at)
         values ($1, $2, 'external_irreversible', 'importer_prospects', now() - interval '2 days', now() - interval '1 day')`,
        [tenantA, employeA],
      );
      expect(await accords.hasStandingApproval(tenantA, employeA, "importer_prospects")).toBe(false);
    });

    it("vaut tant que l'échéance n'est pas passée", async () => {
      await accorder(tenantA, employeA, "planifier_relance", {
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(await accords.hasStandingApproval(tenantA, employeA, "planifier_relance")).toBe(true);
    });
  });

  describe("la base refuse elle-même l'autorisation globale", () => {
    it("refuse une capacité vide — ce serait « cet employé peut tout faire »", async () => {
      await expect(
        sql.query(
          `insert into standing_approval (tenant_id, employee_id, effect_class, capability_key)
           values ($1, $2, 'external_irreversible', '')`,
          [tenantA, employeA],
        ),
      ).rejects.toThrow();

      await expect(
        sql.query(
          `insert into standing_approval (tenant_id, employee_id, effect_class, capability_key)
           values ($1, $2, 'external_irreversible', '   ')`,
          [tenantA, employeA],
        ),
      ).rejects.toThrow();
    });

    it("refuse une échéance déjà passée à l'octroi — une erreur de saisie qui se lit comme un accord", async () => {
      await expect(
        sql.query(
          `insert into standing_approval (tenant_id, employee_id, effect_class, capability_key, granted_at, expires_at)
           values ($1, $2, 'external_irreversible', 'x', now(), now() - interval '1 day')`,
          [tenantA, employeA],
        ),
      ).rejects.toThrow();
    });

    it("refuse deux accords pour la même capacité — un seul état, révocable", async () => {
      await expect(accorder(tenantA, employeA, "envoyer_message")).rejects.toThrow();
    });
  });

  describe("la demande d'accord ponctuel", () => {
    it("ne duplique pas une demande déjà en attente pour la même tâche", async () => {
      const premier = await accords.requestApproval({
        tenantId: tenantA,
        taskId: tacheA as never,
        employeeId: employeA,
        effectClass: "external_irreversible",
        capabilityKey: "envoyer_message",
      });
      const second = await accords.requestApproval({
        tenantId: tenantA,
        taskId: tacheA as never,
        employeeId: employeA,
        effectClass: "external_irreversible",
        capabilityKey: "envoyer_message",
      });

      // Deux questions identiques au client, ce sont deux réponses possiblement contradictoires.
      expect(second).toBe(premier);
    });
  });
});

/**
 * Le pas complet — la vérification que l'autonomie et les capacités viennent bien de la base.
 *
 * Sans ces cas, `decideNextStep` pourrait recevoir ses valeurs de n'importe où et les tests
 * unitaires du noyau resteraient verts : ils prouvent que la décision est juste POUR les valeurs
 * qu'on lui donne, jamais que ces valeurs sont les bonnes.
 */
describeIfDatabase("Les capacités activées, lues dans la base", () => {
  let sql: PostgresClient;
  const tenantA = randomUUID() as TenantId;
  const tenantB = randomUUID() as TenantId;
  let employeA: EmployeeId;
  let employeB: EmployeeId;
  let capaciteEnvoi: string;
  let capaciteQualif: string;

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);

    for (const [tenantId, nom] of [
      [tenantA, "Capacités A"],
      [tenantB, "Capacités B"],
    ] as const) {
      await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, nom]);
    }

    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [versionUnique()],
    );
    const employes: EmployeeId[] = [];
    for (const tenantId of [tenantA, tenantB]) {
      const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
        "commercial",
      ]);
      const [employee] = await sql.query<{ id: string }>(
        `insert into employee (tenant_id, employee_definition_id, identity_id)
         values ($1, $2, $3) returning id`,
        [tenantId, definition?.id, identity?.id],
      );
      employes.push(employee?.id as EmployeeId);
    }
    employeA = employes[0] as EmployeeId;
    employeB = employes[1] as EmployeeId;

    // La clé n'est plus saisie : elle est engendrée depuis l'acte et l'objet
    // (`20260815120001_acte_et_objet.sql`). L'unicité de la suite porte donc sur l'objet — deux
    // exécutions ne se marchent pas dessus, et la capacité reste lisible : « envoyer à quoi ».
    const [envoi] = await sql.query<{ id: string }>(
      `insert into capability (acte, objet, name, contract)
       values ('envoyer', $1, 'Écrire', '{}'::jsonb) returning id`,
      [`prospect_${versionUnique()}`],
    );
    const [qualif] = await sql.query<{ id: string }>(
      `insert into capability (acte, objet, name, contract)
       values ('qualifier', $1, 'Qualifier', '{}'::jsonb) returning id`,
      [`prospect_${versionUnique()}`],
    );
    capaciteEnvoi = envoi?.id as string;
    capaciteQualif = qualif?.id as string;
  });

  afterAll(async () => {
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = any($1)", [[tenantA, tenantB]]);
      await tx.query("delete from tenant where id = any($1)", [[tenantA, tenantB]]);
    });
    await sql.query("delete from capability where id = any($1)", [[capaciteEnvoi, capaciteQualif]]);
    await sql.close();
  });

  it("un employé sans capacité activée n'en a aucune — pas de liste par défaut", async () => {
    expect(await capacitesActivees(sql, tenantA, employeA)).toEqual([]);
  });

  it("rend exactement les capacités activées de cet employé", async () => {
    await sql.query(
      "insert into employee_capability (tenant_id, employee_id, capability_id) values ($1, $2, $3)",
      [tenantA, employeA, capaciteEnvoi],
    );
    const capacites = await capacitesActivees(sql, tenantA, employeA);
    expect(capacites).toHaveLength(1);
  });

  it("exclut une capacité DÉSACTIVÉE — le retrait est immédiat", async () => {
    await sql.query(
      "update employee_capability set enabled = false where employee_id = $1 and capability_id = $2",
      [employeA, capaciteEnvoi],
    );
    expect(await capacitesActivees(sql, tenantA, employeA)).toEqual([]);

    await sql.query(
      "update employee_capability set enabled = true where employee_id = $1 and capability_id = $2",
      [employeA, capaciteEnvoi],
    );
    expect(await capacitesActivees(sql, tenantA, employeA)).toHaveLength(1);
  });

  it("ne mélange jamais les capacités de deux entreprises", async () => {
    await sql.query(
      "insert into employee_capability (tenant_id, employee_id, capability_id) values ($1, $2, $3)",
      [tenantB, employeB, capaciteQualif],
    );

    const chezA = await capacitesActivees(sql, tenantA, employeA);
    const chezB = await capacitesActivees(sql, tenantB, employeB);

    expect(chezA).not.toEqual(chezB);
    // Et l'employé de B, demandé sous A, n'a rien : la portée ferme les deux côtés.
    expect(await capacitesActivees(sql, tenantA, employeB)).toEqual([]);
  });

  it("rend une liste ordonnée — deux lectures du même état donnent la même liste", async () => {
    await sql.query(
      "insert into employee_capability (tenant_id, employee_id, capability_id) values ($1, $2, $3)",
      [tenantA, employeA, capaciteQualif],
    );
    expect(await capacitesActivees(sql, tenantA, employeA)).toEqual(
      await capacitesActivees(sql, tenantA, employeA),
    );
  });
});
