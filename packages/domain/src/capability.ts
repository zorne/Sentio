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

/**
 * ⚠️ L'UNIQUE INSCRIPTION DE « l'objet `prospect` se nomme `lead` en base ».
 *
 * Le vocabulaire du diagnostic dit `prospect` (`Objet`) ; `task.subject_kind` dit `lead`. Ce sont
 * deux noms du même sujet, et cette ligne est le SEUL endroit du produit où la correspondance est
 * écrite. Deux traductions du même fait dans deux fichiers finissent toujours par diverger — et
 * celle-ci décide quelles capacités un employé peut proposer : une divergence rendrait une
 * capacité invisible, ou en laisserait passer une qui ne s'applique pas.
 *
 * Si un jour la base renomme cette nature, c'est ici, et nulle part ailleurs.
 */
export const NATURE_DU_PROSPECT = "lead";

/**
 * La nature de sujet que chaque capacité EXIGE, dans le vocabulaire de `task.subject_kind`.
 *
 * ══ POURQUOI CETTE TABLE EXISTE ══
 *
 * Cette connaissance vivait déjà, mais **impérativement**, dispersée dans six appels à
 * `exigerUnProspect` au fond de `attelage.ts`. Sous cette forme, elle ne pouvait que REFUSER APRÈS
 * COUP : le modèle proposait `qualifier.prospect` sur une mission de recherche, l'attelage
 * refusait, et le run mourait définitivement. Observé pour de vrai le 2026-08-30, sur une erreur
 * que personne n'avait scénarisée.
 *
 * Déclarée, la même connaissance permet de **retirer la capacité de la liste avant que le modèle
 * ne la voie** : la proposition incohérente devient impossible à formuler, au lieu d'être
 * rattrapée. C'est `attelage.ts` appliqué un cran plus tôt.
 *
 * ⚠️ **CE FILTRE EST UNE ÉCONOMIE, PAS UNE FRONTIÈRE.** `exigerUnProspect` reste en place et doit
 * y rester : une mission créée par un autre chemin — reprise, futur gisement, écriture directe —
 * n'a pas traversé ce filtre. Même raisonnement que le filtrage par capacité dans le gisement,
 * qui n'a jamais remplacé le `PolicyEngine`.
 *
 * `null` veut dire « n'exige aucun sujet existant » : `rechercher.prospect` n'a pas de prospect
 * pour cible, elle en CRÉE. C'est la seule de ce genre aujourd'hui.
 */
export const SUJET_EXIGE_PAR_CAPACITE = {
  [CAPACITES.rechercherProspect]: null,
  [CAPACITES.qualifierProspect]: NATURE_DU_PROSPECT,
  [CAPACITES.envoyerProspect]: NATURE_DU_PROSPECT,
  [CAPACITES.relancerProspect]: NATURE_DU_PROSPECT,
  [CAPACITES.mettreAJourProspect]: NATURE_DU_PROSPECT,
} as const satisfies Record<(typeof CAPACITES)[keyof typeof CAPACITES], string | null>;

/**
 * Cette capacité peut-elle s'appliquer à une mission portant CE sujet ?
 *
 * ⚠️ Une capacité **inconnue de la table** rend `false`. C'est délibéré et c'est le sens le plus
 * prudent : une capacité dont personne n'a déclaré le sujet ne doit pas être proposée « au cas
 * où ». Le `satisfies` ci-dessus rend l'oubli impossible à compiler pour les capacités connues,
 * et un test le garde pour celles qu'on ajouterait.
 */
export function capaciteApplicableAuSujet(cle: string, sujetKind: string): boolean {
  const exige = (SUJET_EXIGE_PAR_CAPACITE as Record<string, string | null | undefined>)[cle];
  if (exige === undefined) return false;
  return exige === null || exige === sujetKind;
}

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
