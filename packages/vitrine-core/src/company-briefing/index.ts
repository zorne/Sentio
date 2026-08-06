// ════════════════════════════════════════════════════════════════════
// Le briefing — orchestration testable + câblage réel (Gemini, données
// réelles). Voir prompt.ts pour ce qui distingue ce module du
// diagnostic public.
// ════════════════════════════════════════════════════════════════════

import { ModelGateway } from "../gateway/index.js";
import type { ConversationTurn, CredentialResolver, TenantCredential } from "../gateway/index.js";
import { GeminiProvider } from "../gateway/providers/gemini.js";
import { buildBriefingSystemPrompt, BRIEFING_TOOL } from "./prompt.js";

const MAX_HISTORY = 16;

export interface BriefingMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BriefingConfiguration {
  readonly criteria: string;
  readonly offer: string;
}

export type BriefingStepResult =
  | { readonly stage: "conversation"; readonly reply: string }
  | { readonly stage: "configured"; readonly configuration: BriefingConfiguration };

export type BriefingConverseOutcome = { readonly reply: string } | { readonly candidate: unknown };

export interface BriefingStepDeps {
  converse(input: {
    history: readonly BriefingMessage[];
    hint?: readonly string[];
  }): Promise<BriefingConverseOutcome>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Validation défensive du candidat — jamais fait confiance à sa forme. `null` s'il manque
 *  un des deux champs, avec le nom du champ manquant pour guider la relance. */
function tryConfigure(candidate: unknown): { configuration: BriefingConfiguration } | { hint: readonly string[] } {
  if (typeof candidate !== "object" || candidate === null) {
    return { hint: ["le profil de bon prospect", "l'offre à mettre en avant"] };
  }
  const c = candidate as Record<string, unknown>;
  const missing: string[] = [];
  if (!isNonEmptyString(c.criteria)) missing.push("le profil de bon prospect");
  if (!isNonEmptyString(c.offer)) missing.push("l'offre à mettre en avant");
  if (missing.length > 0) return { hint: missing };

  return {
    configuration: {
      criteria: (c.criteria as string).trim(),
      offer: (c.offer as string).trim(),
    },
  };
}

/** Même structure que `stepDiagnostic` (../diagnostic) : un candidat invalide retente une fois
 *  avec un indice, un second échec retombe sur une relance sobre plutôt que de boucler. */
export async function stepBriefing(
  history: readonly BriefingMessage[],
  deps: BriefingStepDeps,
): Promise<BriefingStepResult> {
  const first = await deps.converse({ history });
  if ("reply" in first) return { stage: "conversation", reply: first.reply };

  const firstTry = tryConfigure(first.candidate);
  if ("configuration" in firstTry) return { stage: "configured", configuration: firstTry.configuration };

  const second = await deps.converse({ history, hint: firstTry.hint });
  if ("reply" in second) return { stage: "conversation", reply: second.reply };

  const secondTry = tryConfigure(second.candidate);
  if ("configuration" in secondTry) return { stage: "configured", configuration: secondTry.configuration };

  return {
    stage: "conversation",
    reply: "Encore un point avant de pouvoir l'enregistrer.",
  };
}

/** Câblage réel — Gemini uniquement, `no_train`, jamais de repli Groq : ce module manipule des
 *  données réelles d'un client authentifié (`docs/adr/0004`), à l'inverse du diagnostic public. */
export function buildBriefingGateway(): ModelGateway {
  const resolver: CredentialResolver = {
    async resolve(): Promise<TenantCredential[]> {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return [];
      return [{ provider: "gemini", dataPolicy: "no_train", apiKey: key }];
    },
  };
  return new ModelGateway(resolver).register(new GeminiProvider());
}

export function createBriefingConverse(gateway: ModelGateway, tenantId: string): BriefingStepDeps["converse"] {
  return async ({ history, hint }) => {
    const messages: ConversationTurn[] = history.slice(-MAX_HISTORY).map((m) => ({
      kind: "text",
      role: m.role === "assistant" ? "model" : "user",
      content: m.content,
    }));

    const result = await gateway.generate({
      tenantId,
      dataClass: "real",
      system: buildBriefingSystemPrompt(hint),
      messages,
      tools: [BRIEFING_TOOL],
      maxTokens: 500,
    });

    const call = result.toolCalls.find((c) => c.name === BRIEFING_TOOL.name);
    if (call) return { candidate: call.input };
    return { reply: result.text };
  };
}
