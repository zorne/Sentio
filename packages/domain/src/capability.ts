import type { CapabilityBindingId, CapabilityId, PlanId, ProviderCredentialId, ProviderQuotaId } from "./ids.js";

/**
 * Le verbe, sans métier ni objet dans son nom. Écrit et testé une fois, il sert tous les objets
 * auxquels on l'applique — c'est ce qui permet à la bibliothèque de couvrir plusieurs métiers
 * sans que son coût croisse avec leur nombre (`docs/adr/0029`).
 */
export type Acte = "rechercher" | "qualifier" | "envoyer" | "relancer" | "mettre_a_jour";

/** L'entité sur laquelle l'acte porte. C'est ici que vit la spécificité métier, jamais dans l'acte. */
export type Objet = "prospect";

/**
 * L'adresse d'une capacité. La base l'engendre depuis ses deux axes
 * (`20260815120001_acte_et_objet.sql`) ; cette fonction est la même règle côté code, pour que les
 * deux ne puissent pas diverger.
 */
export const cleDeCapacite = (acte: Acte, objet: Objet): string => `${acte}.${objet}`;

/**
 * Les cinq capacités écrites à ce jour — cinq actes appliqués au même objet.
 *
 * Ce que ce tableau montre, et qu'il faut garder en tête : **aucune n'est commerciale en
 * elle-même.** C'est leur composition qui l'est. Appliquer `relancer` à une facture impayée ne
 * demandera pas une sixième capacité, mais un objet de plus.
 */
export const CAPACITES = {
  rechercherProspect: cleDeCapacite("rechercher", "prospect"),
  qualifierProspect: cleDeCapacite("qualifier", "prospect"),
  envoyerProspect: cleDeCapacite("envoyer", "prospect"),
  relancerProspect: cleDeCapacite("relancer", "prospect"),
  mettreAJourProspect: cleDeCapacite("mettre_a_jour", "prospect"),
} as const;

export interface Capability {
  id: CapabilityId;
  /** Engendrée depuis `acte` et `objet` : jamais saisie, donc jamais en contradiction avec eux. */
  key: string;
  acte: Acte;
  objet: Objet;
  name: string;
  contract: unknown;
}

export interface CapabilityBinding {
  id: CapabilityBindingId;
  capabilityId: CapabilityId;
  planId: PlanId;
  engineKey: string;
  priority: number;
}

export type DataPolicy = "no_train" | "free";

export interface ProviderCredential {
  id: ProviderCredentialId;
  providerKey: string;
  dataPolicy: DataPolicy;
}

export interface ProviderQuota {
  id: ProviderQuotaId;
  providerKey: string;
  windowStart: Date;
  windowEnd: Date;
  consumed: number;
  limit: number;
}
