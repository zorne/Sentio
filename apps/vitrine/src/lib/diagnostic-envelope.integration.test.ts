// ════════════════════════════════════════════════════════════════════
// ACQUIS-18 — l'enveloppe du diagnostic public, contre un vrai Postgres.
//
// Pourquoi une VRAIE base et pas un double : tout ce qui peut casser ici
// est du SQL. La fenêtre (`date_trunc('month', now())`) doit être la
// même à l'écriture et à la lecture, l'incrément doit être atomique, et
// `sum(consumed)` doit tomber sur la fenêtre en cours. Un faux client
// `pg` aurait validé une requête qui ne compte rien — et un compteur qui
// ne compte rien rend le plafond décoratif, c'est-à-dire pire qu'absent :
// il se donne l'air d'exister.
//
//   createdb vitrine_test
//   DATABASE_URL=postgres://postgres@127.0.0.1:5432/vitrine_test \
//     pnpm --filter @sentio/vitrine test
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { INFERENCE_ENVELOPES, inferenceEnvelopeBudget } from "@sentio/config";
import {
  buildDiagnosticGateway,
  EnvelopeExhausted,
  PostgresEnvelopeLedger,
} from "@sentio/vitrine-core/diagnostic";

import { applyVitrineSchema } from "./test-support/schema.js";

const connectionString = process.env["DATABASE_URL"];

// Même garde, même variable que les autres suites d'intégration : sauter est acceptable là où
// personne n'attendait ces tests, jamais là où on croyait les exécuter.
if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

const PUBLIC = INFERENCE_ENVELOPES.publicDiagnostic;
const BUDGET = inferenceEnvelopeBudget(PUBLIC);

const REQUEST = {
  tenantId: "platform-diagnostic",
  dataClass: "test" as const,
  system: "système",
  messages: [{ kind: "text" as const, role: "user" as const, content: "bonjour" }],
};

describeIfDatabase("l'enveloppe d'inférence du diagnostic public, sur une vraie base", () => {
  let db: Client;
  let ledger: PostgresEnvelopeLedger;

  beforeAll(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await applyVitrineSchema(db);
    ledger = new PostgresEnvelopeLedger(db);
  });

  beforeEach(async () => {
    await db.query("delete from provider_quota");
  });

  afterAll(async () => {
    await db.end();
  });

  it("part de zéro quand rien n'a été consommé", async () => {
    expect(await ledger.consumed(PUBLIC)).toBe(0);
  });

  it("additionne les consommations successives dans la fenêtre en cours", async () => {
    await ledger.record(PUBLIC, "groq", 150);
    await ledger.record(PUBLIC, "groq", 90);

    expect(await ledger.consumed(PUBLIC)).toBe(240);

    // Une seule ligne : c'est l'incrément atomique qui compte, pas une ligne par appel — sinon
    // la table grossirait d'une ligne par tour de conversation.
    const { rows } = await db.query<{ count: string; quota_limit: string }>(
      "select count(*) as count, max(quota_limit) as quota_limit from provider_quota",
    );
    expect(Number(rows[0]?.count)).toBe(1);
    // `quota_limit` porte la borne réellement appliquée, pas un 0 décoratif.
    expect(Number(rows[0]?.quota_limit)).toBe(BUDGET);
  });

  it("n'additionne pas les enveloppes entre elles — les employés vendus sont à part", async () => {
    await ledger.record(PUBLIC, "groq", 500);
    await ledger.record(INFERENCE_ENVELOPES.soldEmployees, "groq", 900);

    expect(await ledger.consumed(PUBLIC)).toBe(500);
    expect(await ledger.consumed(INFERENCE_ENVELOPES.soldEmployees)).toBe(900);
  });

  it("ignore ce qui a été consommé dans une fenêtre fermée", async () => {
    await db.query(
      `insert into provider_quota (provider_key, envelope, window_start, window_end, consumed, quota_limit)
       values ('groq', $1, date_trunc('month', now()) - interval '1 month',
               date_trunc('month', now()), $2, $2)`,
      [PUBLIC, BUDGET],
    );

    // Le mois dernier a été plein : il ne doit pas fermer la porte ce mois-ci.
    expect(await ledger.consumed(PUBLIC)).toBe(0);
  });

  it("refuse le tour de diagnostic dès que l'enveloppe est pleine", async () => {
    await ledger.record(PUBLIC, "groq", BUDGET);

    const gateway = buildDiagnosticGateway(ledger);
    const erreur = await gateway.generate(REQUEST).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(EnvelopeExhausted);
    expect((erreur as EnvelopeExhausted).detail).toContain(String(BUDGET));
  });

  it("laisse passer tant qu'il reste de la place", async () => {
    await ledger.record(PUBLIC, "groq", BUDGET - 1);
    // Aucune clé : le test ne doit jamais atteindre un fournisseur, même sur une machine qui en
    // a une configurée. Ce qu'on vérifie est ce qui se passe AVANT l'appel.
    delete process.env["GROQ_API_KEY"];

    const gateway = buildDiagnosticGateway(ledger);
    const erreur = await gateway.generate(REQUEST).catch((e: unknown) => e);

    // Sans clé de fournisseur, l'appel échoue — mais PAS sur l'enveloppe : la garde a laissé
    // passer, ce qui est exactement ce qu'on vérifie ici (le contraire d'un plafond qui ferme
    // trop tôt et qu'on ne remarquerait jamais).
    expect(erreur).not.toBeInstanceOf(EnvelopeExhausted);
  });
});
