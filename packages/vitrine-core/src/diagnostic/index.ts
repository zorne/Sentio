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

import { INFERENCE_ENVELOPES } from "@sentio/config";
import {
  parseDiagnosticProfile,
  recommend,
  type DiagnosticProfile,
  type RecommendationDecision,
} from "@sentio/domain";
import { EnvelopeGuard, ModelGateway } from "../gateway/index.js";
import type {
  ConversationTurn,
  CredentialResolver,
  InferenceEnvelopeLedger,
  TenantCredential,
} from "../gateway/index.js";
import { GroqProvider } from "../gateway/providers/groq.js";
import { buildDiagnosticSystemPrompt, EXTRACTION_TOOL } from "./prompt.js";
import { buildPresentationPrompt, PRESENTATION_TOOL, type PresentEmployeeDeps } from "./presentation.js";

export { presentEmployee, type EmployeePresentation } from "./presentation.js";

/** L'enveloppe d'inférence du chemin public (ACQUIS-18), ré-exportée ici : l'appelant du
 *  diagnostic n'a qu'une porte à connaître, et il ne peut pas construire le gateway sans passer
 *  par le compteur. */
export {
  ENVELOPE_EXHAUSTED_MESSAGE,
  EnvelopeExhausted,
  PostgresEnvelopeLedger,
  type InferenceEnvelopeLedger,
} from "../gateway/index.js";

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
  | {
      readonly stage: "decided";
      readonly decision: RecommendationDecision;
      /**
       * Le profil qui a produit cette décision, tel que la conversation l'a compris.
       *
       * ⚠️ Il est rendu pour être ÉCRIT au moment du recrutement : sans lui, on saurait ce que
       * Sentio a décidé, jamais à partir de quoi. Un dirigeant qui demande « pourquoi cette
       * configuration » n'aurait aucune réponse, et une réévaluation n'aurait rien à comparer.
       *
       * Il n'autorise rien par lui-même : la configuration est RECOMPOSÉE côté serveur à partir
       * de lui, jamais reprise de ce qui revient du navigateur.
       */
      readonly profil: DiagnosticProfile;
    };

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
):
  | { readonly decision: RecommendationDecision; readonly profil: DiagnosticProfile }
  | { readonly hint: readonly string[] } {
  const parsed = parseDiagnosticProfile(candidate);
  if (!parsed.ok) return { hint: parsed.violations.map((v) => v.field) };

  const decision = recommend(parsed.profile);
  if (decision.status === "incomplet") return { hint: decision.missing };
  return { decision, profil: parsed.profile };
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
  if ("decision" in firstTry) {
    return { stage: "decided", decision: firstTry.decision, profil: firstTry.profil };
  }

  const second = await deps.converse({ history, hint: firstTry.hint });
  if ("reply" in second) return { stage: "conversation", reply: second.reply };

  const secondTry = tryDecide(second.candidate);
  if ("decision" in secondTry) {
    return { stage: "decided", decision: secondTry.decision, profil: secondTry.profil };
  }

  return {
    stage: "conversation",
    reply: "Précisons encore un point avant que je puisse vous répondre précisément.",
  };
}

/** Construit le gateway du diagnostic — même schéma que `buildAdvisorGateway` (advisor/index.ts) :
 *  clé lue à l'appel, jamais capturée au chargement du module.
 *
 *  ⚠️ Cette phrase disait « données de classe `test` puisque aucun tenant n'existe encore à ce
 *  stade ». Le raisonnement confondait deux choses : qu'aucun TENANT ne soit encore créé ne rend
 *  pas la donnée moins RÉELLE. Le visiteur décrit son entreprise dès la première question
 *  (`adr/0009`), et l'étiquette « test » désarmait la règle d'or, qui ne filtre que sur « real ».
 *  Corrigé le 2026-08-29 ; la règle 10 des frontières l'empêche de revenir.
 *
 *  `ledger` est **obligatoire** (ACQUIS-18). Le diagnostic public consomme le quota partagé de la
 *  plateforme sans qu'aucun client n'ait rien signé : il ne peut pas exister de chemin qui le
 *  construise sans plafond. Un paramètre facultatif aurait rendu l'oubli possible, et l'oubli
 *  aurait rendu le découpage en enveloppes décoratif (`docs/11-exploitation.md`). */
export function buildDiagnosticGateway(ledger: InferenceEnvelopeLedger): ModelGateway {
  const resolver: CredentialResolver = {
    async resolve(): Promise<TenantCredential[]> {
      const key = process.env.GROQ_API_KEY;
      if (!key) return [];
      return [{ provider: "groq", dataPolicy: "free", apiKey: key }];
    },
  };
  const guard = new EnvelopeGuard(INFERENCE_ENVELOPES.publicDiagnostic, ledger);
  return new ModelGateway(resolver, guard).register(new GroqProvider());
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

    // ⚠️ « real », ET C'EST LA VÉRITÉ — L'ÉTIQUETTE PRÉCÉDENTE DÉSARMAIT TOUTE LA PROTECTION.
    //
    // Ce chemin envoie ce que le dirigeant vient de taper : le nom de son entreprise, son
    // secteur, son effectif, ses difficultés, son objectif. `adr/0009` le dit mot pour mot —
    // « le diagnostic manipulant de la donnée réelle dès la première question ».
    //
    // Il était marqué `"test"`. Or la règle d'or ne filtre que sur `dataClass === "real"`
    // (`gateway/index.ts:142`) : sous cette étiquette, elle ne se déclenchait JAMAIS. Un
    // fournisseur `free` — qui s'autorise à entraîner — recevait des données réelles sans qu'une
    // seule ligne ne s'y oppose. Ce n'était pas un risque à venir : c'était une fuite écrite.
    //
    // ⚠️ CONSÉQUENCE ASSUMÉE, DÉCIDÉE PAR LE FONDATEUR LE 2026-08-29 : tant que le seul
    // fournisseur branché est Groq en `free`, ce diagnostic ÉCHOUE — franchement, avec
    // « groq: sauté (free/train incompatible avec données réelles) ». `adr/0009` écarte Groq
    // (américain, transfert hors UE) et retient Mistral ; le code disait l'inverse en silence.
    //
    // Un diagnostic éteint est un défaut visible. Un diagnostic ouvert qui ment sur sa classe de
    // données est un risque juridique invisible. Entre les deux, on prend le défaut visible.
    const result = await gateway.generate({
      tenantId: PLATFORM_TENANT,
      dataClass: "real",
      system: buildDiagnosticSystemPrompt(hint),
      messages,
      tools: [EXTRACTION_TOOL],
      // ⚠️ TAILLÉ POUR UN MODÈLE QUI RAISONNE. 500 suffisaient à l'ancien modèle, qui écrivait
      // directement ; celui d'aujourd'hui réfléchit d'abord, sur le même budget, et sa question
      // se faisait couper en plein milieu. L'effort de raisonnement est déjà bas côté fournisseur
      // — cette marge est la seconde sécurité, pour que le plafond ne décide jamais du texte.
      maxTokens: 1200,
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
      // « real » : cette présentation reçoit le calibrage et les constats tirés de l'entreprise du
      // visiteur. Même raison qu'au-dessus, même conséquence.
      dataClass: "real",
      system: buildPresentationPrompt(),
      messages: [
        {
          kind: "text",
          role: "user",
          content: JSON.stringify({ calibration, grounds }),
        },
      ],
      tools: [PRESENTATION_TOOL],
      maxTokens: 1400,
    });

    const call = result.toolCalls.find((c) => c.name === PRESENTATION_TOOL.name);
    return call?.input ?? null;
  };
}
