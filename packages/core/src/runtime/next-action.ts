/**
 * EXEC-04 — demander la prochaine action, et ne jamais confondre proposer et décider.
 *
 * ══ L'ENCHAÎNEMENT, ET CE QU'IL INTERDIT ══
 *
 *     contexte fiable → Model Gateway → PROPOSITION → Policy Engine → autorisée ou refusée → journal
 *
 * Jamais « modèle → exécution ». Le modèle **propose** une action ; le domaine **décide** si elle
 * est permise. Une injection réussie dans un email entrant, une consigne glissée dans un nom
 * d'entreprise, une hallucination franche : aucune ne peut produire un effet, parce qu'aucune ne
 * traverse le Policy Engine autrement qu'en tant que proposition (`docs/10-securite-rgpd.md`).
 *
 * **Ce module n'exécute rien.** Il rend une décision ; l'exécution est `EXEC-06`. Cette
 * séparation n'est pas de la ponctuation : tant qu'aucun code de ce fichier n'appelle un moteur
 * de capacité, il n'existe pas de chemin par lequel une réponse de modèle devient un effet.
 *
 * ══ CE QUE LE GATEWAY REÇOIT ══
 *
 * Le contexte assemblé (EXEC-03), et le strict nécessaire au pas courant : la liste des capacités
 * autorisées et la forme de réponse attendue. Rien d'autre — ni identifiants techniques, ni
 * secrets, ni données d'une autre entreprise. Le `tenantId` traverse pour le comptage et le
 * routage, pas pour être lu par un modèle.
 *
 * ══ CE QUE CE MODULE NE FAIT PAS, VOLONTAIREMENT ══
 *
 *   · aucun appel de fournisseur : le Gateway est le point de passage unique (`NOYAU-04`) ;
 *   · aucune connaissance des identifiants de fournisseur : ils n'existent qu'au bord ;
 *   · aucun repli. Ni vers un autre modèle — le Gateway s'en charge, dans la même classe de
 *     données —, ni vers une autre action. Une proposition illisible est refusée, pas remplacée
 *     par une action « raisonnable » : c'est la porte par laquelle un employé se met à faire des
 *     choses que personne ne lui a demandées ;
 *   · aucun rattrapage de quota ou de panne : `TaskDeferred`, `NonCompliantRouting` et les
 *     erreurs de fournisseur remontent telles quelles. Les avaler transformerait un report
 *     explicite en travail silencieusement non fait.
 *
 * Réalise : EXEC-04
 */

import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

import type { ConversationTurn } from "../conversation/turn.js";
import { textOf } from "../conversation/turn.js";
import { CapabilityUnavailable } from "../errors.js";
import type { CapabilityRegistry } from "../capability/registry.js";
import type { ModelGateway } from "../model/gateway.js";
import type { DataClass } from "../model/provider.js";
import type { AutonomyLevel, PolicyDecision, PolicyEngine } from "../policy/engine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Ce que le modèle a le droit de répondre
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionProposee {
  readonly kind: "action";
  readonly capabilityKey: string;
  readonly input: Record<string, unknown>;
  /** Pourquoi cette action, dans les mots du modèle. Journalisé : sans lui, un refus plus tard
   *  est inexplicable au client. */
  readonly rationale: string;
}

export interface FinProposee {
  readonly kind: "termine";
  readonly rationale: string;
}

export type Proposition = ActionProposee | FinProposee;

/** Pourquoi une réponse est refusée. Jamais « au mieux » : chaque cas a son nom. */
export type RefusLecture =
  | "reponse_vide"
  | "json_illisible"
  | "forme_invalide"
  | "capacite_manquante"
  | "entree_invalide"
  | "champ_inconnu";

export type LectureProposition =
  | { readonly ok: true; readonly proposition: Proposition }
  | { readonly ok: false; readonly refus: RefusLecture; readonly detail: string };

const CHAMPS_ACTION = new Set(["action", "capacite", "entree", "pourquoi"]);
const CHAMPS_FIN = new Set(["action", "pourquoi"]);

/**
 * La consigne de forme, donnée au modèle avec le contexte.
 *
 * Elle n'est **pas** un rempart : une consigne de rédaction se contourne, et c'est précisément
 * pourquoi `readProposition` valide la réponse au lieu de lui faire confiance. Elle existe pour
 * que le cas nominal soit lisible, pas pour empêcher le cas fautif.
 */
export function proposalInstruction(capacitesAutorisees: readonly string[]): string {
  return [
    "Vous ne faites rien vous-même : vous proposez UNE seule prochaine action, et quelqu'un",
    "d'autre décide si elle est permise.",
    "",
    "Répondez uniquement par un objet JSON, sans texte autour, sous l'une de ces deux formes :",
    '  {"action":"agir","capacite":"<clé>","entree":{...},"pourquoi":"<une phrase>"}',
    '  {"action":"terminer","pourquoi":"<une phrase>"}',
    "",
    `Capacités autorisées, et aucune autre : ${capacitesAutorisees.join(", ")}.`,
    "Si aucune ne convient, terminez — n'en inventez jamais une.",
  ].join("\n");
}

/** Isole le premier objet JSON d'une réponse. Les modèles encadrent volontiers de ```json. */
function extraireJson(texte: string): string | null {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut === -1 || fin === -1 || fin <= debut) return null;
  return texte.slice(debut, fin + 1);
}

/**
 * Lit la réponse du modèle. **Strictement.**
 *
 * Refuse plutôt que d'interpréter, y compris sur les cas où « on voit bien ce qu'il voulait
 * dire » : un champ en trop est refusé, parce qu'un champ en trop est le plus souvent une
 * consigne injectée qui a survécu jusqu'ici (`{"action":"agir",…,"executer_directement":true}`).
 * Un champ ignoré en silence est un champ qu'on n'aura pas vu passer.
 *
 * La validation de la capacité contre la liste autorisée n'est PAS faite ici : c'est une décision
 * de politique, elle appartient au domaine (`decideNextAction`). Ici, on ne lit que la forme.
 */
export function readProposition(texte: string): LectureProposition {
  if (texte.trim() === "") {
    return { ok: false, refus: "reponse_vide", detail: "Le modèle n'a rien répondu." };
  }

  const brut = extraireJson(texte);
  if (brut === null) {
    return { ok: false, refus: "json_illisible", detail: "Aucun objet JSON dans la réponse." };
  }

  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch (error) {
    return { ok: false, refus: "json_illisible", detail: `JSON invalide : ${String(error)}` };
  }

  if (typeof lu !== "object" || lu === null || Array.isArray(lu)) {
    return { ok: false, refus: "forme_invalide", detail: "La réponse n'est pas un objet." };
  }
  const objet = lu as Record<string, unknown>;

  const action = objet["action"];
  if (action !== "agir" && action !== "terminer") {
    return {
      ok: false,
      refus: "forme_invalide",
      detail: `« action » doit valoir « agir » ou « terminer » (reçu : ${JSON.stringify(action)}).`,
    };
  }

  const attendus = action === "agir" ? CHAMPS_ACTION : CHAMPS_FIN;
  const enTrop = Object.keys(objet).filter((cle) => !attendus.has(cle));
  if (enTrop.length > 0) {
    return {
      ok: false,
      refus: "champ_inconnu",
      detail: `Champs non prévus : ${enTrop.join(", ")}. Une réponse n'est jamais lue « au mieux ».`,
    };
  }

  const pourquoi = objet["pourquoi"];
  const rationale = typeof pourquoi === "string" ? pourquoi.trim() : "";
  if (rationale === "") {
    return {
      ok: false,
      refus: "forme_invalide",
      detail: "« pourquoi » est obligatoire : une action sans motif est inexplicable au client.",
    };
  }

  if (action === "terminer") {
    return { ok: true, proposition: { kind: "termine", rationale } };
  }

  const capacite = objet["capacite"];
  if (typeof capacite !== "string" || capacite.trim() === "") {
    return {
      ok: false,
      refus: "capacite_manquante",
      detail: "« capacite » est obligatoire pour agir.",
    };
  }

  const entree = objet["entree"];
  if (typeof entree !== "object" || entree === null || Array.isArray(entree)) {
    return {
      ok: false,
      refus: "entree_invalide",
      detail: "« entree » doit être un objet, même vide.",
    };
  }

  return {
    ok: true,
    proposition: {
      kind: "action",
      capabilityKey: capacite.trim(),
      input: entree as Record<string, unknown>,
      rationale,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// La décision
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionPas =
  /** Le domaine autorise. **Rien n'a encore été exécuté** — c'est EXEC-06. */
  | { readonly kind: "agir"; readonly proposition: ActionProposee; readonly decision: PolicyDecision }
  /** Un accord humain est attendu. */
  | { readonly kind: "suspendu"; readonly proposition: ActionProposee; readonly decision: PolicyDecision }
  /** Refusé par le domaine : hors périmètre, ou politique. */
  | { readonly kind: "refuse"; readonly raison: string }
  /** Le modèle estime le travail terminé. */
  | { readonly kind: "termine"; readonly raison: string }
  /** La réponse du modèle est inexploitable. Aucun repli n'est tenté. */
  | { readonly kind: "proposition_illisible"; readonly refus: RefusLecture; readonly detail: string };

export interface NextActionDeps {
  readonly gateway: ModelGateway;
  readonly policy: PolicyEngine;
  readonly registry: CapabilityRegistry;
  /** Le journal du pas. Le Gateway et le Policy Engine journalisent déjà les leurs ; celui-ci
   *  couvre ce qui n'appartient ni à l'un ni à l'autre : la proposition elle-même. */
  readonly journal: {
    append(entry: {
      tenantId: TenantId;
      taskId: TaskId;
      employeeId: EmployeeId;
      kind: string;
      payload: unknown;
      stepId?: string;
    }): Promise<void>;
  };
}

export interface NextActionInput {
  readonly tenantId: TenantId;
  readonly taskId: TaskId;
  readonly employeeId: EmployeeId;
  /** Le contexte assemblé (EXEC-03). Passé tel quel : ce module n'y ajoute que la forme attendue. */
  readonly turns: readonly ConversationTurn[];
  /** Les capacités que CET employé a le droit d'utiliser (`employee_capability`). */
  readonly capacitesAutorisees: readonly string[];
  readonly autonomy: AutonomyLevel;
  readonly dataClass: DataClass;
  readonly envelope: string;
  readonly maxTokens?: number;
  /** Le pas de run : ce qui relie cette proposition à son contexte et à sa décision (EXEC-07). */
  readonly stepId?: string;
}

/** Insère la consigne de forme parmi les consignes permanentes, jamais après la tâche :
 *  `assertWellFormed` impose que tout ce qui est « système » ouvre la conversation. */
function avecConsigneDeForme(
  turns: readonly ConversationTurn[],
  capacites: readonly string[],
): ConversationTurn[] {
  const consigne: ConversationTurn = {
    role: "system",
    type: "text",
    text: proposalInstruction(capacites),
  };
  const dernierSysteme = turns.reduce(
    (rang, turn, index) => (turn.role === "system" ? index : rang),
    -1,
  );
  const copie = [...turns];
  copie.splice(dernierSysteme + 1, 0, consigne);
  return copie;
}

/**
 * Demande la prochaine action, puis la soumet au domaine.
 *
 * Les erreurs du Gateway — report de quota, routage non conforme, panne de fournisseur — ne sont
 * **pas** capturées. Elles remontent à l'appelant, qui décide de reporter le run. Les capturer
 * ici les transformerait en « le modèle n'a rien proposé », c'est-à-dire en travail non fait sans
 * que personne ne sache pourquoi.
 */
export async function decideNextAction(
  deps: NextActionDeps,
  input: NextActionInput,
): Promise<DecisionPas> {
  const resultat = await deps.gateway.complete({
    turns: avecConsigneDeForme(input.turns, input.capacitesAutorisees),
    dataClass: input.dataClass,
    envelope: input.envelope,
    tenantId: input.tenantId,
    ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
  });

  const lecture = readProposition(textOf([resultat.turn]));

  // Le coût est enregistré par le Gateway (`record`) ; on trace ici ce qu'il ne voit pas : ce qui
  // a été proposé, par quel fournisseur, et pour combien de jetons. Un refus plus loin doit
  // pouvoir être expliqué sans rejouer l'appel.
  await deps.journal.append({
    tenantId: input.tenantId,
    taskId: input.taskId,
    employeeId: input.employeeId,
    kind: lecture.ok ? "proposition_recue" : "proposition_illisible",
    ...(input.stepId !== undefined && { stepId: input.stepId }),
    payload: {
      fournisseur: resultat.providerKey,
      jetons: resultat.tokens,
      ecartes: resultat.skipped,
      ...(lecture.ok
        ? { proposition: lecture.proposition }
        : { refus: lecture.refus, detail: lecture.detail }),
    },
  });

  if (!lecture.ok) {
    // Aucun second essai, aucune action de repli : une réponse illisible arrête le pas.
    return { kind: "proposition_illisible", refus: lecture.refus, detail: lecture.detail };
  }

  if (lecture.proposition.kind === "termine") {
    return { kind: "termine", raison: lecture.proposition.rationale };
  }

  const proposition = lecture.proposition;
  const demande = {
    tenantId: input.tenantId,
    taskId: input.taskId,
    employeeId: input.employeeId,
    capabilityKey: proposition.capabilityKey,
    // Provisoire, et jamais utilisée telle quelle : le refus hors périmètre ci-dessous n'a pas
    // besoin de la classe d'effet, et le cas autorisé la lit dans le CONTRAT, jamais ailleurs.
    effectClass: "read" as const,
    autonomy: input.autonomy,
    ...(input.stepId !== undefined && { stepId: input.stepId }),
  };

  // ── Verrou de métier. Que le modèle l'ait demandée ne rend rien permis : une capacité hors de
  //    la liste de cet employé est refusée avant même de savoir si elle existe.
  if (!input.capacitesAutorisees.includes(proposition.capabilityKey)) {
    const decision = await deps.policy.refuse(demande, input.capacitesAutorisees);
    return { kind: "refuse", raison: decision.outcome === "refuse" ? decision.reason : "hors périmètre" };
  }

  // ── La classe d'effet vient du CONTRAT de la capacité, jamais de ce que le modèle a répondu.
  //    Sinon un moteur — ou un modèle — pourrait se déclarer inoffensif et sauter la politique.
  let effectClass;
  try {
    effectClass = deps.registry.contract(proposition.capabilityKey).effectClass;
  } catch (error) {
    if (error instanceof CapabilityUnavailable) {
      const decision = await deps.policy.refuse(demande, input.capacitesAutorisees);
      return {
        kind: "refuse",
        raison: decision.outcome === "refuse" ? decision.reason : error.message,
      };
    }
    throw error;
  }

  const decision = await deps.policy.decide({ ...demande, effectClass });

  if (decision.outcome === "allow") return { kind: "agir", proposition, decision };
  if (decision.outcome === "suspend") return { kind: "suspendu", proposition, decision };
  return { kind: "refuse", raison: decision.reason };
}
