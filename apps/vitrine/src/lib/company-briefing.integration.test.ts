// ════════════════════════════════════════════════════════════════════
// Le chemin complet, sur un vrai Postgres : ce que le client dit dans le
// briefing → agent_instance.config → le prompt que l'employé relit.
//
// Pourquoi une VRAIE base plutôt qu'un double : tout ce qui peut casser
// ici est du SQL — la fusion `||` sur jsonb, le `coalesce` sur une config
// vide, la clé que la route cron exige (`config ? 'prospectingCriteria'`).
// Un faux client `pg` aurait validé une requête invalide sans broncher.
//
// Ces tests ne tournent que si `DATABASE_URL` est fournie, et échouent
// bruyamment si l'intégration est exigée sans base — même garde que
// packages/db/src/repository.integration.test.ts. Sans ce garde, retirer
// la variable laisserait la suite verte en n'ayant rien vérifié.
//
//   createdb vitrine_test
//   DATABASE_URL=postgres://postgres@127.0.0.1:5432/vitrine_test pnpm --filter @sentio/vitrine test
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  composeSystemPrompt,
  readProfileFromConfig,
  saveCompanyProfile,
} from "@sentio/vitrine-core/company-briefing";
import { applyVitrineSchema, assertBaseJetable } from "./test-support/schema.js";

const connectionString = process.env["DATABASE_URL"];

// Même garde, même variable que packages/db/src/repository.integration.test.ts : sauter est
// acceptable là où personne n'attendait ces tests, jamais là où on croyait les exécuter.
if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const DEFAUT = "Vous êtes un employé commercial.";
const ACCUEIL = "Vous travaillez pour Menuiserie Kerbrat.";

// Échouer AU CHARGEMENT, avant toute connexion : ces suites effacent le schéma public, et
// « ECONNREFUSED » ne dit pas pourquoi on ne voulait pas de cette base.
if (connectionString !== undefined) assertBaseJetable(connectionString);

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("le profil d'entreprise, écrit et relu sur un vrai Postgres", () => {
  let db: Client;
  let tenantId: string;
  let agentInstanceId: string;

  async function configActuelle(): Promise<unknown> {
    const { rows } = await db.query(`select config from agent_instance where id = $1`, [agentInstanceId]);
    return rows[0]?.config;
  }

  beforeAll(async () => {
    db = new Client({ connectionString });
    await db.connect();

    // Base jetable : on repart d'un schéma vide à chaque exécution, jamais d'un reliquat.
    await applyVitrineSchema(db, connectionString);

    const tenant = await db.query(`insert into tenant (name) values ('Menuiserie Kerbrat') returning id`);
    tenantId = tenant.rows[0].id;
    const definition = await db.query(
      `select id from agent_definition limit 1`,
    );
    const agent = await db.query(
      `insert into agent_instance (tenant_id, definition_id, name, config)
       values ($1, $2, 'Commercial', '{}'::jsonb) returning id`,
      [tenantId, definition.rows[0].id],
    );
    agentInstanceId = agent.rows[0].id;
  });

  afterAll(async () => {
    await db?.end();
  });

  it("écrit le profil complet et active l'employé", async () => {
    await saveCompanyProfile(db, agentInstanceId, {
      cible: "Architectes en Bretagne",
      offre: "Devis sous 48h",
      exclusions: "Jamais les cuisinistes",
    });

    const { rows } = await db.query(
      `select config, is_active from agent_instance where id = $1`,
      [agentInstanceId],
    );
    expect(rows[0].is_active).toBe(true);
    expect(rows[0].config.companyProfile).toEqual({
      cible: "Architectes en Bretagne",
      offre: "Devis sous 48h",
      exclusions: "Jamais les cuisinistes",
    });
  });

  it("garde la clé sur laquelle la route cron sélectionne les employés à faire travailler", async () => {
    const { rows } = await db.query(
      `select 1 from agent_instance where id = $1 and config ? 'prospectingCriteria'`,
      [agentInstanceId],
    );
    expect(rows).toHaveLength(1);
  });

  it("fusionne au lieu d'écraser : corriger la cible ne perd pas les exclusions", async () => {
    // Le cas réel : le client repasse par le formulaire à deux champs après le briefing.
    await saveCompanyProfile(db, agentInstanceId, { cible: "Architectes et maîtres d'œuvre", offre: "Devis sous 48h" });

    const config = (await configActuelle()) as { companyProfile: Record<string, string> };
    expect(config.companyProfile.cible).toBe("Architectes et maîtres d'œuvre");
    expect(config.companyProfile.exclusions).toBe("Jamais les cuisinistes");
  });

  it("n'écrase pas le prompt posé par le chat d'accueil", async () => {
    await db.query(
      `update agent_instance set config = config || jsonb_build_object('systemPrompt', $2::text) where id = $1`,
      [agentInstanceId, ACCUEIL],
    );
    await saveCompanyProfile(db, agentInstanceId, { cible: "Architectes", offre: "Devis", ton: "direct" });

    const config = (await configActuelle()) as { systemPrompt: string };
    expect(config.systemPrompt).toBe(ACCUEIL);
  });

  it("porte jusqu'au prompt de l'employé ce que le client a dit — le chemin complet", async () => {
    const prompt = composeSystemPrompt(DEFAUT, await configActuelle());

    expect(prompt).toContain(ACCUEIL); // ce que l'accueil savait
    expect(prompt).toContain("Architectes"); // ce que le briefing a appris
    expect(prompt).toContain("Jamais les cuisinistes"); // ce qu'aucune version précédente ne transportait
    expect(prompt).toContain("direct");
  });

  it("part d'une config vide sans échouer", async () => {
    const vierge = await db.query(
      `insert into agent_instance (tenant_id, definition_id, name, config)
       select $1, id, 'Vierge', '{}'::jsonb from agent_definition limit 1 returning id`,
      [tenantId],
    );
    await saveCompanyProfile(db, vierge.rows[0].id, { cible: "Architectes", offre: "Devis" });

    const { rows } = await db.query(`select config from agent_instance where id = $1`, [vierge.rows[0].id]);
    expect(rows[0].config.companyProfile).toEqual({ cible: "Architectes", offre: "Devis" });
    expect(readProfileFromConfig(rows[0].config).cible).toBe("Architectes");
  });
});
