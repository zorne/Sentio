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

import {
  type Constat,
  type Domaine,
  type GenreDeConstat,
  type SourceDeConstat,
  CONFIANCE_PAR_SOURCE,
} from "./audit.js";
import { composer, diagnostiquer, ROLE_PAR_DOMAINE, type ConfigurationProposee } from "./composition.js";

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

/**
 * Ce que le diagnostic fixe. Rien ici ne touche le noyau : ce sont des données d'entreprise.
 *
 * ⚠️ `role` est une SORTIE, jamais une entrée (`docs/adr/0029`). L'ancien champ `profession`,
 * figé à « commercial », disait l'inverse : il décidait avant d'avoir regardé.
 */
export interface Calibration {
  /** Ce sur quoi Lady se concentre. Décidé par les constats, pas choisi dans un catalogue. */
  readonly role: string;
  /** Capacités activées à la création de l'employé. */
  readonly capabilities: readonly string[];
  /** Priorité de travail, dans l'ordre : c'est ce que l'employé fera en premier. */
  readonly priorities: readonly string[];
  readonly tone: "sobre" | "direct" | "consultatif";
  /** Ce que l'employé ne fera pas pour ce client, en plus des limites du noyau. */
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

  // 3. L'AUDIT — ce qu'on constate, y compris ce que le dirigeant n'a pas dit.
  const constats = relever(profile);

  // 4. Le DIAGNOSTIC — les constats pondérés en besoins, domaine par domaine.
  const besoins = diagnostiquer(constats);

  // 5. La COMPOSITION — le choix des briques. Rien n'est rédigé ici, tout est sélectionné.
  const composition = composer(besoins);

  if (composition.statut === "hors_perimetre") {
    return { status: "hors_perimetre", detected: composition.domaine, reason: composition.motif };
  }
  if (composition.statut === "aucun_besoin") {
    // Un dossier complet dont aucun constat ne ressort : on ne fabrique pas un besoin pour
    // pouvoir vendre. Le frein déclaré reste la seule chose à creuser.
    return { status: "incomplet", missing: ["ce qui vous bloque concrètement"] };
  }

  const config = composition.configuration;
  const grounds = [
    `objectif annoncé : ${objective.target} ${objective.metric} par ${objective.horizon}`,
    `clients visés : ${profile.targetCustomers as string}`,
    ...config.motifs,
  ];

  // 6. Le ton suit la taille, parce qu'on n'écrit pas à un artisan comme à une direction.
  const headcount = profile.headcount;
  const tone: Calibration["tone"] =
    headcount === null || headcount <= 10 ? "direct" : headcount <= 50 ? "sobre" : "consultatif";
  if (headcount !== null) grounds.push(`taille : ${headcount} personnes`);

  // 7. Le premier pas dépend de ce que le client a sous la main — et il ne ment pas : sans liste,
  //    la V1 ne va pas en chercher toute seule (`adr/0016`).
  const firstStep =
    profile.hasProspectList === true
      ? "importer votre liste, la qualifier, puis écrire aux entreprises retenues"
      : "construire ensemble une première liste, puis la qualifier avant le moindre message";
  if (profile.hasProspectList !== true) {
    grounds.push("aucune liste de prospects disponible : la première étape est de la constituer");
  }

  // Le frein déclaré reste tracé — il est une DONNÉE du dossier, pas la décision. Le relire
  // ensuite permet de voir quand Sentio a conclu autre chose que ce qu'on lui demandait.
  grounds.push(`frein déclaré par le dirigeant : ${friction}`);

  return {
    status: "recommande",
    calibration: {
      role: config.role,
      capabilities: config.capacites,
      priorities: config.priorites,
      tone,
      exclusions: config.limites,
      firstStep,
    },
    grounds,
  };
}

/**
 * Relève les constats à partir de ce que le dirigeant a déclaré.
 *
 * ⚠️ **Un constat déduit n'est pas un constat mesuré**, et sa confiance le dit. C'est ce qui
 * empêche une déduction plausible de peser autant qu'une observation.
 *
 * Le mécanisme important est la **force** : quand le dirigeant dit « on parle aux mauvaises
 * personnes », il déclare implicitement que le volume ne manque pas. Ce constat-là pèse
 * négativement sur la recherche, et c'est ainsi que Sentio peut conclure autre chose que ce qu'on
 * lui demandait — sans jamais inventer de donnée.
 */
export function relever(profile: DiagnosticProfile): readonly Constat[] {
  const constats: Constat[] = [];
  const noter = (
    genre: GenreDeConstat,
    domaine: Domaine,
    source: SourceDeConstat,
    libelle: string,
  ): void => {
    constats.push({ genre, domaine, source, confiance: CONFIANCE_PAR_SOURCE[source], libelle });
  };

  switch (profile.friction) {
    case HANDLED_FRICTIONS.tooFewProspects:
      noter("goulot", "recherche_selection", "declare", "trop peu d'entreprises approchées");
      noter("opportunite", "communication_sortante", "deduit",
        "engager la conversation dès que la liste s'élargit");
      break;

    case HANDLED_FRICTIONS.poorTargeting:
      noter("faiblesse", "evaluation", "declare", "du volume, mais mal ciblé");
      // Dire « mal ciblé » revient à dire que le volume ne manque pas. On l'écrit.
      noter("force", "recherche_selection", "deduit",
        "le nombre d'entreprises approchées ne manque pas");
      noter("opportunite", "communication_sortante", "deduit",
        "n'écrire qu'aux entreprises retenues");
      break;

    case HANDLED_FRICTIONS.noFollowUp:
      noter("goulot", "communication_sortante", "declare",
        "des conversations entamées, jamais reprises");
      noter("faiblesse", "donnees_fiches", "deduit",
        "sans trace des échanges, une relance régulière est impossible");
      break;

    case HANDLED_FRICTIONS.noTime:
      noter("goulot", "communication_sortante", "declare",
        "le dirigeant prospecte lui-même, entre deux chantiers");
      noter("faiblesse", "donnees_fiches", "deduit", "faute de temps, les fiches ne suivent pas");
      noter("risque", "temps_echeances", "deduit",
        "une tâche récurrente portée par une seule personne s'arrête dès qu'elle s'absente");
      break;
  }

  if (profile.hasProspectList === true) {
    noter("force", "recherche_selection", "deduit", "une liste d'entreprises existe déjà");
  } else if (profile.hasProspectList === false) {
    noter("faiblesse", "recherche_selection", "deduit", "aucune liste d'entreprises à approcher");
  }

  // Une équipe très réduite absorbe mal une tâche récurrente : c'est un risque, pas une faiblesse.
  if (profile.headcount !== null && profile.headcount <= 3) {
    noter("risque", "donnees_fiches", "deduit",
      `à ${profile.headcount} personnes, le suivi passe après le travail livré`);
  }

  return constats;
}

/** Le rôle qu'un domaine dominant fait annoncer. Réexporté pour la restitution au dirigeant. */
export { ROLE_PAR_DOMAINE };
export type { ConfigurationProposee };
