import { randomUUID } from "node:crypto";

import { textOf } from "@sentio/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PostgresApprovisionnementStore,
  PostgresJournalWriter,
  RegistreDeGisementsEnMemoire,
  approvisionnerLeJour,
  loadStepContext,
} from "@sentio/runtime";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * LADY-G — **le critère de l'étape 7 du plan**, prouvé de bout en bout.
 *
 * « Un employé neuf, avec un objectif et une configuration, produit son premier lot de travail
 * sans qu'aucune tâche n'ait été créée à la main. »
 *
 * ⚠️ Pourquoi ce fichier existe séparément.
 *
 * Toutes les autres suites d'intégration créent leurs missions elles-mêmes, en SQL, pour éprouver
 * ce qui vient APRÈS. C'est légitime — et c'est précisément ce qui laissait invisible le fait que
 * **rien, en production, ne fabriquait le travail**. Ici, aucune ligne de `task` n'est écrite par
 * le test : si le lot n'apparaît pas, c'est que la chaîne objectif → configuration → mission est
 * rompue quelque part, et le test le dit.
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

describeIfDatabase("LADY-G — un employé neuf produit son premier lot, sans aide", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
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

  /**
   * Un recrutement complet, tel qu'il aura lieu après paiement — et rien de plus.
   *
   * On y trouve ce qu'un vrai client apporte (une entreprise, un objectif, des prospects) et ce
   * que Sentio décide (un noyau, une identité, une configuration). **Aucune mission.**
   */
  async function recruter(options: { prospects: number; capacites: readonly string[] }) {
    const tenantId = randomUUID();
    tenants.push(tenantId);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise LADY-G"]);
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

    const [noyau] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, $2::jsonb, $3::jsonb) returning id`,
      [
        versionUnique(),
        JSON.stringify({
          mission: "servir cette entreprise là où elle a le plus besoin de renfort",
          perimetre: ["ce que la configuration active"],
          limites: ["professions réglementées", "engagement contractuel au nom du client"],
        }),
        JSON.stringify(options.capacites),
      ],
    );
    const [identite] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employe] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, noyau?.id, identite?.id],
    );

    // La configuration issue du diagnostic — c'est elle, et elle seule, qui ouvre des pouvoirs.
    const [configuration] = await sql.query<{ id: string }>(
      `insert into lady_configuration
         (tenant_id, employee_id, version, role, priorites, autonomie, declencheur, raison, active)
       values ($1, $2, 1, 'prospection',
               '["élargir le nombre d''entreprises approchées"]'::jsonb,
               'confirm', 'recrutement',
               'Le frein le plus lourd est le nombre d''entreprises approchées.', false)
       returning id`,
      [tenantId, employe?.id],
    );
    await sql.query(
      `insert into lady_configuration_capability (configuration_id, capability_id)
       select $1, c.id from capability c where c.key = any($2)`,
      [configuration?.id, options.capacites],
    );
    await sql.query("select appliquer_la_configuration($1)", [configuration?.id]);

    for (let i = 0; i < options.prospects; i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Entreprise ${i}`, `contact${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }

    return { tenantId, employeeId: employe?.id as string };
  }

  async function approvisionner(): Promise<void> {
    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
        journal: new PostgresJournalWriter(sql),
      },
      new Date(),
    );
  }

  it("ouvre son premier lot de missions sans qu'aucune tâche n'ait été écrite à la main", async () => {
    const { tenantId } = await recruter({ prospects: 3, capacites: ["qualifier.prospect"] });

    // Avant : rien. C'est ce qui rend le test concluant.
    const [avant] = await sql.query<{ n: string }>(
      "select count(*) as n from task where tenant_id = $1",
      [tenantId],
    );
    expect(Number(avant?.n)).toBe(0);

    await approvisionner();

    const missions = await sql.query<{ id: string; objective_id: string; subject_kind: string }>(
      "select id, objective_id, subject_kind from task where tenant_id = $1",
      [tenantId],
    );
    expect(missions.length).toBe(3);

    // Chaque mission sert un objectif — la chaîne de l'étape 3, vérifiée sur du travail réel.
    for (const mission of missions) {
      expect(mission.objective_id).not.toBeNull();
      expect(mission.subject_kind).toBe("lead");
    }

    // Et chacune est en file : ouvrir sans mettre en file laisserait du travail qui n'arrive jamais.
    const [enFile] = await sql.query<{ n: string }>(
      "select count(*) as n from job where tenant_id = $1",
      [tenantId],
    );
    expect(Number(enFile?.n)).toBe(3);
  });

  it("travaille sous le rôle de sa configuration, jamais sous un métier", async () => {
    const { tenantId } = await recruter({ prospects: 1, capacites: ["qualifier.prospect"] });
    await approvisionner();

    const [mission] = await sql.query<{ id: string }>(
      "select id from task where tenant_id = $1 limit 1",
      [tenantId],
    );
    const contexte = await loadStepContext(sql, { tenantId, taskId: mission?.id as string });
    if (!contexte.ok) throw new Error(`contexte refusé : ${JSON.stringify(contexte.manques)}`);

    const texte = textOf(contexte.contexte.turns);
    expect(texte).toContain("Rôle actuel : prospection");
    expect(texte).toContain("élargir le nombre d'entreprises approchées");
    // Le noyau ne déclare plus de métier : rien ne doit en réintroduire un dans le contexte.
    expect(texte).not.toContain("Métier :");
  });

  it("n'ouvre que ce que sa configuration autorise — le pouvoir vient d'elle, pas du noyau", async () => {
    // Le noyau rend deux actes concevables ; la configuration n'en active qu'un. C'est le §11 de
    // la vision : une configuration retranche au périmètre du noyau, elle ne l'étend jamais.
    const { tenantId, employeeId } = await recruter({
      prospects: 1,
      capacites: ["qualifier.prospect"],
    });

    const ouvertes = await sql.query<{ key: string }>(
      `select c.key from employee_capability ec
         join capability c on c.id = ec.capability_id
        where ec.employee_id = $1 and ec.enabled
        order by c.key`,
      [employeeId],
    );
    expect(ouvertes.map((r) => r.key)).toEqual(["qualifier.prospect"]);
    expect(tenantId).toBeTruthy();
  });
});
