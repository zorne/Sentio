// ════════════════════════════════════════════════════════════════════
// ACQUIS-18 — ce que l'enveloppe garantit, vérifié PAR LA NÉGATIVE.
//
// Le test qui compte n'est pas « la garde existe », c'est « le chemin du
// diagnostic public ne peut pas appeler un fournisseur quand l'enveloppe
// est pleine ». Retirer l'appel à la garde dans `ModelGateway.generate`,
// ou retirer la garde de `buildDiagnosticGateway`, fait échouer ce
// fichier — c'est la seule chose qui empêche le plafond de redevenir
// décoratif.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  INFERENCE_ENVELOPES,
  LEXIQUE_DOC_PATH,
  findForbiddenTerms,
  inferenceEnvelopeBudget,
  parseForbiddenTerms,
  type InferenceEnvelope,
} from "@sentio/config";

import { buildDiagnosticGateway } from "../diagnostic/index.js";
import { ModelGateway, type CredentialResolver, type ModelProvider } from "./index.js";
import {
  ENVELOPE_EXHAUSTED_MESSAGE,
  EnvelopeExhausted,
  EnvelopeGuard,
  type InferenceEnvelopeLedger,
} from "./envelope.js";

const PUBLIC = INFERENCE_ENVELOPES.publicDiagnostic;
const BUDGET = inferenceEnvelopeBudget(PUBLIC);

/** Un compteur en mémoire — même contrat que celui branché sur Postgres, sans base. */
function ledgerAt(consumed: number) {
  const recorded: Array<{ envelope: InferenceEnvelope; providerKey: string; tokens: number }> = [];
  const ledger: InferenceEnvelopeLedger = {
    async consumed() {
      return consumed;
    },
    async record(envelope, providerKey, tokens) {
      recorded.push({ envelope, providerKey, tokens });
    },
  };
  return { ledger, recorded };
}

/** Un fournisseur qui compte ses appels : c'est lui qui prouve qu'une requête refusée n'est pas
 *  d'abord payée. */
function countingProvider(inputTokens = 120, outputTokens = 30) {
  const calls: number[] = [];
  const provider: ModelProvider = {
    name: "groq",
    async generate() {
      calls.push(1);
      return {
        text: "réponse",
        toolCalls: [],
        usage: { inputTokens, outputTokens, provider: "groq" as const },
      };
    },
  };
  return { provider, calls };
}

const RESOLVER: CredentialResolver = {
  async resolve() {
    return [{ provider: "groq", dataPolicy: "free", apiKey: "clé-de-test" }];
  },
};

const REQUEST = {
  tenantId: "platform-diagnostic",
  dataClass: "test" as const,
  system: "système",
  messages: [{ kind: "text" as const, role: "user" as const, content: "bonjour" }],
};

describe("l'enveloppe d'inférence du diagnostic public", () => {
  it("refuse l'appel quand l'enveloppe est pleine, sans toucher au fournisseur", async () => {
    const { ledger } = ledgerAt(BUDGET);
    const { provider, calls } = countingProvider();
    const gateway = new ModelGateway(RESOLVER, new EnvelopeGuard(PUBLIC, ledger)).register(provider);

    await expect(gateway.generate(REQUEST)).rejects.toBeInstanceOf(EnvelopeExhausted);
    expect(calls).toHaveLength(0);
  });

  it("laisse passer tant qu'il reste de la place, et compte ce qui a été dépensé", async () => {
    const { ledger, recorded } = ledgerAt(BUDGET - 1);
    const { provider, calls } = countingProvider(120, 30);
    const gateway = new ModelGateway(RESOLVER, new EnvelopeGuard(PUBLIC, ledger)).register(provider);

    const result = await gateway.generate(REQUEST);

    expect(result.text).toBe("réponse");
    expect(calls).toHaveLength(1);
    // 120 + 30 : le comptage porte sur ce qui a réellement été consommé, entrée et sortie.
    expect(recorded).toEqual([{ envelope: PUBLIC, providerKey: "groq", tokens: 150 }]);
  });

  it("ne compte rien quand le fournisseur échoue — une enveloppe se remplit de dépenses réelles", async () => {
    const { ledger, recorded } = ledgerAt(0);
    const provider: ModelProvider = {
      name: "groq",
      async generate() {
        throw new Error("fournisseur indisponible");
      },
    };
    const gateway = new ModelGateway(RESOLVER, new EnvelopeGuard(PUBLIC, ledger)).register(provider);

    await expect(gateway.generate(REQUEST)).rejects.toThrow();
    expect(recorded).toHaveLength(0);
  });

  it("ferme aussi le flux quand l'enveloppe est pleine", async () => {
    const { ledger } = ledgerAt(BUDGET);
    const gateway = new ModelGateway(RESOLVER, new EnvelopeGuard(PUBLIC, ledger));

    await expect(async () => {
      for await (const _ of gateway.stream(REQUEST)) void _;
    }).rejects.toBeInstanceOf(EnvelopeExhausted);
  });
});

describe("le câblage du diagnostic public — la garde est réellement branchée", () => {
  // ⚠️ LE test de cette tâche. Il ne double pas le Gateway : il construit celui que la Server
  // Action construit, et vérifie qu'il refuse. Si `buildDiagnosticGateway` cessait de poser
  // l'enveloppe, l'appel remonterait une toute autre erreur (clé absente, ou panne réseau) et ce
  // test échouerait.
  it("refuse un tour de diagnostic quand l'enveloppe publique est épuisée", async () => {
    const { ledger } = ledgerAt(BUDGET);
    const gateway = buildDiagnosticGateway(ledger);

    const erreur = await gateway.generate(REQUEST).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(EnvelopeExhausted);
    expect((erreur as EnvelopeExhausted).envelope).toBe(PUBLIC);
    expect((erreur as EnvelopeExhausted).detail).toContain("public_diagnostic");
  });

  it("plafonne le diagnostic public, pas les employés vendus", () => {
    // La part des employés vendus est un plancher réservé : l'enveloppe publique ne peut pas
    // l'entamer, et son budget est donc strictement plus petit.
    expect(BUDGET).toBeLessThan(inferenceEnvelopeBudget(INFERENCE_ENVELOPES.soldEmployees));
  });
});

describe("le message rendu au visiteur", () => {
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const terms = parseForbiddenTerms(readFileSync(`${repoRoot}${LEXIQUE_DOC_PATH}`, "utf8"));

  it("respecte le lexique", () => {
    expect(findForbiddenTerms(ENVELOPE_EXHAUSTED_MESSAGE, terms)).toHaveLength(0);
  });

  it("ne laisse fuir aucun chiffre d'exploitation", () => {
    // Le détail chiffré existe — pour le journal serveur, jamais pour le visiteur.
    const erreur = new EnvelopeExhausted(PUBLIC, BUDGET, BUDGET);
    expect(erreur.message).toBe(ENVELOPE_EXHAUSTED_MESSAGE);
    expect(erreur.message).not.toContain(String(BUDGET));
    expect(erreur.detail).toContain(String(BUDGET));
  });
});
