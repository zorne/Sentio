// ════════════════════════════════════════════════════════════════════
// Le briefing — orchestration testable + câblage réel (Gemini, données
// réelles). Voir prompt.ts pour ce qui distingue ce module du
// diagnostic public.
// ════════════════════════════════════════════════════════════════════

import { ModelGateway } from "../gateway/index.js";
import type { ConversationTurn, CredentialResolver, TenantCredential } from "../gateway/index.js";
import { GeminiProvider } from "../gateway/providers/gemini.js";
import { buildBriefingSystemPrompt, BRIEFING_TOOL } from "./prompt.js";
import { parseProfile, type CompanyProfile, type ProfileKey } from "./profile.js";

export {
  PROFILE_FIELDS,
  REQUIRED_FIELDS,
  buildProfileBriefing,
  composeSystemPrompt,
  parseProfile,
  readProfileFromConfig,
  type CompanyProfile,
  type ProfileKey,
} from "./profile.js";

export { saveCompanyProfile, type Queryable } from "./store.js";

const MAX_HISTORY = 16;

export interface BriefingMessage {
  role: "user" | "assistant";
  content: string;
}

/** Ce qu'on redit au modèle quand une clé exigée manque — en français adressé au client,
 *  jamais le nom technique du champ. */
const MANQUE: Record<ProfileKey, string> = {
  activite: "ce que fait l'entreprise",
  cible: "le profil de bon prospect",
  offre: "l'offre à mettre en avant",
  preuves: "les résultats concrets à citer",
  objections: "les objections fréquentes",
  exclusions: "qui ne jamais contacter",
  ton: "le ton à adopter",
  interdits: "ce qu'il ne faut jamais promettre",
};

export type BriefingStepResult =
  | { readonly stage: "conversation"; readonly reply: string }
  | { readonly stage: "configured"; readonly profile: CompanyProfile };

export type BriefingConverseOutcome = { readonly reply: string } | { readonly candidate: unknown };

export interface BriefingStepDeps {
  converse(input: {
    history: readonly BriefingMessage[];
    hint?: readonly string[];
  }): Promise<BriefingConverseOutcome>;
}

/** Validation défensive du candidat — jamais fait confiance à sa forme. Les clés exigées
 *  manquantes reviennent en clair, pour guider la relance. */
function tryConfigure(candidate: unknown): { profile: CompanyProfile } | { hint: readonly string[] } {
  const parsed = parseProfile(candidate);
  if ("profile" in parsed) return parsed;
  return { hint: parsed.missing.map((key) => MANQUE[key]) };
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
  if ("profile" in firstTry) return { stage: "configured", profile: firstTry.profile };

  const second = await deps.converse({ history, hint: firstTry.hint });
  if ("reply" in second) return { stage: "conversation", reply: second.reply };

  const secondTry = tryConfigure(second.candidate);
  if ("profile" in secondTry) return { stage: "configured", profile: secondTry.profile };

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
