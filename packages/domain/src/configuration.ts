/**
 * La configuration de Lady — ce qu'elle fait pour une entreprise donnée, et pourquoi.
 *
 * ⚠️ **Une configuration est une VERSION, pas un réglage.** On ne modifie jamais un rôle en
 * place : on publie une version suivante, qui porte son déclencheur, sa raison et celle qu'elle
 * remplace. La base le tient (`20260815120003_configuration_de_lady.sql`) ; ce type ne fait que
 * décrire la même chose côté code.
 *
 * ⚠️ **`role` est une SORTIE du diagnostic, jamais une entrée** (`docs/adr/0029`). Ce n'est pas
 * un métier choisi dans un catalogue : deux entreprises du même secteur peuvent recevoir deux
 * rôles différents, et c'est le but.
 */

import type { EmployeeId, LadyConfigurationId, TenantId } from "./ids.js";

/** Ce qui a provoqué cette version. Fermé : ce qui n'y est pas n'est pas un motif valable. */
export type DeclencheurDeConfiguration =
  /** Le recrutement initial : la v1, issue du diagnostic d'avant-vente. */
  | "recrutement"
  /** Un nouveau diagnostic de l'entreprise. */
  | "diagnostic"
  /** Les résultats observés ont déplacé la priorité. */
  | "resultats"
  /** Le dirigeant a demandé le changement lui-même. */
  | "demande_client";

/** Même échelle que celle de l'employé : la configuration en est la source, l'employé le reflet. */
export type NiveauDAutonomie = "confirm" | "confirm_once" | "auto";

export interface LadyConfiguration {
  readonly id: LadyConfigurationId;
  readonly tenantId: TenantId;
  readonly employeeId: EmployeeId;
  /** Croissante et continue par employé : v2 succède à v1, jamais à v0 ni à v3. */
  readonly version: number;

  /** Ce sur quoi Lady se concentre actuellement. Sortie du diagnostic. */
  readonly role: string;
  /** L'ordre de travail, tel qu'un dirigeant le lirait. */
  readonly priorites: readonly string[];
  /** Ce que Lady ne fera pas pour CE client, en plus des limites du noyau. Retranche seulement. */
  readonly limites: readonly string[];
  readonly autonomie: NiveauDAutonomie;

  readonly declencheur: DeclencheurDeConfiguration;
  /** Lisible par le dirigeant, dans son vocabulaire. Une raison vide est un changement inexpliqué. */
  readonly raison: string;
  /** Le diagnostic qui l'a produite. Nul au recrutement initial. */
  readonly diagnosticSessionId: string | null;
  /** La version remplacée. Nulle pour la v1, toujours présente ensuite. */
  readonly precedenteId: LadyConfigurationId | null;

  /** Une seule configuration active par employé, à tout instant. */
  readonly active: boolean;
  readonly createdAt: Date;
}
