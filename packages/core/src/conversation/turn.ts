/**
 * NOYAU-22 — le format d'un tour de conversation.
 *
 * Un employé ne produit pas « du texte » : il produit une suite de tours, dont certains sont des
 * appels de capacité et d'autres leurs résultats. Fixer ce format ici, une fois, évite que chaque
 * fournisseur impose le sien — c'est ce qui rendra un fournisseur remplaçable sans réécrire le
 * runtime (`docs/02-architecture.md`).
 *
 * ⚠️ Un tour ne nomme jamais un outil, il nomme une **capacité** : le contrat est stable, le
 * moteur derrière est remplaçable (`docs/adr/0006`). Écrire ici le nom d'un moteur ferait entrer
 * l'implémentation dans le protocole.
 *
 * Réalise : NOYAU-22
 */

/** Consigne permanente : l'ADN, la mémoire, la tâche. Assemblée par le noyau, jamais par un modèle. */
export interface SystemTurn {
  readonly role: "system";
  readonly type: "text";
  readonly text: string;
}

/** Ce que dit l'humain — le dirigeant dans un diagnostic, ou la tâche dans un run. */
export interface UserTurn {
  readonly role: "user";
  readonly type: "text";
  readonly text: string;
}

/** Ce que répond l'employé, en clair. */
export interface AssistantTextTurn {
  readonly role: "assistant";
  readonly type: "text";
  readonly text: string;
}

/** Ce que l'employé demande à faire. Rien ne s'exécute avant le passage par le Policy Engine. */
export interface CapabilityCallTurn {
  readonly role: "assistant";
  readonly type: "capability_call";
  readonly callId: string;
  readonly capabilityKey: string;
  readonly input: unknown;
}

/** Ce que la capacité a répondu. `failed` marque un échec **sans interrompre** la conversation. */
export interface CapabilityResultTurn {
  readonly role: "capability";
  readonly type: "capability_result";
  readonly callId: string;
  readonly output: unknown;
  readonly failed: boolean;
}

export type ConversationTurn =
  | SystemTurn
  | UserTurn
  | AssistantTextTurn
  | CapabilityCallTurn
  | CapabilityResultTurn;

/** Erreur de forme d'une conversation. Elle est logique : elle ne déclenche aucun repli. */
export class MalformedConversation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedConversation";
  }
}

/**
 * Vérifie qu'une conversation est exploitable **avant** de la présenter à un fournisseur.
 *
 * Pourquoi vérifier plutôt que faire confiance : une conversation mal formée produit soit une
 * erreur du fournisseur (facturée, et lue comme une panne), soit — pire — une réponse plausible
 * fondée sur un résultat orphelin. Les deux se diagnostiquent mal en production.
 */
export function assertWellFormed(turns: readonly ConversationTurn[]): void {
  if (turns.length === 0) {
    throw new MalformedConversation("Conversation vide : il n'y a rien à demander.");
  }

  const firstSystemIndex = turns.findIndex((turn) => turn.role === "system");
  if (firstSystemIndex > 0) {
    throw new MalformedConversation(
      "La consigne permanente doit ouvrir la conversation : l'ADN passe avant tout le reste " +
        "(docs/04-contextes-memoire.md).",
    );
  }

  const pending = new Set<string>();
  for (const turn of turns) {
    if (turn.type === "capability_call") {
      if (pending.has(turn.callId)) {
        throw new MalformedConversation(`Deux demandes portent le même identifiant : ${turn.callId}.`);
      }
      pending.add(turn.callId);
    }
    if (turn.type === "capability_result") {
      if (!pending.delete(turn.callId)) {
        throw new MalformedConversation(
          `Résultat orphelin (${turn.callId}) : aucune demande de capacité ne lui correspond.`,
        );
      }
    }
  }
}

/** Le texte utile d'une conversation, dans l'ordre — pour le journal et les tests. */
export function textOf(turns: readonly ConversationTurn[]): string {
  return turns
    .filter((turn): turn is SystemTurn | UserTurn | AssistantTextTurn => turn.type === "text")
    .map((turn) => turn.text)
    .join("\n");
}
