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

const DEFAULT_MODEL = "gemini-2.5-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Outil au format Gemini (functionDeclarations). */
interface GeminiTool {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export class GeminiProvider implements ModelProvider {
  readonly name = "gemini" as const;

  constructor(private readonly model: string = DEFAULT_MODEL) {}

  async generate(req: GenerateRequest, cred: TenantCredential): Promise<GenerateResult> {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      ...(req.tools?.length
        ? { tools: [{ functionDeclarations: req.tools as GeminiTool[] }] }
        : {}),
      generationConfig: { maxOutputTokens: req.maxTokens ?? 4096 },
    };

    const url = `${BASE_URL}/${this.model}:generateContent`;
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
      // 429 = quota free tier épuisé → le gateway pourra basculer sur le
      // fallback (Cloudflare) quand il sera branché. On remonte propre.
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
      },
    };
  }
}
