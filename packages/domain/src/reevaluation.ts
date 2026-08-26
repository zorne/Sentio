/**
 * De ce qui a été observé à ce qu'il faut changer.
 *
 * ══ LA BOUCLE QUE CE MODULE FERME ══
 *
 *     configuration → travail → résultats → CONSTATS MESURÉS → diagnostic → configuration v2
 *
 * Tout existait sauf la flèche en majuscules. Les résultats étaient enregistrés et personne ne
 * les relisait : Lady faisait chaque jour ce qu'on avait décidé au premier, quoi qu'il arrive.
 *
 * ══ CE QUI REND CE MODULE DANGEREUX, ET COMMENT ON LE TIENT ══
 *
 * Un moteur qui réagit trop vite déplace Lady au hasard. Trois retenues :
 *
 *   1. **Il se tait tant que le signal est faible.** À 5 % d'un mois écoulé, aucun retard ne veut
 *      dire quoi que ce soit. Dix missions travaillées non plus.
 *   2. **Il constate une FORCE quand ça marche.** Sans ça, seuls les échecs parleraient et la
 *      réévaluation ne saurait que déplacer — jamais confirmer.
 *   3. **Il ne décide rien.** Il rend des constats, exactement de la même forme que ceux du
 *      premier diagnostic. C'est le moteur de composition qui en tire une configuration, et le
 *      dirigeant qui l'accepte (§10 de la vision : Lady ne change jamais de rôle toute seule).
 *
 * ⚠️ **Un même retard n'a pas une seule cause.** Personne ne répond, ou beaucoup répondent sans
 * acheter : ce sont deux problèmes opposés, et les confondre enverrait Lady corriger ce qui
 * fonctionnait déjà.
 */

import { CONFIANCE_PAR_SOURCE, type Constat } from "./audit.js";

/** Les nombres bruts du travail effectué. Rendus par `mesures_du_travail()`. */
export interface MesuresDuTravail {
  readonly missionsOuvertes: number;
  /** Missions pour lesquelles une action a réellement été exécutée. */
  readonly missionsAgies: number;
  readonly reponses: number;
  readonly rendezVous: number;
  readonly ventes: number;
  /** Part de l'horizon écoulée, entre 0 et 1. */
  readonly partEcoulee: number;
  /** Négatif = en retard sur la cadence qu'exige la cible. */
  readonly ecartDeRythme: number;
}

/**
 * En dessous, on se tait. Ces deux seuils sont la différence entre une réévaluation et une
 * girouette — et ils sont ici, nommés, plutôt qu'enfouis dans une condition.
 */
export const SIGNAL_MINIMAL = {
  /** Un quart de l'horizon : avant, un retard est du bruit. */
  partEcoulee: 0.25,
  /** Dix missions réellement travaillées : en dessous, aucun taux ne veut rien dire. */
  missionsAgies: 10,
} as const;

export type Reevaluation =
  | { readonly statut: "trop_tot"; readonly motif: string }
  | { readonly statut: "constats"; readonly constats: readonly Constat[] };

/**
 * Relit les résultats et en tire des constats — ou dit qu'il est trop tôt.
 *
 * Les constats produits ici portent la source `mesure` : ce sont les seuls du produit qui ne
 * viennent pas d'une déclaration. Ils pèsent donc plus lourd que tout ce que le dirigeant a pu
 * dire au premier jour — et c'est voulu : ce qu'on observe l'emporte sur ce qu'on croyait.
 */
export function releverDesResultats(mesures: MesuresDuTravail): Reevaluation {
  if (mesures.partEcoulee < SIGNAL_MINIMAL.partEcoulee) {
    return {
      statut: "trop_tot",
      motif:
        `Seulement ${Math.round(mesures.partEcoulee * 100)} % de l'horizon écoulé. Un retard ` +
        `constaté maintenant serait du bruit, et le corriger déplacerait Lady au hasard.`,
    };
  }

  if (mesures.missionsAgies < SIGNAL_MINIMAL.missionsAgies) {
    return {
      statut: "trop_tot",
      motif:
        `${mesures.missionsAgies} mission(s) réellement travaillée(s). En dessous de ` +
        `${SIGNAL_MINIMAL.missionsAgies}, aucun taux ne veut dire quoi que ce soit.`,
    };
  }

  const noter = (
    genre: Constat["genre"],
    domaine: Constat["domaine"],
    libelle: string,
  ): Constat => ({
    genre,
    domaine,
    objet: "prospect",
    source: "mesure",
    confiance: CONFIANCE_PAR_SOURCE["mesure"],
    libelle,
  });

  // ── Ce qui marche se constate aussi. Sans ça, la réévaluation ne saurait que déplacer.
  if (mesures.ecartDeRythme >= 0) {
    return {
      statut: "constats",
      constats: [
        noter(
          "force",
          "communication_sortante",
          `le rythme tient : ${mesures.ventes} vente(s) et ${mesures.reponses} réponse(s) sur ` +
            `${mesures.missionsAgies} entreprises travaillées`,
        ),
      ],
    };
  }

  // ── En retard. Reste à savoir OÙ, et les trois cas n'appellent pas la même correction.

  if (mesures.reponses === 0) {
    // Le travail sort, et rien ne revient. Ce n'est pas un problème de volume : en envoyer
    // davantage multiplierait le silence, et abîmerait la réputation du client au passage.
    return {
      statut: "constats",
      constats: [
        noter(
          "goulot",
          "communication_sortante",
          `aucune réponse sur ${mesures.missionsAgies} entreprises approchées`,
        ),
        noter(
          "force",
          "recherche_selection",
          "le volume d'entreprises approchées ne manque pas : ce n'est pas là que ça bloque",
        ),
      ],
    };
  }

  if (mesures.ventes === 0) {
    // On obtient des réponses mais rien n'aboutit : les entreprises approchées répondent sans
    // être des clients. C'est le ciblage, pas le message.
    return {
      statut: "constats",
      constats: [
        noter(
          "goulot",
          "evaluation",
          `${mesures.reponses} réponse(s) et aucune vente : les entreprises retenues répondent ` +
            `sans correspondre à l'offre`,
        ),
        noter(
          "force",
          "communication_sortante",
          "les messages obtiennent des réponses : ce n'est pas là que ça bloque",
        ),
      ],
    };
  }

  // Ça vend, mais pas assez vite. Là, et là seulement, le volume est en cause.
  return {
    statut: "constats",
    constats: [
      noter(
        "faiblesse",
        "recherche_selection",
        `${mesures.ventes} vente(s) obtenues, mais le rythme reste en dessous de ce que la cible ` +
          `demande : il manque des entreprises à approcher`,
      ),
      noter(
        "force",
        "evaluation",
        "les entreprises retenues achètent : le ciblage n'est pas en cause",
      ),
    ],
  };
}
