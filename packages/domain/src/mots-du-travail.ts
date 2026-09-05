// ════════════════════════════════════════════════════════════════════════════════════════════
// LES MOTS DU TRAVAIL — la même base, dite dans le vocabulaire du rôle actuel.
//
// ══ LE PROBLÈME QUE CE FICHIER RÈGLE ══
//
// L'espace client annonçait « entreprises approchées », « réponses reçues », « ventes déclarées »
// et « avant vos rendez-vous ». Ces mots sont justes pour une employée qui prospecte. Ils
// deviennent faux le jour où le diagnostic en compose une qui tient une comptabilité ou reprend
// des demandes entrantes, et Sentio existe précisément pour composer celle dont l'entreprise a
// besoin, pas celle du catalogue.
//
// ⚠️ CE N'EST PAS UN DÉTAIL DE VOCABULAIRE, C'EST `adr/0029`. Écrire « prospect » dans l'écran
// fait rentrer la prospection dans le produit par la porte de derrière : un dirigeant dont
// l'employée traite des dossiers administratifs lirait des mots qui ne parlent pas de son
// travail, et conclurait, à raison, qu'on lui a vendu autre chose.
//
// ══ CE QUI CHANGE ET CE QUI NE CHANGE PAS ══
//
// **Les faits sont les mêmes pour tout le monde.** La base compte des entreprises touchées, des
// réponses, des suites, des ventes, des missions et leurs états. Elle ne connaît aucun métier et
// n'en connaîtra jamais.
//
// **Seuls les mots changent.** C'est exactement le motif de `motsDeLaRecolte`, étendu au reste de
// l'écran. Le rôle décide du vocabulaire ; il ne décide de rien d'autre.
//
// ⚠️ ET LE REPLI EST NEUTRE, JAMAIS CELUI DE LA PROSPECTION. Servir « vos prospects » à une
// employée administrative parce qu'on n'a pas prévu son rôle serait spécialiser le produit par
// le vocabulaire, ce qui est le piège que tout ce fichier existe pour éviter.
// ════════════════════════════════════════════════════════════════════════════════════════════

/** Les quatre nombres du tableau, nommés pour ce rôle. */
export interface MotsDesIndicateurs {
  /** Les entreprises, dossiers ou demandes qu'elle a touchés. */
  readonly touches: string;
  /** Celles qui ont donné signe de vie. */
  readonly reponses: string;
  /** Celles qui ont abouti à quelque chose. */
  readonly suites: string;
  /** Le titre de la courbe, jour par jour. */
  readonly courbe: string;
}

/** Les six états d'une mission, dits dans le vocabulaire du rôle. */
export interface MotsDesEtats {
  readonly pending: string;
  readonly in_progress: string;
  readonly waiting_approval: string;
  readonly needs_attention: string;
  readonly done: string;
  readonly failed: string;
}

export interface MotsDuTravail {
  readonly indicateurs: MotsDesIndicateurs;
  readonly etats: MotsDesEtats;
  /** Le titre du panneau des missions en cours. */
  readonly titreDesMissions: string;
  /** Ce qu'on écrit quand aucune mission n'est ouverte. Jamais « aucun résultat ». */
  readonly missionsVides: string;
}

/**
 * Les états, version neutre.
 *
 * ⚠️ Ils décrivent une AVANCÉE, jamais un métier : « à faire », « en cours », « terminé » se
 * lisent aussi bien pour un dossier comptable que pour une entreprise à contacter. C'est pour ça
 * qu'ils tiennent lieu de repli sans jamais sonner faux.
 */
const ETATS_NEUTRES: MotsDesEtats = {
  pending: "À faire",
  in_progress: "En cours",
  waiting_approval: "Attend votre réponse",
  needs_attention: "Demande votre attention",
  done: "Terminé",
  failed: "N'a pas abouti",
};

const NEUTRE: MotsDuTravail = {
  indicateurs: {
    touches: "dossiers traités",
    reponses: "ont donné une réponse",
    suites: "ont donné une suite",
    courbe: "Ce qu'elle a traité, jour par jour",
  },
  etats: ETATS_NEUTRES,
  titreDesMissions: "Ce qu'elle fait en ce moment",
  missionsVides:
    "Rien n'est ouvert à l'instant. Elle reprendra dès qu'il y aura de quoi travailler, et vous " +
    "verrez ici chaque chose en cours.",
};

/**
 * Le vocabulaire par rôle.
 *
 * ⚠️ Un rôle absent de cette table ne casse rien : il retombe sur le neutre, qui reste juste.
 * C'est ce qui permet au diagnostic de composer demain un rôle auquel personne n'a pensé sans
 * que l'écran devienne faux.
 */
const PAR_ROLE: Record<string, MotsDuTravail> = {
  prospection: {
    indicateurs: {
      touches: "entreprises approchées",
      reponses: "ont répondu",
      suites: "ont donné une suite",
      courbe: "Entreprises approchées, jour par jour",
    },
    etats: {
      ...ETATS_NEUTRES,
      pending: "À contacter",
      in_progress: "En cours d'approche",
      done: "Approchée",
    },
    titreDesMissions: "Les entreprises sur lesquelles elle travaille",
    missionsVides:
      "Aucune entreprise en cours à l'instant. Elle en ouvrira de nouvelles dès qu'il y aura de " +
      "quoi travailler.",
  },

  qualification: {
    indicateurs: {
      touches: "entreprises examinées",
      reponses: "ont répondu",
      suites: "ont donné une suite",
      courbe: "Entreprises examinées, jour par jour",
    },
    etats: { ...ETATS_NEUTRES, pending: "À examiner", in_progress: "En cours d'examen", done: "Examinée" },
    titreDesMissions: "Ce qu'elle est en train d'examiner",
    missionsVides: "Rien à examiner à l'instant. Elle reprendra dès qu'une entreprise arrivera.",
  },

  relation_client: {
    indicateurs: {
      touches: "demandes reprises",
      reponses: "ont eu une réponse",
      suites: "ont abouti",
      courbe: "Demandes reprises, jour par jour",
    },
    etats: {
      ...ETATS_NEUTRES,
      pending: "À reprendre",
      in_progress: "En cours de traitement",
      waiting_approval: "Attend votre réponse",
      done: "Traitée",
    },
    titreDesMissions: "Les demandes qu'elle traite",
    missionsVides:
      "Aucune demande en cours. Vous verrez ici celles qu'elle reprend, au fur et à mesure.",
  },

  administration_commerciale: {
    indicateurs: {
      touches: "fiches mises à jour",
      reponses: "ont donné une réponse",
      suites: "ont abouti",
      courbe: "Fiches mises à jour, jour par jour",
    },
    etats: { ...ETATS_NEUTRES, pending: "À mettre à jour", done: "À jour" },
    titreDesMissions: "Les fiches sur lesquelles elle travaille",
    missionsVides: "Aucune fiche en cours. Elle reprendra dès qu'il y aura quelque chose à tenir.",
  },

  administration: {
    indicateurs: {
      touches: "dossiers traités",
      reponses: "ont eu un retour",
      suites: "ont abouti",
      courbe: "Dossiers traités, jour par jour",
    },
    etats: {
      ...ETATS_NEUTRES,
      pending: "À traiter",
      in_progress: "En cours de traitement",
      needs_attention: "À vérifier",
      done: "Traité",
    },
    titreDesMissions: "Les dossiers qu'elle traite",
    missionsVides:
      "Aucun dossier en cours. Vous verrez ici ce qu'elle traite, dès qu'il y aura de quoi faire.",
  },

  suivi: {
    indicateurs: {
      touches: "échéances suivies",
      reponses: "ont eu une réponse",
      suites: "ont abouti",
      courbe: "Échéances suivies, jour par jour",
    },
    etats: { ...ETATS_NEUTRES, pending: "À surveiller", in_progress: "Sous surveillance", done: "Passée" },
    titreDesMissions: "Les échéances qu'elle surveille",
    missionsVides: "Aucune échéance en cours. Elle vous préviendra dès qu'une approche.",
  },

  pilotage: {
    indicateurs: {
      touches: "sujets suivis",
      reponses: "ont avancé",
      suites: "ont abouti",
      courbe: "Sujets suivis, jour par jour",
    },
    etats: ETATS_NEUTRES,
    titreDesMissions: "Ce qu'elle suit en ce moment",
    missionsVides: "Rien à suivre à l'instant. Elle reprendra dès qu'il y aura de quoi.",
  },
};

/** Les mots du travail pour ce rôle. Le neutre quand le rôle est inconnu ou absent. */
export function motsDuTravail(role: string | null): MotsDuTravail {
  if (role === null) return NEUTRE;
  return PAR_ROLE[role] ?? NEUTRE;
}

/** L'état d'une mission, en toutes lettres. Un état inconnu se dit tel quel plutôt que de mentir. */
export function motDeLEtat(etat: string, mots: MotsDuTravail): string {
  const connus = mots.etats as unknown as Record<string, string | undefined>;
  return connus[etat] ?? "En cours";
}
