/**
 * LADY-AI — comment on NOMME ce que l'employée a récolté, selon son rôle.
 *
 * ══ POURQUOI CE FICHIER EXISTE ══
 *
 * La base rend une chose neutre : les entreprises qui ont donné une **suite** — un rendez-vous ou
 * une vente. Elle ne connaît aucun métier, et c'est délibéré (`adr/0029`).
 *
 * Mais un dirigeant ne lit pas « suites obtenues ». Il lit ce que ça veut dire **chez lui** : des
 * prospects qui ont répondu, des demandes reprises, des échéances tenues. C'est ici que la
 * traduction se fait — **dans le vocabulaire, jamais dans les données**.
 *
 * ⚠️ **C'est la frontière à ne pas franchir.** Le jour où l'on écrit « prospect » dans une requête
 * SQL de cette fonctionnalité, on a spécialisé le noyau par métier : un employé qui reprend les
 * demandes entrantes n'aurait plus rien à montrer. Le rôle décide des MOTS ; les faits sont les
 * mêmes pour tout le monde.
 *
 * Réalise : LADY-AI
 */

export interface MotsDeLaRecolte {
  /** Le titre du panneau, dans les mots du dirigeant. */
  readonly titre: string;
  /** Ce qu'on écrit quand il n'y a encore rien. Jamais une case vide. */
  readonly vide: string;
}

/**
 * ⚠️ Le repli n'est pas « prospection ». Un rôle inconnu — parce que la bibliothèque s'est élargie
 * depuis — doit recevoir des mots **neutres et vrais**, pas les mots du métier le plus courant.
 * Servir « vos prospects » à un employé qui fait de l'administratif serait un mensonge poli.
 */
const NEUTRE: MotsDeLaRecolte = {
  titre: "Ce qui a abouti",
  vide:
    "Rien n'a encore abouti. Vous verrez ici les entreprises qui ont donné une suite — un " +
    "rendez-vous ou une vente.",
};

const PAR_ROLE: Record<string, MotsDeLaRecolte> = {
  prospection: {
    titre: "Les entreprises qui ont répondu",
    vide:
      "Aucune entreprise n'a encore donné suite. Vous verrez ici celles qui répondent " +
      "vraiment — pas celles qui ont simplement reçu un message.",
  },
  qualification: {
    titre: "Les bonnes entreprises, celles qui donnent suite",
    vide:
      "Aucune entreprise retenue n'a encore donné suite. C'est ce que la qualification cherche " +
      "à obtenir : moins d'entreprises approchées, et davantage qui répondent.",
  },
  relation_client: {
    titre: "Les demandes qui ont abouti",
    vide:
      "Aucune demande n'a encore abouti. Vous verrez ici celles qui se sont transformées en " +
      "rendez-vous ou en vente.",
  },
  administration_commerciale: {
    titre: "Ce qui a abouti sur vos fiches",
    vide: "Rien n'a encore abouti. Vous verrez ici ce qui s'est concrétisé.",
  },
  administration: NEUTRE,
  suivi: {
    titre: "Les échéances qui ont porté",
    vide:
      "Rien n'a encore abouti. Vous verrez ici les échéances suivies qui se sont transformées " +
      "en rendez-vous ou en vente.",
  },
  pilotage: NEUTRE,
};

/**
 * Les mots de la récolte pour ce rôle.
 *
 * Sans configuration active, on reste neutre : l'employée n'a pas encore de rôle, et lui en
 * supposer un pour habiller un panneau serait le premier pas vers un catalogue de métiers.
 */
export function motsDeLaRecolte(role: string | null): MotsDeLaRecolte {
  if (role === null) return NEUTRE;
  return PAR_ROLE[role] ?? NEUTRE;
}
