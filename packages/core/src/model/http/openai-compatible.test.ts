import { describe, expect, it } from "vitest";

import { PermanentProviderError, ProviderQuotaExceeded, ProviderUnavailable } from "../../errors.js";
import type { ModelRequest } from "../provider.js";
import { OpenAICompatibleProvider, estimateTokens, toChatMessages } from "./openai-compatible.js";

/** Aucun test ne sort sur le réseau : `fetch` est injecté. */
function providerWith(responder: (...args: never[]) => Promise<Response>) {
  return new OpenAICompatibleProvider({
    key: "fournisseur",
    dataPolicy: "no_train",
    baseUrl: "https://exemple.invalid/v1",
    model: "petit-modele",
    apiKey: "clé-de-test",
    fetchImpl: responder as unknown as typeof fetch,
  });
}

const request: ModelRequest = {
  turns: [{ role: "user", type: "text", text: "bonjour" }],
  dataClass: "synthetic",
  envelope: "internal",
  tenantId: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Adaptateur de fournisseur", () => {
  it("traduit nos tours sans laisser fuir le vocabulaire du produit", () => {
    const messages = toChatMessages([
      { role: "system", type: "text", text: "ADN" },
      { role: "assistant", type: "capability_call", callId: "1", capabilityKey: "envoyer_message", input: { a: 1 } },
      { role: "capability", type: "capability_result", callId: "1", output: "ok", failed: false },
    ]);

    expect(messages.map((m) => m.role)).toEqual(["system", "assistant", "tool"]);
    expect(messages[1]?.content).toContain("envoyer_message");
    expect(messages[2]?.tool_call_id).toBe("1");
  });

  it("rend la réponse et le comptage du fournisseur", async () => {
    const provider = providerWith(async () =>
      jsonResponse({ choices: [{ message: { content: "voici" } }], usage: { total_tokens: 123 } }),
    );

    const completion = await provider.complete(request);

    expect(completion.turn).toMatchObject({ type: "text", text: "voici" });
    expect(completion.tokens).toBe(123);
  });

  it("ne compte jamais zéro quand le fournisseur ne dit rien", async () => {
    const provider = providerWith(async () => jsonResponse({ choices: [{ message: { content: "abcd" } }] }));

    // Un comptage à zéro rendrait les plafonds décoratifs — c'est la panne silencieuse type.
    expect((await provider.complete(request)).tokens).toBe(estimateTokens("abcd"));
  });

  it("traduit 429 en quota — donc en repli autorisé", async () => {
    const provider = providerWith(async () => new Response("trop vite", { status: 429 }));
    await expect(provider.complete(request)).rejects.toBeInstanceOf(ProviderQuotaExceeded);
  });

  it("traduit une panne serveur en indisponibilité passagère", async () => {
    const provider = providerWith(async () => new Response("oups", { status: 503 }));
    await expect(provider.complete(request)).rejects.toBeInstanceOf(ProviderUnavailable);
  });

  it("ne replie PAS sur une clé refusée", async () => {
    const provider = providerWith(async () => new Response("clé invalide", { status: 401 }));

    // Sinon le produit tournerait sur le fournisseur de secours sans que personne ne le sache.
    await expect(provider.complete(request)).rejects.toBeInstanceOf(PermanentProviderError);
  });

  it("traite une réponse inexploitable comme une erreur logique", async () => {
    const provider = providerWith(async () => jsonResponse({ choices: [] }));
    await expect(provider.complete(request)).rejects.toBeInstanceOf(PermanentProviderError);
  });

  it("traite une coupure réseau comme passagère", async () => {
    const provider = providerWith(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(provider.complete(request)).rejects.toBeInstanceOf(ProviderUnavailable);
  });
});
