/**
 * Les réglages du runtime : à quel rythme un employé travaille, et jusqu'où il va en une fois.
 *
 * ══ POURQUOI ICI, ET PAS DANS LE CODE DU RUNTIME ══
 *
 * Une borne écrite en dur dans `suite-du-run.ts` ne se change pas : elle se **réécrit**, avec le
 * test qui la cite, la documentation qui la commente, et la relecture qui va avec. Or ces deux
 * valeurs vont bouger — la borne de pas quand les runs auront prouvé leur coût réel, la cadence
 * quand un client demandera plus qu'une fois par jour. Elles vivent donc en configuration, comme
 * les quotas et les seuils : `deciderLaSuite` les **reçoit**, elle ne les connaît pas.
 *
 * ══ CE QUE CHAQUE VALEUR PROMET ══
 *
 *   · `pasMaximumParRun` — au-delà, le cycle de travail s'arrête **proprement** et le run est
 *     reporté à la cadence suivante. Ce n'est pas un garde-fou contre une boucle : c'est le
 *     budget d'une journée de travail. Un run qui n'a pas fini reprend demain là où il s'est
 *     arrêté, sans rien perdre — l'état se relit dans le journal (EXEC-02).
 *   · `missionsMaxParJour` — combien de **nouvelles** missions un employé ouvre au maximum dans
 *     une journée. Les missions déjà ouvertes, elles, ne consomment rien : elles se réveillent
 *     seules à la cadence (`run_reporte`). L'approvisionnement n'ouvre que du neuf.
 *   · `cadenceEntreRunsHeures` — le délai entre deux cycles de travail. Côté produit, c'est
 *     « votre employé travaille chaque jour », pas une limite technique.
 *   · `delaiApresEchecTransitoireMinutes` — de combien on attend avant de retenter un pas qui a
 *     échoué de façon passagère. Court, mais jamais nul : rejouer immédiatement une panne
 *     passagère la transforme en boucle serrée qui consomme du quota sans jamais aboutir.
 *
 * ⚠️ Ces valeurs sont **globales**, pas par formule ni par entreprise. Le jour où une formule
 * supérieure vendra « plus de travail par jour », la valeur devra se lire dans `plan`, comme
 * `plan.job_priority` — c'est-à-dire en données, jamais par une condition sur le nom de la
 * formule (`docs/03-modele-de-donnees.md`). Ce n'est pas fait, et ce n'est pas caché.
 */

export interface ReglagesRuntime {
  /** Nombre de pas qu'un run exécute au maximum en un cycle, avant d'être reporté. */
  readonly pasMaximumParRun: number;
  /**
   * Nombre de **nouvelles missions** qu'un employé ouvre au maximum en une journée.
   *
   * Un plafond, jamais une cible : s'il n'y a que trois sujets éligibles, on en ouvre trois.
   * Il ne se déduit **pas** de l'objectif du client — le déduire exigerait un taux de conversion
   * que personne n'a encore mesuré, et produirait un chiffre inventé présenté comme calculé
   * (`AGENTS.md`, invariant 4). L'objectif dit quand **arrêter** d'ouvrir, pas combien ouvrir.
   */
  readonly missionsMaxParJour: number;
  /** Délai entre deux cycles de travail d'un même run. */
  readonly cadenceEntreRunsHeures: number;
  /** Délai avant de retenter un pas dont l'échec était passager. */
  readonly delaiApresEchecTransitoireMinutes: number;
  /**
   * Durée du bail sur un travail pris dans la file.
   *
   * Un exécutant qui prend un travail le verrouille. S'il meurt en plein pas — panne, redéploiement,
   * dépassement de délai —, ce verrou ne sera **jamais** rendu : sans bail, le travail resterait
   * invisible à tous les exécutants pour toujours. Passé ce délai, un autre le reprend.
   *
   * Le régler trop court fait travailler deux exécutants sur la même mission ; c'est sans danger
   * pour les effets (la clé d'idempotence les protège, EXEC-06) mais coûte du quota pour rien.
   */
  readonly bailDuVerrouMinutes: number;
  /**
   * Combien de fois une mission peut être **reprise après interruption** avant qu'on appelle un
   * humain.
   *
   * Une mission qui tue l'exécutant à chaque tentative le tuera aussi la fois suivante. Sans cette
   * borne, elle serait reprise indéfiniment : chaque reprise consomme un exécutant, et une seule
   * mission empoisonnée suffit à ne plus rien faire avancer. La borne ne devine rien — elle compte
   * les reprises réelles (`job.attempts`), c'est-à-dire les fois où un bail a expiré sans résultat.
   */
  readonly repriseMaxApresInterruption: number;
  /**
   * Nombre de travaux qu'un battement traite au maximum.
   *
   * Une borne, pas une cible : le battement s'arrête dès que la file est vide. Elle existe pour
   * qu'un battement ne puisse pas tourner sans fin — le planificateur qui l'appelle a lui-même
   * un délai maximal, et un battement qui le dépasse est tué au milieu d'un pas.
   */
  readonly travauxMaxParBattement: number;
  /**
   * Nombre de faits qu'une réflexion d'après-run peut retenir au maximum (METIER-14).
   *
   * Un plafond bas est le cœur de la règle, pas une économie. Une réflexion qui retient dix
   * observations par run remplit la mémoire d'entreprise de banalités en une semaine, et le tri
   * par usage — celui qui décide quels faits entrent dans le contexte — devient incapable de
   * distinguer ce qui compte. Contraindre à trois oblige à choisir.
   *
   * Zéro est une issue normale, jamais un échec : un run dont on n'apprend rien ne doit rien
   * inventer pour remplir le quota.
   */
  readonly faitsMaxParRun: number;
}

/**
 * Les valeurs en vigueur, décidées par le fondateur le 2026-08-07
 * (`docs/adr/0026-cadence-et-borne-de-pas.md`).
 */
export const REGLAGES_RUNTIME_PAR_DEFAUT: ReglagesRuntime = {
  pasMaximumParRun: 10,
  missionsMaxParJour: 10,
  cadenceEntreRunsHeures: 24,
  delaiApresEchecTransitoireMinutes: 15,
  bailDuVerrouMinutes: 10,
  repriseMaxApresInterruption: 3,
  travauxMaxParBattement: 25,
  faitsMaxParRun: 3,
};

/** Les variables d'environnement qui peuvent surcharger un réglage, sans redéploiement. */
export const VARIABLES_RUNTIME = {
  pasMaximumParRun: "SENTIO_PAS_MAX_PAR_RUN",
  missionsMaxParJour: "SENTIO_MISSIONS_MAX_PAR_JOUR",
  cadenceEntreRunsHeures: "SENTIO_CADENCE_RUNS_HEURES",
  delaiApresEchecTransitoireMinutes: "SENTIO_DELAI_RETENTATIVE_MINUTES",
  bailDuVerrouMinutes: "SENTIO_BAIL_VERROU_MINUTES",
  repriseMaxApresInterruption: "SENTIO_REPRISE_MAX",
  travauxMaxParBattement: "SENTIO_TRAVAUX_MAX_PAR_BATTEMENT",
  faitsMaxParRun: "SENTIO_FAITS_MAX_PAR_RUN",
} as const satisfies Record<keyof ReglagesRuntime, string>;

/**
 * Lit un entier strictement positif, ou **échoue**.
 *
 * Aucun repli silencieux sur la valeur par défaut : une variable mal écrite (`"dix"`, `"0"`,
 * `"10 "`) doit se voir au démarrage, pas se traduire en un employé qui travaille avec un budget
 * qu'aucun humain n'a choisi. Un contrôle bruyant s'ajuste ; un repli muet fait croire que le
 * réglage a été pris en compte (`docs/adr/0024`).
 */
function entierPositif(nom: string, brut: string): number {
  const valeur = Number(brut.trim());
  if (!Number.isInteger(valeur) || valeur <= 0) {
    throw new Error(
      `${nom} = « ${brut} » : un entier strictement positif est attendu. ` +
        "Le réglage n'est pas appliqué en silence : corrigez-le ou retirez la variable.",
    );
  }
  return valeur;
}

/**
 * Les réglages effectifs, surcharges d'environnement comprises.
 *
 * L'environnement est passé en paramètre — jamais lu depuis `process.env` ici : ce paquet est
 * importé par les fonctions serveur sous Deno, où `process` n'existe pas
 * (`scripts/verifier-frontieres.mjs`, règle 1).
 */
export function lireReglagesRuntime(
  env: Readonly<Record<string, string | undefined>> = {},
): ReglagesRuntime {
  const lire = (cle: keyof ReglagesRuntime): number => {
    const nom = VARIABLES_RUNTIME[cle];
    const brut = env[nom];
    if (brut === undefined || brut === "") return REGLAGES_RUNTIME_PAR_DEFAUT[cle];
    return entierPositif(nom, brut);
  };

  return {
    pasMaximumParRun: lire("pasMaximumParRun"),
    missionsMaxParJour: lire("missionsMaxParJour"),
    cadenceEntreRunsHeures: lire("cadenceEntreRunsHeures"),
    delaiApresEchecTransitoireMinutes: lire("delaiApresEchecTransitoireMinutes"),
    bailDuVerrouMinutes: lire("bailDuVerrouMinutes"),
    repriseMaxApresInterruption: lire("repriseMaxApresInterruption"),
    travauxMaxParBattement: lire("travauxMaxParBattement"),
    faitsMaxParRun: lire("faitsMaxParRun"),
  };
}
