/**
 * LADY-Y — les chiffres que le dirigeant voit en arrivant.
 *
 * ══ CE QUE CE MODULE DÉCIDE, ET QUE LE SQL NE DÉCIDE PAS ══
 *
 * La base rend des **comptes**. Ici on décide **ce qui a le droit d'être affiché** — et
 * notamment : quand un taux est un chiffre, et quand il n'est qu'une division.
 *
 * « 1 réponse sur 2 envois = 50 % » est vrai et faux en même temps. Un dirigeant qui lit 50 % le
 * premier jour lira 8 % la semaine suivante et croira que son employée s'est effondrée. Un taux
 * ne s'affiche donc **qu'au-dessus d'un dénominateur minimal** ; en dessous, on montre les deux
 * comptes bruts et on dit pourquoi il n'y a pas de pourcentage.
 *
 * ══ CE QU'ON N'APPELLE PAS « RÉTENTION » ══
 *
 * ⚠️ Il n'y a **pas** de taux de rétention dans ce fichier, et c'est délibéré. La rétention mesure
 * des clients qui restent d'un mois sur l'autre : elle se calcule sur des abonnements, elle
 * demande plusieurs mois d'historique, et Sentio n'a pas encore un seul client payant. Publier un
 * nombre sous ce nom serait inventer la métrique la plus structurante du produit.
 *
 * Ce qui répond à la même question — *est-ce que ça s'améliore ?* — et qui est **réellement
 * mesuré**, c'est le taux de réponse comparé d'une période à l'autre. C'est donc ce qu'on rend,
 * sous son vrai nom.
 *
 * Réalise : LADY-Y
 */

/** Un jour de travail, tel que la base le compte. */
export interface JourDeTravail {
  readonly jour: string;
  readonly contactes: number;
  readonly reponses: number;
  readonly rendezVous: number;
  readonly ventes: number;
}

export interface Bilan {
  readonly contactes: number;
  readonly reponses: number;
  readonly rendezVous: number;
  readonly ventes: number;
  readonly chiffreAffaires: number;
  readonly entreprisesEngagees: number;
  readonly missionsAgies: number;
}

/**
 * En dessous, un taux ne veut rien dire.
 *
 * Trente envois : c'est le seuil à partir duquel une réponse de plus ou de moins ne fait plus
 * bouger le pourcentage de dix points. En dessous, le nombre existe et il n'informe pas.
 */
export const ENVOIS_MINIMAUX_POUR_UN_TAUX = 30;

export type Taux =
  | { readonly statut: "mesure"; readonly valeur: number; readonly sur: number }
  | { readonly statut: "trop_tot"; readonly manque: number; readonly sur: number };

/** Le taux de réponse, ou la raison pour laquelle il n'y en a pas encore. */
export function tauxDeReponse(
  bilan: { contactes: number; reponses: number },
  seuil: number = ENVOIS_MINIMAUX_POUR_UN_TAUX,
): Taux {
  if (bilan.contactes < seuil) {
    return { statut: "trop_tot", manque: seuil - bilan.contactes, sur: bilan.contactes };
  }
  return {
    statut: "mesure",
    valeur: Math.round((bilan.reponses / bilan.contactes) * 1000) / 10,
    sur: bilan.contactes,
  };
}

export type Evolution =
  | { readonly statut: "trop_tot"; readonly motif: string }
  | { readonly statut: "stable" }
  | { readonly statut: "bouge"; readonly points: number; readonly sens: "hausse" | "baisse" };

/**
 * Est-ce que ça s'améliore ?
 *
 * On coupe la fenêtre en deux moitiés et on compare les deux taux. ⚠️ **Les deux moitiés doivent
 * chacune atteindre le seuil** : comparer une semaine de 40 envois à une semaine de 3 ne compare
 * rien, ça met en scène du bruit.
 *
 * Un écart de moins de deux points est déclaré **stable**. Sans ce plancher, la moindre
 * oscillation deviendrait une « évolution » — et un produit qui annonce une progression tous les
 * jours n'en annonce plus aucune.
 */
export function evolutionDuTauxDeReponse(
  serie: readonly JourDeTravail[],
  seuil: number = ENVOIS_MINIMAUX_POUR_UN_TAUX,
): Evolution {
  if (serie.length < 4) {
    return { statut: "trop_tot", motif: "Pas encore assez de jours pour comparer deux périodes." };
  }

  const milieu = Math.floor(serie.length / 2);
  const cumul = (jours: readonly JourDeTravail[]) =>
    jours.reduce(
      (a, j) => ({ contactes: a.contactes + j.contactes, reponses: a.reponses + j.reponses }),
      { contactes: 0, reponses: 0 },
    );

  const avant = cumul(serie.slice(0, milieu));
  const apres = cumul(serie.slice(milieu));

  const tAvant = tauxDeReponse(avant, seuil);
  const tApres = tauxDeReponse(apres, seuil);

  if (tAvant.statut !== "mesure" || tApres.statut !== "mesure") {
    return {
      statut: "trop_tot",
      motif:
        `Il faut au moins ${seuil} entreprises approchées sur chacune des deux moitiés de la ` +
        "période pour dire si ça progresse.",
    };
  }

  const ecart = Math.round((tApres.valeur - tAvant.valeur) * 10) / 10;
  if (Math.abs(ecart) < 2) return { statut: "stable" };

  return { statut: "bouge", points: Math.abs(ecart), sens: ecart > 0 ? "hausse" : "baisse" };
}

/**
 * Les points de la courbe, ramenés entre 0 et 1.
 *
 * ⚠️ L'échelle est celle du **maximum de la série**, jamais un plafond fixe : une journée à 12
 * envois et une à 120 doivent produire la même courbe si la forme est la même. Et quand tout vaut
 * zéro, on rend une ligne plate au sol plutôt qu'une division par zéro déguisée en 50 %.
 */
export function courbe(
  serie: readonly JourDeTravail[],
  lire: (jour: JourDeTravail) => number,
): readonly number[] {
  const valeurs = serie.map(lire);
  const haut = Math.max(...valeurs, 0);
  return haut === 0 ? valeurs.map(() => 0) : valeurs.map((v) => v / haut);
}
