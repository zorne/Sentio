/**
 * ACQUIS-14 — le moteur de recommandation et de calibrage.
 *
 * ⚠️ **Le modèle ne décide rien ici.** La décision est prise par des règles déterministes,
 * auditables, reproductibles, et **incapables de proposer ce qui n'existe pas**. Le modèle
 * n'intervient qu'après, pour rédiger la justification en langage de dirigeant
 * (`docs/07-parcours-produit.md`).
 *
 * Ce choix n'est pas une précaution de style. Trois raisons le rendent non négociable :
 *
 *   • **on doit pouvoir l'expliquer** — un dirigeant qui demande « pourquoi lui ? » reçoit une
 *     règle, pas une génération ;
 *   • **on doit pouvoir le rejouer** — le jeu de conversations de référence n'aurait aucun sens
 *     face à un moteur non déterministe (`ACQUIS-20`) ;
 *   • **on ne doit pas pouvoir le détourner** — tout ce que tape un visiteur est une donnée,
 *     jamais une instruction (`docs/10-securite-rgpd.md`). Une phrase glissée dans un champ ne
 *     doit pas pouvoir faire recommander autre chose.
 *
 * Tant qu'un seul métier existe, le moteur ne choisit pas *quel* employé : il détermine **comment
 * il est calibré** — objectif, cible, ton, exclusions ([`adr/0010`](../../docs/adr/0010-diagnostic-calibrage.md)).
 * Le calibrage s'écrit dans `company_profile` et `employee_capability`. **Jamais dans l'ADN.**
 *
 * Réalise : ACQUIS-14
 */

import { CAPACITES } from "./capability.js";

/** Les freins que Sentio sait traiter aujourd'hui. Un frein absent de cette liste est hors périmètre. */
export const HANDLED_FRICTIONS = {
  /** « Personne ne nous connaît » — pas assez d'entreprises approchées. */
  tooFewProspects: "pas_assez_de_prospects",
  /** « On parle aux mauvaises personnes » — du volume, mais mal ciblé. */
  poorTargeting: "ciblage_imprecis",
  /** « On oublie de relancer » — des contacts entamés, jamais repris. */
  noFollowUp: "aucune_relance",
  /** « On n'a pas le temps » — le dirigeant prospecte lui-même, entre deux chantiers. */
  noTime: "pas_de_temps",
} as const;

export type HandledFriction = (typeof HANDLED_FRICTIONS)[keyof typeof HANDLED_FRICTIONS];

/**
 * Ce que Sentio ne sait pas faire aujourd'hui, et doit **dire** au moment où le besoin est
 * exprimé — pas après la vente (`docs/adr/0008`).
 */
export const OUT_OF_SCOPE_NEEDS = [
  "comptabilite",
  "juridique",
  "recrutement",
  "support_client",
  "service_apres_vente",
  "marketing_de_contenu",
  "developpement_logiciel",
] as const;

export type OutOfScopeNeed = (typeof OUT_OF_SCOPE_NEEDS)[number];

/** Le profil structuré extrait de la conversation. Aucune de ces valeurs n'est devinée. */
export interface DiagnosticProfile {
  readonly sector: string | null;
  /** Nombre de personnes dans l'entreprise, si le visiteur l'a donné. */
  readonly headcount: number | null;
  readonly friction: HandledFriction | OutOfScopeNeed | null;
  /** L'objectif chiffré, tel qu'énoncé : « +5 000 € par mois ». */
  readonly objective: { readonly metric: string; readonly target: number; readonly horizon: string } | null;
  /** À qui le client vend — sert au calibrage du ciblage. */
  readonly targetCustomers: string | null;
  /** Le client dispose-t-il déjà d'une liste de prospects ? Décide du premier pas (`adr/0016`). */
  readonly hasProspectList: boolean | null;
}

/** Ce que le calibrage fixe. Rien ici ne touche l'ADN : ce sont des données d'entreprise. */
export interface Calibration {
  readonly profession: "commercial";
  /** Capacités activées à la création de l'employé. */
  readonly capabilities: readonly string[];
  /** Priorité de travail, dans l'ordre : c'est ce que l'employé fera en premier. */
  readonly priorities: readonly string[];
  readonly tone: "sobre" | "direct" | "consultatif";
  /** Ce que l'employé ne fera pas pour ce client, en plus des limites de l'ADN. */
  readonly exclusions: readonly string[];
  /** Premier pas concret, lisible par le dirigeant. */
  readonly firstStep: string;
}

/**
 * La décision du moteur — à ne pas confondre avec `Recommendation`, la LIGNE enregistrée en base
 * (`acquisition.ts`). L'une est ce qu'on décide, l'autre ce qu'on garde.
 */
export type RecommendationDecision =
  | {
      readonly status: "recommande";
      readonly calibration: Calibration;
      /** Les faits qui ont conduit à ce calibrage. Le modèle rédige à partir d'eux, jamais au-delà. */
      readonly grounds: readonly string[];
    }
  | {
      readonly status: "hors_perimetre";
      readonly detected: string;
      /** Ce qu'on dit au visiteur — sans jargon, sans promesse, sans « bientôt disponible ». */
      readonly reason: string;
    }
  | {
      readonly status: "incomplet";
      /** Ce qui manque pour décider. Le diagnostic continue au lieu de conclure au hasard. */
      readonly missing: readonly string[];
    };

function isOutOfScope(friction: string): friction is OutOfScopeNeed {
  return (OUT_OF_SCOPE_NEEDS as readonly string[]).includes(friction);
}

const OUT_OF_SCOPE_WORDING: Record<OutOfScopeNeed, string> = {
  comptabilite: "la tenue de vos comptes",
  juridique: "vos sujets juridiques",
  recrutement: "le recrutement de vos équipes",
  support_client: "le suivi de vos clients existants",
  service_apres_vente: "votre service après-vente",
  marketing_de_contenu: "la production de vos contenus",
  developpement_logiciel: "le développement de vos outils",
};

/**
 * La décision. Fonction **pure** : mêmes entrées, même sortie, toujours — c'est ce qui rend le
 * jeu de conversations de référence capable de détecter une régression.
 */
export function recommend(profile: DiagnosticProfile): RecommendationDecision {
  // 1. Honnêteté d'abord. Si le besoin exprimé sort du périmètre, on le dit — avant de regarder
  //    si le reste du dossier serait vendable. L'ordre importe : vérifier la complétude d'abord
  //    reviendrait à poser des questions à quelqu'un à qui on ne peut rien vendre.
  if (profile.friction !== null && isOutOfScope(profile.friction)) {
    return {
      status: "hors_perimetre",
      detected: profile.friction,
      reason:
        `Ce qui vous bloque, c'est ${OUT_OF_SCOPE_WORDING[profile.friction]} — ce n'est pas ce ` +
        `qu'un employé commercial sait faire. Nous préférons vous le dire maintenant plutôt que ` +
        `de vous vendre quelqu'un qui ne réglerait pas le problème.`,
    };
  }

  // 2. Ce qui manque pour décider. On ne comble jamais un trou par une valeur par défaut : un
  //    calibrage fondé sur une supposition produit un employé qui travaille à côté.
  const missing: string[] = [];
  if (profile.friction === null) missing.push("le frein principal");
  if (profile.objective === null) missing.push("l'objectif chiffré");
  if (profile.targetCustomers === null) missing.push("à qui vous vendez");
  if (missing.length > 0) return { status: "incomplet", missing };

  const friction = profile.friction as HandledFriction;
  const objective = profile.objective as NonNullable<DiagnosticProfile["objective"]>;

  // 3. Le calibrage. Chaque branche est une règle lisible, pas une pondération opaque.
  const capabilities = [CAPACITES.rechercherProspect, CAPACITES.qualifierProspect, CAPACITES.mettreAJourProspect];
  const priorities: string[] = [];
  const grounds: string[] = [
    `objectif annoncé : ${objective.target} ${objective.metric} par ${objective.horizon}`,
    `clients visés : ${profile.targetCustomers as string}`,
  ];

  switch (friction) {
    case HANDLED_FRICTIONS.tooFewProspects:
      capabilities.push(CAPACITES.envoyerProspect, CAPACITES.relancerProspect);
      priorities.push("élargir le nombre d'entreprises approchées", "engager la conversation");
      grounds.push("frein : trop peu d'entreprises approchées");
      break;
    case HANDLED_FRICTIONS.poorTargeting:
      capabilities.push(CAPACITES.envoyerProspect);
      priorities.push("resserrer le ciblage avant d'écrire", "n'écrire qu'aux entreprises qualifiées");
      grounds.push("frein : du volume, mais mal ciblé");
      break;
    case HANDLED_FRICTIONS.noFollowUp:
      capabilities.push(CAPACITES.envoyerProspect, CAPACITES.relancerProspect);
      priorities.push("reprendre les conversations laissées sans réponse", "relancer avec tact");
      grounds.push("frein : des contacts entamés, jamais repris");
      break;
    case HANDLED_FRICTIONS.noTime:
      capabilities.push(CAPACITES.envoyerProspect, CAPACITES.relancerProspect);
      priorities.push("prendre en charge la prospection de bout en bout");
      grounds.push("frein : le dirigeant prospecte lui-même, entre deux chantiers");
      break;
  }

  // 4. Le ton suit la taille, parce qu'on n'écrit pas à un artisan comme à une direction.
  const headcount = profile.headcount;
  const tone: Calibration["tone"] =
    headcount === null || headcount <= 10 ? "direct" : headcount <= 50 ? "sobre" : "consultatif";
  if (headcount !== null) grounds.push(`taille : ${headcount} personnes`);

  // 5. Le premier pas dépend de ce que le client a sous la main — et il ne ment pas : sans liste,
  //    la V1 ne va pas en chercher toute seule (`adr/0016`).
  const firstStep =
    profile.hasProspectList === true
      ? "importer votre liste, la qualifier, puis écrire aux entreprises retenues"
      : "construire ensemble une première liste, puis la qualifier avant le moindre message";
  if (profile.hasProspectList !== true) {
    grounds.push("aucune liste de prospects disponible : la première étape est de la constituer");
  }

  return {
    status: "recommande",
    calibration: {
      profession: "commercial",
      capabilities,
      priorities,
      tone,
      // Toujours présentes : ce sont les exclusions qui protègent la réputation du client.
      exclusions: ["particuliers", "clients existants du client", "concurrents déclarés"],
      firstStep,
    },
    grounds,
  };
}
