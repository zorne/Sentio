import { describe, expect, it } from "vitest";

import { assertBaseJetable } from "./schema.js";

/**
 * Ce garde protège contre un geste irréversible : `applyVitrineSchema` commence par
 * `drop schema public cascade`. Les cas ci-dessous sont les formes réelles que prend une chaîne
 * de connexion Supabase — c'est celle qu'on laisse traîner dans un shell, pas une chaîne inventée.
 */
describe("Le banc d'essai refuse une base qui n'est pas jetable", () => {
  it("refuse une connexion directe au projet distant", () => {
    expect(() =>
      assertBaseJetable("postgres://postgres:x@db.ritwmikarekkisxaiokf.supabase.co:5432/postgres"),
    ).toThrow(/EFFACENT|distant/);
  });

  it("refuse le pooler, qui porte un hôte différent", () => {
    expect(() =>
      assertBaseJetable("postgres://x@aws-0-eu-north-1.pooler.supabase.com:6543/postgres"),
    ).toThrow();
  });

  it("refuse aussi le domaine en .com", () => {
    expect(() => assertBaseJetable("postgresql://u:p@db.abc.supabase.com/postgres")).toThrow();
  });

  it("laisse passer une base locale jetable", () => {
    expect(() =>
      assertBaseJetable("postgres://postgres@127.0.0.1:5432/vitrine_test"),
    ).not.toThrow();
    expect(() => assertBaseJetable("postgres://postgres@localhost:5432/sentio_test")).not.toThrow();
  });
});
