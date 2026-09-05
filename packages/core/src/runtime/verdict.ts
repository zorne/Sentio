/**
 * Un silence doit être impossible à confondre avec un succès.
 *
 * ══ LE DÉFAUT QUE CE MODULE FERME ══
 *
 * Le battement rendait `{traites, echoues}`. Deux nombres, et une ambiguïté qui rendait le compte
 * rendu inutile au moment où il aurait servi :
 *
 *   · `{traites:0, echoues:0}` disait indifféremment « rien à faire aujourd'hui » et « tout est
 *     cassé » ;
 *   · `{traites:10, echoues:0}` pouvait vouloir dire dix missions abouties — ou dix missions
 *     **reportées** faute de fournisseur conforme, `traites` ne comptant que « aucune exception
 *     n'a été levée ». Un rapport rassurant et faux, produit toutes les dix minutes.
 *
 * Le second cas n'est pas théorique : c'est l'état exact de la production tant que l'opt-out
 * d'entraînement n'est pas prouvé. Chaque run atteindrait le modèle, serait refusé par le Gateway,
 * et le compte rendu annoncerait un travail qui n'a pas eu lieu.
 *
 * ══ POURQUOI LE VERDICT EST CALCULÉ ICI, ET NULLE PART AILLEURS ══
 *
 * ⚠️ **C'est une frontière, pas un confort.** Le planificateur qui appelle le battement doit LIRE
 * ce verdict, jamais le reconstituer à partir des chiffres. Écrire « si echoues > 0 alors alerte »
 * dans un script rendrait la règle présente à deux endroits : elles divergeraient au premier
 * changement, et c'est le script — sans test, sans revue — qui déciderait alors si l'on alerte.
 *
 * Ici, la règle est en TypeScript, avec ses cas, et `verify` la garde.
 *
 * ══ LA RÈGLE ══
 *
 * Un battement est **anormal** si l'une de ces quatre choses est vraie :
 *
 *   1. un refus d'approvisionnement est une **anomalie** et non un silence légitime ;
 *   2. une capacité a été **écartée du registre** — un contrat illisible en base ;
 *   3. un travail a **échoué** ;
 *   4. du travail était **dû** et **rien n'a abouti** ;
 *   5. le cycle d'un employé a été **bloqué par quelque chose qui est de notre ressort** — même
 *      si d'autres entreprises, elles, ont travaillé ;
 *   6. un run a **consommé son budget sans exécuter une seule action** — il a payé sans rien
 *      produire.
 *
 * Tout le reste est normal, y compris — et surtout — l'absence totale d'activité. Une entreprise
 * sans abonnement, un objectif atteint, un quota consommé, un travail du jour déjà ouvert : ce
 * sont des silences que le produit PRODUIT, et les signaler apprendrait à ignorer les signaux.
 * C'est la leçon écrite dans `prospect-cron.yml` : « le vrai coût n'était pas le bruit, c'était
 * l'accoutumance ».
 */

/**
 * Ce qu'un pas a produit et qui compte comme un travail ayant réellement AVANCÉ.
 *
 * ⚠️ **EXPORTÉE PARCE QUE LE COMPTEUR POSE LA MÊME QUESTION** (`travail-muet.ts`). Deux listes,
 * l'une pour le verdict et l'autre pour le compteur, divergeraient au premier motif ajouté — et
 * l'on se retrouverait avec un battement jugé normal pendant que le compteur alerte, ou
 * l'inverse. Une seule liste, deux lecteurs.
 */
export const MOTIFS_QUI_ABOUTISSENT: ReadonlySet<string> = new Set([
  /** Le pas suivant est dû tout de suite : le travail progresse. */
  "pas_suivant",
  /** Le modèle a jugé le travail fini. */
  "travail_acheve",
  /** Le budget du cycle est épuisé, mais des pas ont bien eu lieu. */
  "budget_epuise",
  /** Le client a une question à trancher : la mission a avancé jusqu'à lui. */
  "accord_attendu",
  /**
   * Un effet irréversible a été engagé et une personne doit en vérifier l'issue.
   *
   * ⚠️ AJOUTÉ AVEC LE COMPTEUR, ET C'EST UNE CORRECTION. Ce motif a exactement la forme
   * d'`accord_attendu` : quelque chose a été fait, et la mission a avancé **jusqu'à une
   * personne**. L'omettre le faisait compter comme « rien n'a abouti », donc comme une panne à
   * notre charge — alors que le produit venait de faire précisément ce qu'on lui demande.
   */
  "verification_humaine",
]);

/**
 * Les refus d'approvisionnement qui sont des **anomalies**, et non des silences légitimes.
 *
 * ⚠️ Cette liste est le miroir exact de ce que `planifierLApprovisionnement` refuse d'inscrire
 * comme lot du jour : `employe_inconnu` et `verdict_inconnu` en sont écartés là-bas parce que les
 * inscrire « les tairait jusqu'au lendemain, c'est-à-dire exactement le temps qu'il faut pour ne
 * pas les voir ». Même raisonnement, même liste. `gisement_inconnu` et `erreur` viennent du
 * battement lui-même.
 */
const REFUS_ANORMAUX: ReadonlySet<string> = new Set([
  "employe_inconnu",
  "verdict_inconnu",
  "gisement_inconnu",
  "erreur",
]);

export interface EntreeDuVerdict {
  readonly approvisionnement: {
    readonly ouvertes: number;
    readonly refus: Readonly<Record<string, number>>;
  };
  readonly reprise: { readonly reprises: number };
  readonly travaux: {
    readonly traites: number;
    readonly echoues: number;
    readonly motifs: Readonly<Record<string, number>>;
    /**
     * Runs qui ont consommé leur budget sans exécuter une seule action.
     *
     * ⚠️ **CE COMPTE NE SE DÉDUIT D'AUCUN MOTIF, ET C'EST TOUT SON INTÉRÊT.** Un run qui tourne
     * dix fois sur une réponse illisible rend `{pas_suivant: 9, budget_epuise: 1}` — deux motifs
     * qui, l'un comme l'autre, veulent dire « le travail avance ». Ils ne mentent pas : des pas
     * ont bien eu lieu. C'est le RÉSULTAT qui manque, et seul ce compte le voit.
     */
    readonly sansAction: number;
  };
  /** Capacités dont le contrat était illisible en base. Voir `chargerLeRegistre`. */
  readonly capacitesEcartees: readonly unknown[];
  readonly compteur: {
    /**
     * Les employés dont le cycle n'a rien fait aboutir pour une raison qui est de NOTRE ressort
     * — un moteur non monté, un contexte incomplet, un report de quota.
     *
     * ⚠️ **CE N'EST PAS UN DOUBLON DE `rien_n_a_abouti`.** Celui-là ne parle que du battement
     * entier : dix entreprises qui travaillent et une onzième complètement bloquée par un défaut
     * de chez nous rendent un battement où « quelque chose a abouti », donc muet. Ce compte-là
     * regarde entreprise par entreprise, et c'est la seule façon de voir le client qui ne
     * travaille pas au milieu de ceux qui travaillent.
     */
    readonly aNotreCharge: number;
  };
}

export interface VerdictDuBattement {
  readonly verdict: "normal" | "anormal";
  /** Ce qui le rend anormal, nommé. Vide quand il est normal — un verdict sans raison n'aide pas. */
  readonly anomalies: readonly string[];
  /**
   * Du travail était-il réellement dû ?
   *
   * C'est la règle que suit le compteur (`travail-muet.ts`) : il n'avance **que** sur un cycle où du
   * travail était dû et n'a pas abouti. Sans cette condition, une période creuse légitime — pas
   * d'abonnement, objectif atteint, quota consommé — déclencherait une fausse alerte, et le
   * dirigeant apprendrait à ignorer le canal.
   */
  readonly duTravailEtaitDu: boolean;
};

/**
 * Juge un battement. **Fonction pure et totale** : mêmes chiffres, même verdict, toujours.
 */
export function jugerLeBattement(entree: EntreeDuVerdict): VerdictDuBattement {
  const anomalies: string[] = [];

  for (const [raison, combien] of Object.entries(entree.approvisionnement.refus)) {
    if (REFUS_ANORMAUX.has(raison) && combien > 0) {
      anomalies.push(`approvisionnement_${raison}`);
    }
  }

  if (entree.capacitesEcartees.length > 0) {
    anomalies.push("contrat_de_capacite_illisible");
  }

  if (entree.travaux.echoues > 0) {
    anomalies.push("travaux_echoues");
  }

  if (entree.compteur.aNotreCharge > 0) {
    anomalies.push("travail_bloque_chez_nous");
  }

  // ⚠️ LA RÈGLE GÉNÉRALE, ET ELLE EST INDÉPENDANTE DES MOTIFS. Un run qui a consommé son budget
  // sans une seule action exécutée a payé sans rien produire — quelle que soit la façon dont il
  // s'est terminé. Viser un motif en particulier laisserait passer la variante suivante.
  if (entree.travaux.sansAction > 0) {
    anomalies.push("run_sans_action");
  }

  // Du travail était dû si quelque chose a été ouvert, repris, ou pris dans la file. Un battement
  // qui ne trouve rien n'est pas en panne : c'est le cas le plus fréquent, et le plus normal.
  const duTravailEtaitDu =
    entree.approvisionnement.ouvertes > 0 ||
    entree.reprise.reprises > 0 ||
    entree.travaux.traites + entree.travaux.echoues > 0;

  const aAbouti = Object.entries(entree.travaux.motifs).some(
    ([motif, combien]) => MOTIFS_QUI_ABOUTISSENT.has(motif) && combien > 0,
  );

  // ⚠️ LE CAS QUI MOTIVE TOUT CE MODULE. Des missions ont été prises, aucune n'a avancé : toutes
  // reportées, ou arrêtées faute d'outil. Sans cette ligne, le compte rendu dirait
  // `{traites:N, echoues:0}` et personne ne verrait que rien ne se fait.
  if (duTravailEtaitDu && !aAbouti && entree.travaux.echoues === 0) {
    anomalies.push("rien_n_a_abouti");
  }

  return {
    verdict: anomalies.length > 0 ? "anormal" : "normal",
    anomalies,
    duTravailEtaitDu,
  };
}
