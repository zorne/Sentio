/**
 * NOYAU-01 — le contrat d'un fournisseur de modèle.
 *
 * Un employé ne connaît jamais son fournisseur (`docs/05-runtime-employe.md`). Tout ce que le
 * noyau sait d'un fournisseur tient ici : une clé, une politique de données, et une méthode.
 * Ajouter un fournisseur, c'est écrire une implémentation et une ligne de configuration — pas
 * toucher au Gateway.
 *
 * Réalise : NOYAU-01
 */

import type { DataPolicy } from "@sentio/domain";

import type { ConversationTurn } from "../conversation/turn.js";

/**
 * La classe de données d'une requête. C'est **elle** qui décide du routage, pas le confort ni le
 * coût (`AGENTS.md`, invariant 5).
 *
 * `real` — des données d'un client ou d'un visiteur, y compris son nom d'entreprise ou son
 * besoin. Le diagnostic en manipule dès la première question.
 * `synthetic` — des données fabriquées : démonstration scriptée, tests, mise au point.
 */
export type DataClass = "real" | "synthetic";

export interface ModelRequest {
  readonly turns: readonly ConversationTurn[];
  readonly dataClass: DataClass;
  /** Enveloppe d'inférence à débiter — vendus, vitrine, ou interne (`docs/11-exploitation.md`). */
  readonly envelope: string;
  /** Nulle hors d'un contexte client : la vitrine et les tests n'appartiennent à aucune entreprise. */
  readonly tenantId: string | null;
  readonly maxTokens?: number;
}

export interface ModelCompletion {
  readonly turn: ConversationTurn;
  /** Consommation réelle, telle que rapportée par le fournisseur. Sert au comptage, pas à l'estimation. */
  readonly tokens: number;
}

export interface ModelProvider {
  readonly key: string;
  /**
   * `no_train` n'est une politique que si elle est **prouvée** : clause contractuelle, ou
   * opt-out documenté, vérifié et daté. Le Gateway vérifie la preuve, pas la promesse
   * (`docs/adr/0009`).
   */
  readonly dataPolicy: DataPolicy;
  complete(request: ModelRequest): Promise<ModelCompletion>;
}

/** Réponse du Gateway : la complétion, plus qui l'a produite. */
export interface GatewayResult extends ModelCompletion {
  readonly providerKey: string;
  /** Fournisseurs écartés avant celui-là, avec la raison. Journalisé, jamais affiché. */
  readonly skipped: readonly { providerKey: string; reason: string }[];
}
