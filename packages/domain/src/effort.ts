/**
 * De l'objectif du dirigeant au volume de travail que Lady doit fournir.
 *
 * ══ LE CHAÎNON QUI MANQUAIT ══
 *
 * L'objectif existait, les missions s'y rattachaient (`20260815120002`), et **rien ne reliait la
 * cible au volume**. La cadence venait d'un réglage fixe et du quota de la formule : un client
 * visant 2 000 € et un client visant 20 000 € recevaient exactement le même travail.
 *
 * ══ CE QUE CE MODULE PROMET, ET CE QU'IL NE PROMET PAS ══
 *
 * ⚠️ **Il ne promet pas le résultat.** « Promesse de résultat » est une limite de l'ADN, et
 * l'invariant 4 du dépôt interdit tout chiffre que rien ne justifie. Un produit qui garantit
 * 10 000 € ment — le marché, l'offre et le prix du client ne lui appartiennent pas.
 *
 * Il promet l'**effort** : combien d'entreprises approcher pour que la cible soit atteignable,
 * compte tenu de ce que le client déclare de son activité. C'est vérifiable, mesurable, et c'est
 * ce sur quoi Sentio peut s'engager.
 *
 * ══ POURQUOI RIEN N'EST DEVINÉ ══
 *
 * Le calcul repose sur deux nombres qui appartiennent au client : son panier moyen et son taux de
 * conversion. Les supposer produirait un dimensionnement faux — donc un employé qui travaille
 * trop peu (le client n'atteint rien) ou beaucoup trop (on brûle sa réputation). Quand ils
 * manquent, on le DIT au lieu de combler.
 */

/** Ce que le client déclare de son activité. Aucune de ces valeurs n'est estimée par Sentio. */
export interface HypothesesDeConversion {
  /**
   * Ce que rapporte une vente, en moyenne. Nécessaire uniquement quand l'objectif est monétaire :
   * un objectif en rendez-vous se compte directement.
   */
  readonly panierMoyen: number | null;
  /**
   * Part des entreprises approchées qui aboutissent à **l'unité que l'objectif mesure**. Un
   * taux, entre 0 et 1. Défini par rapport à la métrique de l'objectif, pas dans l'absolu :
   * sinon « 5 % » ne voudrait pas dire la même chose selon qu'on compte des ventes ou des
   * rendez-vous.
   */
  readonly tauxDeConversion: number | null;
}

/** Les métriques dont on sait dériver un volume. Fermée : ce qui n'y est pas ne se dimensionne pas. */
export const METRIQUES_MONETAIRES = ["chiffre_affaires", "mrr"] as const;

export type EffortRequis =
  | {
      readonly statut: "calcule";
      /** Combien d'unités de la métrique il faut produire sur l'horizon. */
      readonly unitesRequises: number;
      /** Combien d'entreprises approcher pour espérer les produire. */
      readonly prospectsRequis: number;
      /** Et par jour ouvré — c'est ce qui pilote la cadence. */
      readonly parJourOuvre: number;
      /** Les nombres qui ont servi, pour que le dirigeant puisse les contester. */
      readonly fondements: readonly string[];
    }
  | {
      readonly statut: "incalculable";
      /** Ce qui manque, nommé. Jamais comblé par une valeur par défaut. */
      readonly manque: readonly string[];
    };

/** Jours ouvrés dans un mois, par convention. Sorti ici pour qu'aucun calcul ne l'écrive en dur. */
export const JOURS_OUVRES_PAR_MOIS = 21;

/**
 * Combien de travail la cible exige.
 *
 * Le calcul est volontairement simple et lisible — un dirigeant doit pouvoir le refaire de tête :
 *
 *     unités requises   = cible ÷ panier moyen      (si l'objectif est en euros)
 *     prospects requis  = unités requises ÷ taux de conversion
 *     par jour ouvré    = prospects requis ÷ jours ouvrés
 *
 * Un modèle plus fin (cycle de vente, saisonnalité, désistements) serait plus juste et
 * invérifiable par celui qui le subit. On préfère un calcul qu'il peut contester.
 */
export function effortRequis(input: {
  readonly metrique: string;
  readonly cible: number;
  readonly hypotheses: HypothesesDeConversion;
  readonly joursOuvres?: number;
}): EffortRequis {
  const manque: string[] = [];
  const monetaire = (METRIQUES_MONETAIRES as readonly string[]).includes(input.metrique);

  if (input.cible <= 0) manque.push("un objectif chiffré supérieur à zéro");
  if (monetaire && (input.hypotheses.panierMoyen === null || input.hypotheses.panierMoyen <= 0)) {
    manque.push("ce que rapporte une vente en moyenne");
  }
  const taux = input.hypotheses.tauxDeConversion;
  if (taux === null || taux <= 0 || taux > 1) {
    manque.push("la part des entreprises approchées qui aboutissent");
  }

  if (manque.length > 0) return { statut: "incalculable", manque };

  const panier = input.hypotheses.panierMoyen as number;
  const conversion = taux as number;
  const joursOuvres = input.joursOuvres ?? JOURS_OUVRES_PAR_MOIS;

  const unitesRequises = monetaire ? input.cible / panier : input.cible;
  const prospectsRequis = unitesRequises / conversion;

  const fondements = [
    `objectif : ${input.cible} ${input.metrique}`,
    ...(monetaire ? [`une vente rapporte en moyenne ${panier}`] : []),
    `${Math.round(conversion * 100)} % des entreprises approchées aboutissent`,
    `${joursOuvres} jours ouvrés sur l'horizon`,
  ];

  return {
    statut: "calcule",
    // Arrondis AU-DESSUS : viser 9,4 ventes en produisant 9 revient à rater la cible par
    // construction. Un dixième d'entreprise approchée n'existe pas.
    unitesRequises: Math.ceil(unitesRequises),
    prospectsRequis: Math.ceil(prospectsRequis),
    parJourOuvre: Math.ceil(prospectsRequis / joursOuvres),
    fondements,
  };
}

/** Ce que la formule du client permet, comparé à ce que sa cible exige. */
export type Tenabilite =
  | { readonly statut: "tenable"; readonly parJourOuvre: number }
  | {
      readonly statut: "hors_de_portee";
      readonly parJourOuvre: number;
      readonly plafondParJour: number;
      /** Ce qu'on dit au dirigeant, en toutes lettres. */
      readonly message: string;
    };

/**
 * Dit si la cible est atteignable dans les limites de la formule.
 *
 * ⚠️ **C'est un refus honnête, pas un frein commercial.** Vendre une formule qui ne peut pas
 * porter l'objectif annoncé, c'est vendre un échec avec un mois de délai. Mieux vaut proposer la
 * formule supérieure, ou dire que la cible demande autre chose que du volume.
 */
export function tenabilite(effort: EffortRequis, plafondParJour: number): Tenabilite | null {
  if (effort.statut !== "calcule") return null;

  if (effort.parJourOuvre <= plafondParJour) {
    return { statut: "tenable", parJourOuvre: effort.parJourOuvre };
  }

  return {
    statut: "hors_de_portee",
    parJourOuvre: effort.parJourOuvre,
    plafondParJour,
    message:
      `Votre objectif demande d'approcher ${effort.parJourOuvre} entreprises par jour ouvré ; ` +
      `cette formule en permet ${plafondParJour}. Nous préférons vous le dire maintenant : à ce ` +
      `rythme, la cible ne sera pas atteinte, et ce n'est pas votre employé qui sera en cause.`,
  };
}
