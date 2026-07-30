/** Réalise : TEST-04, TEST-07 */

import { INFERENCE_ENVELOPES, USAGE_METRICS, type FeatureFlags } from "@sentio/config";
import { describe, expect, it } from "vitest";

import { NonCompliantRouting, PermanentProviderError, ProviderQuotaExceeded, ProviderUnavailable, TaskDeferred } from "../errors.js";
import type { Clock, JournalWriter, UsageLedger } from "../ports.js";
import { ModelGateway } from "./gateway.js";
import type { ModelProvider, ModelRequest } from "./provider.js";

/**
 * Tests du Model Gateway.
 *
 * Deux d'entre eux portent des critères d'acceptation du lot 1 (`docs/13-verification.md`) :
 * **TEST-04** — le fournisseur de secours n'apparaît sur aucune requête réelle, et l'indisponibilité
 * du conforme produit un report, jamais un repli ; **TEST-07** — une entreprise au plafond voit ses
 * tâches reportées avec un message clair, sans effet sur les autres entreprises.
 */

class FakeLedger implements UsageLedger {
  usage = new Map<string, number>();
  limits = new Map<string, number>();
  envelope = new Map<string, number>();
  recorded: { envelope: string; providerKey: string; amount: number }[] = [];

  async tenantUsage(tenantId: string, metric: string): Promise<number> {
    return this.usage.get(`${tenantId}:${metric}`) ?? 0;
  }
  async tenantLimit(tenantId: string, metric: string): Promise<number | null> {
    return this.limits.get(`${tenantId}:${metric}`) ?? null;
  }
  async recordTenantUsage(tenantId: string, metric: string, amount: number): Promise<void> {
    this.usage.set(`${tenantId}:${metric}`, (this.usage.get(`${tenantId}:${metric}`) ?? 0) + amount);
  }
  async envelopeUsage(envelope: string): Promise<number> {
    return this.envelope.get(envelope) ?? 0;
  }
  async recordEnvelopeUsage(envelope: string, providerKey: string, amount: number): Promise<void> {
    this.envelope.set(envelope, (this.envelope.get(envelope) ?? 0) + amount);
    this.recorded.push({ envelope, providerKey, amount });
  }
}

class FakeJournal implements JournalWriter {
  entries: { kind: string; payload: unknown }[] = [];
  async append(entry: { kind: string; payload?: unknown }): Promise<void> {
    this.entries.push({ kind: entry.kind, payload: entry.payload });
  }
}

/** Horloge maîtrisée : le lissage de débit se vérifie sans faire attendre la suite de tests. */
function fakeClock(): Clock & { slept: number[]; advance(ms: number): void } {
  let current = 0;
  const slept: number[] = [];
  return {
    now: () => new Date(current),
    sleep: async (ms) => {
      slept.push(ms);
      current += ms;
    },
    slept,
    advance: (ms) => {
      current += ms;
    },
  };
}

function provider(
  key: string,
  dataPolicy: "no_train" | "free",
  behaviour: (request: ModelRequest) => Promise<{ tokens: number }> = async () => ({ tokens: 10 }),
): ModelProvider & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    key,
    dataPolicy,
    calls,
    async complete(request) {
      calls.push(request);
      const { tokens } = await behaviour(request);
      return { turn: { role: "assistant", type: "text", text: `réponse de ${key}` }, tokens };
    },
  };
}

const PROVEN: FeatureFlags = {
  inferenceOptOutProven: true,
  publicDiagnosticEnabled: false,
  checkoutEnabled: false,
};
const NOT_PROVEN: FeatureFlags = { ...PROVEN, inferenceOptOutProven: false };

function realRequest(tenantId: string | null = "11111111-1111-1111-1111-111111111111"): ModelRequest {
  return {
    turns: [{ role: "user", type: "text", text: "Qui contacter cette semaine ?" }],
    dataClass: "real",
    envelope: INFERENCE_ENVELOPES.soldEmployees,
    tenantId,
  };
}

function build(providers: ModelProvider[], flags: FeatureFlags = PROVEN) {
  const ledger = new FakeLedger();
  const journal = new FakeJournal();
  const clock = fakeClock();
  const gateway = new ModelGateway({
    providers,
    ledger,
    journal,
    flags,
    clock,
    providerLimits: { requestsPerMinute: 2, tokensPerMonth: 1000 },
  });
  return { gateway, ledger, journal, clock };
}

describe("Model Gateway — routage par classe de données", () => {
  it("TEST-04 : le fournisseur de secours n'est jamais appelé sur une donnée réelle", async () => {
    const conforme = provider("mistral", "no_train");
    const secours = provider("gratuit", "free");
    const { gateway } = build([conforme, secours]);

    const result = await gateway.complete(realRequest());

    expect(result.providerKey).toBe("mistral");
    // Pas « appelé puis rejeté » : jamais appelé du tout.
    expect(secours.calls).toHaveLength(0);
    expect(result.skipped.map((s) => s.providerKey)).toContain("gratuit");
  });

  it("TEST-04 : conforme indisponible ⇒ report, jamais repli vers le secours", async () => {
    const conforme = provider("mistral", "no_train", async () => {
      throw new ProviderUnavailable("mistral", "503");
    });
    const secours = provider("gratuit", "free");
    const { gateway, journal } = build([conforme, secours]);

    await expect(gateway.complete(realRequest())).rejects.toBeInstanceOf(TaskDeferred);
    expect(secours.calls).toHaveLength(0);
    expect(journal.entries.map((e) => e.kind)).toContain("tache_reportee");
  });

  it("refuse d'envoyer une donnée réelle tant que l'opt-out n'est pas prouvé", async () => {
    const conforme = provider("mistral", "no_train");
    const { gateway, journal } = build([conforme], NOT_PROVEN);

    // Le drapeau prime sur la politique annoncée : non prouvé ⇒ non conforme.
    await expect(gateway.complete(realRequest())).rejects.toBeInstanceOf(NonCompliantRouting);
    expect(conforme.calls).toHaveLength(0);
    expect(journal.entries.map((e) => e.kind)).toContain("routage_refuse");
  });

  it("autorise le fournisseur gratuit sur des données fictives", async () => {
    const secours = provider("gratuit", "free");
    const { gateway } = build([secours], NOT_PROVEN);

    const result = await gateway.complete({
      turns: [{ role: "user", type: "text", text: "démonstration" }],
      dataClass: "synthetic",
      envelope: INFERENCE_ENVELOPES.internal,
      tenantId: null,
    });

    expect(result.providerKey).toBe("gratuit");
  });
});

describe("Model Gateway — chaîne de repli", () => {
  it("passe au suivant sur quota épuisé, dans la même classe de données", async () => {
    const premier = provider("mistral-a", "no_train", async () => {
      throw new ProviderQuotaExceeded("mistral-a", "quota du jour épuisé");
    });
    const second = provider("mistral-b", "no_train");
    const { gateway } = build([premier, second]);

    const result = await gateway.complete(realRequest());

    expect(result.providerKey).toBe("mistral-b");
    expect(result.skipped.map((s) => s.providerKey)).toContain("mistral-a");
  });

  it("ne replie JAMAIS sur une erreur logique", async () => {
    const premier = provider("mistral-a", "no_train", async () => {
      throw new PermanentProviderError("mistral-a", "requête malformée");
    });
    const second = provider("mistral-b", "no_train");
    const { gateway } = build([premier, second]);

    // Un repli ici transformerait un bug en lenteur intermittente.
    await expect(gateway.complete(realRequest())).rejects.toBeInstanceOf(PermanentProviderError);
    expect(second.calls).toHaveLength(0);
  });
});

describe("Model Gateway — plafonds et comptage", () => {
  it("TEST-07 : au plafond, la tâche est reportée avec un message clair", async () => {
    const conforme = provider("mistral", "no_train");
    const { gateway, ledger } = build([conforme]);
    const tenant = "11111111-1111-1111-1111-111111111111";
    ledger.limits.set(`${tenant}:${USAGE_METRICS.inferenceTokensPerDay}`, 100);
    ledger.usage.set(`${tenant}:${USAGE_METRICS.inferenceTokensPerDay}`, 100);

    const failure = await gateway.complete(realRequest(tenant)).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TaskDeferred);
    expect((failure as TaskDeferred).clientMessage).toMatch(/en attente/);
    // Pas de dégradation silencieuse : rien n'a été appelé.
    expect(conforme.calls).toHaveLength(0);
  });

  it("TEST-07 : le plafond d'une entreprise n'affecte pas une autre", async () => {
    const conforme = provider("mistral", "no_train");
    const { gateway, ledger } = build([conforme]);
    const sature = "11111111-1111-1111-1111-111111111111";
    const autre = "22222222-2222-2222-2222-222222222222";
    ledger.limits.set(`${sature}:${USAGE_METRICS.inferenceTokensPerDay}`, 100);
    ledger.usage.set(`${sature}:${USAGE_METRICS.inferenceTokensPerDay}`, 100);

    await expect(gateway.complete(realRequest(sature))).rejects.toBeInstanceOf(TaskDeferred);
    await expect(gateway.complete(realRequest(autre))).resolves.toMatchObject({
      providerKey: "mistral",
    });
  });

  it("compte par entreprise et par enveloppe", async () => {
    const conforme = provider("mistral", "no_train", async () => ({ tokens: 42 }));
    const { gateway, ledger } = build([conforme]);
    const tenant = "11111111-1111-1111-1111-111111111111";

    await gateway.complete(realRequest(tenant));

    expect(ledger.usage.get(`${tenant}:${USAGE_METRICS.inferenceTokensPerDay}`)).toBe(42);
    expect(ledger.usage.get(`${tenant}:${USAGE_METRICS.inferenceTokensPerPeriod}`)).toBe(42);
    expect(ledger.envelope.get(INFERENCE_ENVELOPES.soldEmployees)).toBe(42);
  });

  it("refuse de servir une enveloppe épuisée sans toucher aux autres", async () => {
    const conforme = provider("mistral", "no_train");
    const { gateway, ledger } = build([conforme]);
    // Enveloppe vitrine : 25 % de 1000 jetons.
    ledger.envelope.set(INFERENCE_ENVELOPES.publicDiagnostic, 250);

    await expect(
      gateway.complete({
        turns: [{ role: "user", type: "text", text: "bonjour" }],
        dataClass: "real",
        envelope: INFERENCE_ENVELOPES.publicDiagnostic,
        tenantId: null,
      }),
    ).rejects.toBeInstanceOf(TaskDeferred);

    // L'enveloppe des employés vendus n'est pas entamée par la vitrine.
    await expect(gateway.complete(realRequest())).resolves.toMatchObject({ providerKey: "mistral" });
  });

  it("lisse le débit au lieu de grouper les appels", async () => {
    const conforme = provider("mistral", "no_train");
    const { gateway, clock } = build([conforme]);

    await gateway.complete(realRequest());
    await gateway.complete(realRequest());

    // 2 requêtes/minute ⇒ 30 s d'écart minimum. Le Gateway attend à la place de l'appelant.
    expect(clock.slept).toEqual([30_000]);
  });
});
