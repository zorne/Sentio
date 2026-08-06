// ════════════════════════════════════════════════════════════════════
// Le journal d'exécution n'est jamais lisible sans session. (P0)
//
// `execution_event.payload` porte les entrées et sorties d'outils :
// prospects lus, messages rédigés, résultats d'appels. La migration 0008
// l'avait ouvert au rôle `anon` pour le tenant démo, à une époque où
// aucune session n'existait ; la clé anon étant publiée dans le bundle
// du navigateur, n'importe qui pouvait lire ce journal via l'API REST.
// La migration 0012 referme.
//
// CE QUE CE TEST TIENT, et pourquoi il ne vise pas qu'un nom : vérifier
// l'absence de la policy « demo_anon_read » ne protégerait de rien — il
// suffirait de la recréer sous un autre nom, ou d'oublier une clause
// `to` sur une nouvelle policy (sans `to`, une policy s'applique à
// PUBLIC, donc à `anon`). On vérifie donc les DEUX : le nom, et la
// propriété réelle.
//
//   DATABASE_URL=postgres://postgres@127.0.0.1:5432/vitrine_test \
//     pnpm --filter @sentio/vitrine test
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyVitrineSchema } from "./test-support/schema.js";

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

interface PolicyRow {
  policyname: string;
  roles: string[];
  cmd: string;
  qual: string | null;
}

describeIfDatabase("execution_event — aucune lecture sans session", () => {
  let db: Client;
  let policies: PolicyRow[];

  beforeAll(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await applyVitrineSchema(db);

    const { rows } = await db.query<PolicyRow>(
      `select policyname, roles::text[] as roles, cmd, qual
         from pg_policies
        where schemaname = 'public' and tablename = 'execution_event'`,
    );
    policies = rows;
  });

  afterAll(async () => {
    await db?.end();
  });

  it("la policy demo_anon_read n'existe plus", () => {
    expect(policies.map((p) => p.policyname)).not.toContain("demo_anon_read");
  });

  it("aucune policy n'ouvre le journal à un rôle non authentifié", () => {
    // `public` inclut `anon` : une policy sans clause `to` est une policy anonyme qui s'ignore.
    const ouvertes = policies.filter((p) => p.roles.some((r) => r === "public" || r === "anon"));
    expect(
      ouvertes,
      `Policies lisibles sans session : ${ouvertes.map((p) => p.policyname).join(", ")}. ` +
        "Le journal porte les payloads d'outils — il ne se lit jamais sans session.",
    ).toEqual([]);
  });

  it("le journal reste lisible par une session authentifiée, sinon la démo ne montre plus rien", () => {
    // Le correctif ne doit pas se contenter de tout fermer : la vue temps réel du tenant démo
    // doit continuer de fonctionner pour un visiteur connecté (lib/tenant-access.ts).
    const pourAuthentifies = policies.filter(
      (p) => p.roles.includes("authenticated") && (p.cmd === "SELECT" || p.cmd === "ALL"),
    );
    expect(pourAuthentifies.length).toBeGreaterThan(0);
  });

  it("la lecture du journal démo reste bornée à ce seul tenant", () => {
    const demo = policies.find((p) => p.policyname === "demo_journal_authentifie");
    expect(demo).toBeDefined();
    expect(demo?.roles).toEqual(["authenticated"]);
    expect(demo?.qual ?? "").toContain("00000000-0000-0000-0000-000000000001");
  });

  it("RLS est bien active sur la table — sans quoi les policies ne décident de rien", () => {
    return db
      .query<{ relrowsecurity: boolean }>(
        `select relrowsecurity from pg_class where relname = 'execution_event'`,
      )
      .then(({ rows }) => {
        expect(rows[0]?.relrowsecurity).toBe(true);
      });
  });
});
