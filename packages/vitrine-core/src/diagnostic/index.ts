// ════════════════════════════════════════════════════════════════════
// Le diagnostic — la conversation qui alimente le moteur de calibrage.
//
// Ce module ne décide jamais rien lui-même : il fait dialoguer un
// modèle avec le visiteur jusqu'à ce qu'un profil structuré puisse être
// extrait, puis passe la main à `@sentio/domain` — `parseDiagnosticProfile`
// (ACQUIS-13) et `recommend()` (ACQUIS-14), tous deux purs et testés
// sans réseau. C'est la même séparation que le conseiller : le modèle
// rédige, il ne juge pas (`docs/07-parcours-produit.md`).
//
// `stepDiagnostic` est la seule fonction à connaître, et elle est pure
// vis-à-vis de son port `converse` : tout le comportement observable
// (combien de tentatives, quel indice, quelle décision) se teste avec
// un faux modèle, sans clé d'API ni réseau.
// ════════════════════════════════════════════════════════════════════

import { parseDiagnosticProfile, recommend, type RecommendationDecision } from "@sentio/domain";
import { ModelGateway } from "../gateway/index.js";
import type { ConversationTurn, CredentialResolver, TenantCredential } from "../gateway/index.js";
import { GroqProvider } from "../gateway/providers/groq.js";
import { buildDiagnosticSystemPrompt, EXTRACTION_TOOL } from "./prompt.js";
import { buildPresentationPrompt, PRESENTATION_TOOL, type PresentEmployeeDeps } from "./presentation.js";

export { presentEmployee, type EmployeePresentation } from "./presentation.js";

const PLATFORM_TENANT = "platform-diagnostic";

/** Une vraie collecte a besoin de plus de tours qu'une question au conseiller — assez pour
 *  couvrir frein, objectif, cible, sans perdre le fil d'une conversation longue. */
const MAX_HISTORY = 16;

export interface DiagnosticMessage {
  role: "user" | "assistant";
  content: string;
}

export type DiagnosticStepResult =
  | { readonly stage: "conversation"; readonly reply: string }
  | { readonly stage: "decided"; readonly decision: RecommendationDecision };

/** Ce qu'un tour de modèle peut rendre : soit on continue à parler, soit un candidat de profil
 *  est prêt à être vérifié. Jamais les deux — c'est le modèle qui choisit, via l'appel d'outil. */
export type ConverseOutcome = { readonly reply: string } | { readonly candidate: unknown };

export interface DiagnosticStepDeps {
  converse(input: {
    history: readonly DiagnosticMessage[];
    hint?: readonly string[];
  }): Promise<ConverseOutcome>;
}

/** Tente d'aboutir à une décision depuis un candidat extrait. Deux façons de ne pas y arriver,
 *  traitées de façon identique par l'appelant — un indice de ce qui manque, jamais une erreur
 *  brute :
 *
 *    · le candidat ne respecte même pas la forme d'un profil (`parseDiagnosticProfile` refuse) ;
 *    · le candidat est valide, mais `recommend()` répond `incomplet` — profil bien formé, trop
 *      mince pour décider. C'est le cas que le premier jet de ce module traitait à tort comme
 *      terminal : l'ADR-0010 est explicite, « un profil incomplet ne conclut pas, le diagnostic
 *      continue ». Un test l'a détecté avant que ça n'atteigne un visiteur.
 */
function tryDecide(
  candidate: unknown,
): { readonly decision: RecommendationDecision } | { readonly hint: readonly string[] } {
  const parsed = parseDiagnosticProfile(candidate);
  if (!parsed.ok) return { hint: parsed.violations.map((v) => v.field) };

  const decision = recommend(parsed.profile);
  if (decision.status === "incomplet") return { hint: decision.missing };
  return { decision };
}

/**
 * Un pas de diagnostic. Trois issues possibles :
 *
 *   1. le modèle continue la conversation → `conversation` ;
 *   2. un profil extrait aboutit à une vraie décision (`recommande` ou `hors_perimetre`)
 *      → `decided` ;
 *   3. un profil extrait n'aboutit à rien (forme invalide, ou moteur qui répond `incomplet`)
 *      → on retente une fois, avec un indice de ce qui manque. Un second échec d'affilée retombe
 *      sur une relance sobre plutôt que de boucler indéfiniment.
 */
export async function stepDiagnostic(
  history: readonly DiagnosticMessage[],
  deps: DiagnosticStepDeps,
): Promise<DiagnosticStepResult> {
  const first = await deps.converse({ history });
  if ("reply" in first) return { stage: "conversation", reply: first.reply };

  const firstTry = tryDecide(first.candidate);
  if ("decision" in firstTry) return { stage: "decided", decision: firstTry.decision };

  const second = await deps.converse({ history, hint: firstTry.hint });
  if ("reply" in second) return { stage: "conversation", reply: second.reply };

  const secondTry = tryDecide(second.candidate);
  if ("decision" in secondTry) return { stage: "decided", decision: secondTry.decision };

  return {
    stage: "conversation",
    reply: "Précisons encore un point avant que je puisse vous répondre précisément.",
  };
}

/** Construit le gateway du diagnostic — même schéma que `buildAdvisorGateway` (advisor/index.ts) :
 *  clé lue à l'appel, jamais capturée au chargement du module, données de classe `test` puisque
 *  aucun tenant n'existe encore à ce stade de la conversation. */
export function buildDiagnosticGateway(): ModelGateway {
  const resolver: CredentialResolver = {
    async resolve(): Promise<TenantCredential[]> {
      const key = process.env.GROQ_API_KEY;
      if (!key) return [];
      return [{ provider: "groq", dataPolicy: "free", apiKey: key }];
    },
  };
  return new ModelGateway(resolver).register(new GroqProvider());
}

/** L'implémentation réelle de `converse` — le seul endroit de ce module qui appelle un modèle.
 *  Non testée ici (réseau) : c'est `stepDiagnostic`, injecté d'un faux `converse`, qui porte les
 *  tests de comportement (retry, indice, décision). */
export function createModelConverse(gateway: ModelGateway): DiagnosticStepDeps["converse"] {
  return async ({ history, hint }) => {
    const messages: ConversationTurn[] = history.slice(-MAX_HISTORY).map((m) => ({
      kind: "text",
      role: m.role === "assistant" ? "model" : "user",
      content: m.content,
    }));

    const result = await gateway.generate({
      tenantId: PLATFORM_TENANT,
      dataClass: "test",
      system: buildDiagnosticSystemPrompt(hint),
      messages,
      tools: [EXTRACTION_TOOL],
      maxTokens: 500,
    });

    const call = result.toolCalls.find((c) => c.name === EXTRACTION_TOOL.name);
    if (call) return { candidate: call.input };
    return { reply: result.text };
  };
}

/** L'implémentation réelle de `PresentEmployeeDeps["present"]` — même gateway, un second appel,
 *  system prompt dédié (`buildPresentationPrompt`). Non testée ici pour la même raison que
 *  `createModelConverse` : c'est `presentEmployee`, injecté d'un faux `present`, qui porte les
 *  tests de comportement (repli, nettoyage des champs). */
export function createModelPresent(gateway: ModelGateway): PresentEmployeeDeps["present"] {
  return async ({ calibration, grounds }) => {
    const result = await gateway.generate({
      tenantId: PLATFORM_TENANT,
      dataClass: "test",
      system: buildPresentationPrompt(),
      messages: [
        {
          kind: "text",
          role: "user",
          content: JSON.stringify({ calibration, grounds }),
        },
      ],
      tools: [PRESENTATION_TOOL],
      maxTokens: 600,
    });

    const call = result.toolCalls.find((c) => c.name === PRESENTATION_TOOL.name);
    return call?.input ?? null;
  };
}
