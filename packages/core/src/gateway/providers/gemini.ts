// ════════════════════════════════════════════════════════════════════
// Provider Gemini — premier fournisseur branché sur le ModelGateway.
// ADR-006 : free tier + clause EEA = no-train pour les tenants européens.
// API REST officielle (generateContent), zéro dépendance externe (fetch).
// ════════════════════════════════════════════════════════════════════

import type {
  GenerateRequest,
  GenerateResult,
  ModelProvider,
  TenantCredential,
} from "../index.js";
import { GatewayError } from "../index.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Variantes gratuites de Gemini, CHACUNE avec son propre quota (ADR-012).
 *  Quand l'une est à court, on bascule sur la suivante — zéro compte ou
 *  clé supplémentaire, ce sont les mêmes identifiants Gemini/Google AI
 *  Studio pour toutes. Ordre: la plus capable d'abord. */
const DEFAULT_MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

const MAX_LOOPS = 3; // on reboucle sur toute la chaîne au plus 3 fois avant d'abandonner
const DEFAULT_BACKOFF_MS = 5000;

/** Outil au format Gemini (functionDeclarations). */
interface GeminiTool {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

function isQuotaError(status: number): boolean {
  return status === 429; // RESOURCE_EXHAUSTED — jamais pour une autre erreur (4xx/5xx logique)
}

/** Extrait le délai suggéré par Google ("Please retry in 35.2s") si présent,
 *  sinon retombe sur un backoff par défaut. Évite de reboucler trop vite. */
function parseRetryDelayMs(detail: string): number {
  const match = detail.match(/retry in ([\d.]+)s/i);
  const seconds = match?.[1];
  return seconds ? Math.ceil(parseFloat(seconds) * 1000) : DEFAULT_BACKOFF_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiProvider implements ModelProvider {
  readonly name = "gemini" as const;

  /** Chaîne de modèles de secours, dans l'ordre d'essai. */
  constructor(private readonly modelChain: string[] = DEFAULT_MODEL_CHAIN) {}

  async generate(req: GenerateRequest, cred: TenantCredential): Promise<GenerateResult> {
    let lastError: Error | null = null;

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      for (const model of this.modelChain) {
        try {
          return await this.callModel(model, req, cred);
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          const quotaMatch = e.message.match(/^Gemini (\d+):(.*)$/s);
          if (quotaMatch && isQuotaError(Number(quotaMatch[1]))) {
            lastError = e;
            continue; // ce modèle est à court → on essaie le suivant de la chaîne
          }
          throw e; // erreur non liée au quota : on ne boucle pas dessus, on remonte
        }
      }
      // Toute la chaîne est à court : on attend avant de reboucler (archi
      // §10 résilience — dégradation propre plutôt qu'échec immédiat).
      if (loop < MAX_LOOPS - 1 && lastError) {
        await sleep(parseRetryDelayMs(lastError.message));
      }
    }

    throw new GatewayError(
      `Tous les modèles Gemini (${this.modelChain.join(", ")}) sont à court de quota ` +
        `après ${MAX_LOOPS} tentatives. Dernière erreur: ${lastError?.message ?? "inconnue"}`
    );
  }

  private async callModel(
    model: string,
    req: GenerateRequest,
    cred: TenantCredential
  ): Promise<GenerateResult> {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      // Encodage NATIF du function-calling multi-tours (voir ADR-011) :
      // un tour "model" avec functionCall doit être immédiatement suivi
      // d'un tour "user" avec functionResponse — jamais de texte narratif
      // imitant un appel, sous peine que le modèle imite ce texte à son
      // tour au lieu d'émettre un vrai appel structuré.
      contents: req.messages.map((m) => {
        if (m.kind === "tool_call") {
          return { role: "model", parts: [{ functionCall: { name: m.toolKey, args: m.input } }] };
        }
        if (m.kind === "tool_result") {
          // functionResponse.response doit être un objet ; on enveloppe
          // les résultats scalaires/tableaux pour respecter le contrat.
          const response =
            m.result && typeof m.result === "object" && !Array.isArray(m.result)
              ? m.result
              : { value: m.result };
          return { role: "user", parts: [{ functionResponse: { name: m.toolKey, response } }] };
        }
        return { role: m.role === "model" ? "model" : "user", parts: [{ text: m.content }] };
      }),
      ...(req.tools?.length
        ? { tools: [{ functionDeclarations: req.tools as GeminiTool[] }] }
        : {}),
      generationConfig: { maxOutputTokens: req.maxTokens ?? 4096 },
    };

    const url = `${BASE_URL}/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // La clé BYOK du tenant — jamais une clé globale (ADR-005).
        "x-goog-api-key": cred.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // 429 = quota épuisé pour CE modèle → generate() bascule sur le
      // suivant de la chaîne (ADR-012). Le préfixe "Gemini {status}:" est
      // le contrat parsé par isQuotaError, ne pas le reformuler.
      const detail = await res.text().catch(() => "");
      throw new GatewayError(`Gemini ${res.status}: ${detail.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: unknown } }> };
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return {
      text: parts.map((p) => p.text ?? "").join(""),
      toolCalls: parts
        .filter((p) => p.functionCall)
        .map((p) => ({ name: p.functionCall!.name, input: p.functionCall!.args })),
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        provider: this.name,
        model,
      },
    };
  }
}
