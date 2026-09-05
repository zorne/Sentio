/**
 * EVOL-04 — faire monter la façon de travailler qui gagne, sans confondre chance et résultat.
 *
 * ══ LE PIÈGE, ET IL EST LE SUJET ENTIER ══
 *
 * Comparer deux variantes est facile ; comparer deux variantes **honnêtement** ne l'est pas.
 * Trois écueils, dans l'ordre où ils se présentent :
 *
 *   1. **Trop peu de missions.** « 1 vente sur 2 missions = 50 % » est un chiffre vrai et une
 *      information fausse. En dessous d'un plancher, on ne conclut rien.
 *   2. **Un écart trop faible.** 11 % contre 10 % sur trente missions, c'est du bruit. Déplacer
 *      l'employé là-dessus produirait un produit qui change d'avis chaque semaine et n'apprend
 *      jamais rien.
 *   3. **Ne plus jamais explorer.** Une fois une gagnante choisie, si toutes les missions la
 *      jouent, plus rien n'est mesuré — et le jour où le marché change, personne ne le voit. Une
 *      part des missions continue donc d'être tirée entre toutes les variantes.
 *
 * ══ CE QUI EST COMPTÉ, ET DANS QUEL ORDRE ══
 *
 * Une vente vaut mieux qu'un rendez-vous, qui vaut mieux qu'une réponse. Le classement suit donc
 * les ventes d'abord, et ne redescend sur les réponses que si personne n'a vendu — parce que
 * c'est alors la seule chose que la mesure sait dire.
 *
 * ⚠️ Ce module **ne décide pas de changer le métier de Lady**. Il choisit une manière à
 * l'intérieur du rôle qu'elle a déjà — un angle, un registre de langage, une cadence. C'est
 * réversible, interne, et ça n'a rien à voir avec la réévaluation de configuration (`reevaluation.ts`),
 * qui, elle, demande toujours l'accord du dirigeant.
 *
 * Réalise : EVOL-04
 */

/** Ce qu'une variante a produit chez UNE entreprise. Des comptes, jamais des taux. */
export interface ResultatDeVariante {
  readonly variantId: string;
  readonly kind: string;
  readonly key: string;
  readonly missions: number;
  readonly reponses: number;
  readonly rendezVous: number;
  readonly ventes: number;
}

/**
 * En dessous, on se tait.
 *
 * `missionsParVariante` : le plancher par variante comparée — pas le total. Deux variantes dont
 * l'une a été jouée deux fois ne se comparent pas, même si le total est confortable.
 *
 * `ecartRelatifMinimal` : l'avantage que la gagnante doit avoir sur la suivante, en proportion.
 * 20 % veut dire : 12 réussites contre 10 ne suffisent pas.
 */
export const SIGNAL_MINIMAL_DE_PROGRESSION = {
  missionsParVariante: 20,
  ecartRelatifMinimal: 0.2,
} as const;

/**
 * La part des missions qui continue d'être tirée entre TOUTES les variantes, même quand une
 * préférence existe.
 *
 * Une préférence sans exploration est une conviction : elle ne peut plus jamais être démentie.
 * Un cinquième des missions garde donc la mesure vivante — c'est le prix, assumé, de pouvoir
 * découvrir dans six mois que le marché a changé.
 */
export const PART_D_EXPLORATION = 0.2;

export type Progression =
  | { readonly statut: "trop_tot"; readonly motif: string }
  | { readonly statut: "sans_ecart"; readonly motif: string }
  | {
      readonly statut: "gagnante";
      readonly variantId: string;
      readonly key: string;
      readonly missionsComparees: number;
      /** Formulée pour le dirigeant : c'est ce qu'il lira dans sa notification. */
      readonly raison: string;
    };

/**
 * Sur QUOI la comparaison porte — décidé une fois pour toute la comparaison.
 *
 * ⚠️ Jamais variante par variante. Une façon de faire qui n'a rien vendu retomberait alors sur
 * ses réponses, et un taux de réponse de 75 % battrait un taux de vente de 12 % : on
 * optimiserait le bruit contre le chiffre d'affaires du client. Dès qu'UNE variante a vendu, tout
 * le monde est comparé sur les ventes — y compris celles qui en ont zéro, car zéro vente EST le
 * résultat qu'on veut voir.
 */
function niveauDeReussite(
  resultats: readonly ResultatDeVariante[],
): { lire: (r: ResultatDeVariante) => number; mot: string } | null {
  if (resultats.some((r) => r.ventes > 0)) return { lire: (r) => r.ventes, mot: "ventes" };
  if (resultats.some((r) => r.rendezVous > 0)) return { lire: (r) => r.rendezVous, mot: "rendez-vous" };
  if (resultats.some((r) => r.reponses > 0)) return { lire: (r) => r.reponses, mot: "réponses" };
  return null;
}

/**
 * Départage les variantes d'un même genre.
 *
 * ⚠️ L'appelant passe les résultats d'UN genre. Comparer un angle à une cadence de relance
 * n'aurait aucun sens : ce ne sont pas deux façons de faire la même chose.
 */
export function departagerLesVariantes(
  resultats: readonly ResultatDeVariante[],
  seuils: {
    missionsParVariante: number;
    ecartRelatifMinimal: number;
  } = SIGNAL_MINIMAL_DE_PROGRESSION,
): Progression {
  const comparables = resultats.filter(
    (resultat) => resultat.missions >= seuils.missionsParVariante,
  );

  if (comparables.length < 2) {
    return {
      statut: "trop_tot",
      motif:
        `Il faut au moins deux façons de faire jouées ${seuils.missionsParVariante} fois chacune ` +
        `pour les comparer ; ${comparables.length} l'ont été.`,
    };
  }

  const niveau = niveauDeReussite(comparables);

  if (niveau === null) {
    return {
      statut: "sans_ecart",
      motif: "Aucune façon de faire n'a encore produit le moindre résultat : rien à départager.",
    };
  }

  // Le taux se calcule ICI seulement, après le plancher : c'est le plancher qui rend un taux
  // signifiant, jamais l'inverse.
  const classees = comparables
    .map((resultat) => ({
      resultat,
      taux: niveau.lire(resultat) / resultat.missions,
      mot: niveau.mot,
    }))
    .sort((a, b) => b.taux - a.taux || a.resultat.key.localeCompare(b.resultat.key));

  const premiere = classees[0];
  const seconde = classees[1];
  if (premiere === undefined || seconde === undefined) {
    return { statut: "trop_tot", motif: "Pas assez de façons de faire à comparer." };
  }

  if (premiere.taux === 0) {
    return {
      statut: "sans_ecart",
      motif: "Aucune façon de faire n'a encore produit le moindre résultat : rien à départager.",
    };
  }

  // L'écart est relatif à la seconde. Un écart absolu ferait dépendre le seuil du volume : deux
  // points d'écart sur 5 % et sur 60 % ne veulent pas dire la même chose.
  const ecart = seconde.taux === 0 ? 1 : (premiere.taux - seconde.taux) / seconde.taux;

  if (ecart < seuils.ecartRelatifMinimal) {
    return {
      statut: "sans_ecart",
      motif:
        "Les façons de faire comparées donnent des résultats trop proches pour les départager. " +
        "En choisir une reviendrait à trancher au hasard.",
    };
  }

  const missionsComparees = comparables.reduce((total, r) => total + r.missions, 0);

  return {
    statut: "gagnante",
    variantId: premiere.resultat.variantId,
    key: premiere.resultat.key,
    missionsComparees,
    raison:
      `Sur ${missionsComparees} missions travaillées, cette façon de faire a obtenu ` +
      `nettement plus de ${premiere.mot} que les autres.`,
  };
}
