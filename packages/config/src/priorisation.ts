/**
 * Les bornes du moteur de priorisation — jusqu'où chaque facteur a le droit de peser.
 *
 * ══ POURQUOI CES QUATRE VALEURS SONT EN CONFIGURATION, ET PAS EN DUR ══
 *
 * `prioriserLesTravaux` multiplie quatre facteurs. Trois d'entre eux **croissent** : le retard sur
 * l'objectif, l'historique, et l'attente. Un facteur croissant sans plafond finit toujours par
 * écraser les trois autres — non pas parce qu'il compte davantage, mais parce que rien ne l'arrête.
 * Le jour où ça arrive, l'ordre de travail de Lady change sans qu'aucune décision ne l'ait voulu,
 * et le dirigeant lit une justification exacte pour un comportement qu'il n'a pas choisi.
 *
 * Chaque borne est donc **nommée, plafonnée, et réglable sans redéploiement** — comme le seuil de
 * `garde_du_silence`, et pour la même raison : on saura qu'elle est mal calibrée en la voyant
 * tourner, pas en la relisant.
 *
 * ══ POURQUOI DES POURCENTAGES ENTIERS, ET PAS DES FRACTIONS ══
 *
 * `ReglagesRuntime` n'accepte que des entiers strictement positifs (`entierPositif`), et ce refus
 * du repli silencieux est ce qui rend ses variables d'environnement sûres. Ces bornes suivent la
 * même discipline plutôt que d'introduire un second régime de lecture : « 20 » se lit « 20 % »,
 * une seule fois, ici.
 *
 * ⚠️ Ces bornes ne décident RIEN. Elles empêchent seulement un facteur de tout décider seul.
 */

export interface BornesDePriorisation {
  /**
   * De combien, au plus, un retard sur l'objectif amplifie le poids d'un travail. `150` = ×2,5.
   *
   * Un retard DOIT pouvoir dépasser une priorité déclarée faible — c'est le comportement voulu :
   * ce qu'on observe l'emporte sur ce qu'on croyait. Mais borné, sinon deux cycles consécutifs
   * peuvent produire deux ordres de travail opposés pour un écart qui a à peine bougé, et
   * l'employée devient une girouette au lieu d'une employée qui s'ajuste.
   *
   * ⚠️ **`150` N'EST PAS UN CHIFFRE ROND CHOISI AU HASARD, ET `100` SERAIT UN PIÈGE.** Les rangs
   * pèsent `1, 1/2, 1/3…` : un rang d'écart vaut donc exactement ×2. À `100`, un retard
   * *égaliserait* le rang suivant au lieu de le dépasser, et le départage alphabétique
   * trancherait — un comportement décidé par ordre de nom, pour une raison que personne ne
   * pourrait expliquer au dirigeant. À `150`, la règle se dit en une phrase : **un retard fait
   * remonter un travail de plus d'un rang, jamais de deux.** Il corrige le classement, il ne le
   * renverse pas.
   */
  readonly ecartMaximumPourcent: number;
  /**
   * De combien, au plus, l'historique des résultats corrige un poids, dans les deux sens.
   *
   * ⚠️ C'est la borne qui garantit qu'une mémoire apprise **ne peut jamais inverser** un ordre
   * fixé par la configuration du dirigeant : elle nuance, elle ne tranche pas. Tant que
   * `outcome` n'est pas alimenté (`docs/35`), la correction vaut zéro — la borne protège donc
   * aujourd'hui un mécanisme qui ne s'exerce pas encore, et c'est exprès : elle sera déjà là,
   * testée, le jour où le signal arrivera.
   */
  readonly historiqueMaximumPourcent: number;
  /** De combien le poids d'un travail délaissé croît par jour d'attente. `25` = +25 %/jour. */
  readonly vieillissementParJourPourcent: number;
  /**
   * Le plafond de cette croissance. `200` = ×3 au maximum, quelle que soit l'attente.
   *
   * Sans lui, un travail oublié six mois finirait par accaparer tout le budget d'un seul coup,
   * au lieu d'être simplement repris. La saturation transforme « il finira par passer » en « il
   * passe régulièrement », qui est la garantie qu'on veut réellement.
   */
  readonly vieillissementMaximumPourcent: number;
  /**
   * Le poids d'un travail éligible mais **absent** des priorités du dirigeant. Jamais zéro.
   *
   * ⚠️ Zéro le rendrait invisible au vieillissement — un score nul reste nul quel que soit le
   * facteur qui le multiplie — et il ne serait donc jamais repris. C'est exactement la famine que
   * le vieillissement existe pour empêcher. Un travail que le dirigeant n'a pas cité passe en
   * dernier ; il ne disparaît pas.
   */
  readonly poidsSansPrioritePourcent: number;
}

/** Les valeurs en vigueur. Point de départ à réexaminer quand les premiers cycles auront tourné. */
export const BORNES_DE_PRIORISATION_PAR_DEFAUT: BornesDePriorisation = {
  ecartMaximumPourcent: 150,
  historiqueMaximumPourcent: 20,
  vieillissementParJourPourcent: 25,
  vieillissementMaximumPourcent: 200,
  poidsSansPrioritePourcent: 10,
};

/** Les variables d'environnement qui peuvent surcharger une borne, sans redéploiement. */
export const VARIABLES_PRIORISATION = {
  ecartMaximumPourcent: "SENTIO_PRIORISATION_ECART_MAX_POURCENT",
  historiqueMaximumPourcent: "SENTIO_PRIORISATION_HISTORIQUE_MAX_POURCENT",
  vieillissementParJourPourcent: "SENTIO_PRIORISATION_VIEILLISSEMENT_PAR_JOUR_POURCENT",
  vieillissementMaximumPourcent: "SENTIO_PRIORISATION_VIEILLISSEMENT_MAX_POURCENT",
  poidsSansPrioritePourcent: "SENTIO_PRIORISATION_POIDS_SANS_PRIORITE_POURCENT",
} as const satisfies Record<keyof BornesDePriorisation, string>;

/**
 * Lit un pourcentage entier, ou **échoue**.
 *
 * Aucun repli silencieux, exactement comme `lireReglagesRuntime` : une borne mal écrite doit se
 * voir au démarrage, jamais se traduire en un ordre de travail qu'aucun humain n'a choisi.
 * `poidsSansPrioritePourcent` est le seul qui refuse zéro pour une raison de fond, dite plus haut ;
 * les autres l'acceptent (`0` = « ce facteur ne joue pas », un réglage légitime).
 */
function pourcentage(nom: string, brut: string, strictementPositif: boolean): number {
  const valeur = Number(brut.trim());
  const valide = Number.isInteger(valeur) && (strictementPositif ? valeur > 0 : valeur >= 0);
  if (!valide) {
    throw new Error(
      `${nom} = « ${brut} » : un pourcentage entier ${strictementPositif ? "strictement positif" : "positif ou nul"} est attendu. ` +
        "Le réglage n'est pas appliqué en silence : corrigez-le ou retirez la variable.",
    );
  }
  return valeur;
}

/** Les bornes effectives, surcharges d'environnement comprises. */
export function lireBornesDePriorisation(
  env: Readonly<Record<string, string | undefined>> = {},
): BornesDePriorisation {
  const lire = (cle: keyof BornesDePriorisation): number => {
    const nom = VARIABLES_PRIORISATION[cle];
    const brut = env[nom];
    if (brut === undefined || brut === "") return BORNES_DE_PRIORISATION_PAR_DEFAUT[cle];
    return pourcentage(nom, brut, cle === "poidsSansPrioritePourcent");
  };

  return {
    ecartMaximumPourcent: lire("ecartMaximumPourcent"),
    historiqueMaximumPourcent: lire("historiqueMaximumPourcent"),
    vieillissementParJourPourcent: lire("vieillissementParJourPourcent"),
    vieillissementMaximumPourcent: lire("vieillissementMaximumPourcent"),
    poidsSansPrioritePourcent: lire("poidsSansPrioritePourcent"),
  };
}
