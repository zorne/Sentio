/**
 * EXEC-08 — ce qui arrive après un pas : replanifier, reporter, terminer, ou appeler un humain.
 *
 * C'est le dernier maillon de la boucle décrite par `docs/05-runtime-employe.md` :
 *
 *     charger l'état → assembler le contexte → proposer → décider → exécuter → journaliser → ICI
 *
 * ══ LA QUESTION QU'IL FAUT SE POSER, ET UNE SEULE ══
 *
 * « Est-ce que quelque chose peut encore avancer tout seul ? »
 *
 *   · oui, tout de suite         → **poursuivre** : le pas suivant est dû immédiatement ;
 *   · oui, mais plus tard        → **reporter** : une échéance, et le run reprend là où il est ;
 *   · non, le travail est fini   → **terminer** : le run se referme, la tâche quitte la file ;
 *   · non, il faut quelqu'un     → **attendre un humain** : aucune échéance, une notification.
 *
 * Il n'existe pas de cinquième issue, et surtout pas d'issue implicite : une fonction qui rendrait
 * `undefined` sur un cas oublié laisserait un run indéfiniment verrouillé dans la file, sans que
 * rien ne le signale. Le type somme oblige l'appelant à traiter les quatre.
 *
 * ══ LES DEUX DÉCISIONS PRODUIT QUI VIVENT ICI ══
 *
 * **La cadence.** Un employé travaille chaque jour. Ce n'est pas une limite technique qu'on
 * s'excuserait d'avoir : c'est le rythme d'un collaborateur. Le délai vient de la configuration
 * (`@sentio/config`, `cadenceEntreRunsHeures`), jamais d'une constante écrite ici.
 *
 * **Le budget de pas.** Un cycle de travail vaut au plus `pasMaximumParRun` pas. Au-delà, le run
 * ne s'arrête pas *en panne* : il s'arrête **proprement**, et il est reporté. Rien n'est perdu —
 * l'état complet se relit dans le journal au cycle suivant (EXEC-02), et le compteur repart de
 * zéro parce qu'un `run_reporte` a été écrit.
 *
 * Ce que le budget protège, concrètement : le quota d'inférence partagé, la facture, et la
 * capacité à regarder ce qu'un employé a fait avant qu'il n'en fasse trop. Un run sans borne se
 * découvre le jour où le fournisseur coupe.
 *
 * ══ CE QUE CE MODULE NE FAIT PAS ══
 *
 * Il ne touche ni la base, ni la file, ni le journal. **Fonction pure** : mêmes entrées, même
 * sortie, aucune horloge — `maintenant` est un paramètre. L'application des effets est
 * `apps/worker/src/suite-du-run.ts`, qui connaît la base ; la séparation permet de tester les
 * seize chemins de décision sans Postgres.
 *
 * Réalise : EXEC-08
 */

import type { ReglagesRuntime } from "@sentio/config";

import { TaskDeferred } from "../errors.js";
import type { EtatRun } from "../journal/run-state.js";
import { ATTENTION_REQUISE, PAS_REPORTE, RUN_ECHOUE, RUN_REPORTE, RUN_TERMINE } from "../journal/vocabulaire.js";
import type { ResultatExecution } from "./execute-action.js";
import type { DecisionPas } from "./next-action.js";

/**
 * Ce qu'un pas a produit. Deux formes seulement, parce qu'il n'existe que deux façons de sortir
 * d'un pas : le contexte n'était pas fiable et rien n'a été tenté (EXEC-03), ou une décision a
 * été rendue et, si elle autorisait d'agir, exécutée (EXEC-05/06).
 */
export type IssueDuPas =
  | { readonly kind: "contexte_incomplet"; readonly detail: string }
  /**
   * Aucune capacité activée ne s'applique au sujet de cette mission.
   *
   * ⚠️ **DISTINCT DE `contexte_incomplet`, ET C'EST TOUT L'INTÉRÊT.** Un contexte incomplet dit
   * « rien ne comblera ce manque ». Celui-ci dit l'inverse : **le dirigeant peut le combler**, en
   * activant la capacité qui manque. Les confondre ferait perdre la seule information qui rend ce
   * blocage actionnable — et c'est précisément ce qu'un futur canal d'alerte devra acheminer.
   */
  | { readonly kind: "capacite_absente"; readonly detail: string; readonly sujetKind: string }
  /**
   * Le pas n'a pas eu lieu : un plafond était atteint et le Model Gateway a **reporté** la tâche
   * (`TaskDeferred`, NOYAU-07).
   *
   * ⚠️ Ce cas existe parce qu'il manquait. `decideNextAction` laisse volontairement remonter
   * `TaskDeferred` — « les capturer transformerait un report explicite en travail silencieusement
   * non fait ». Mais personne ne la rattrapait ensuite : elle traversait le runtime en exception
   * non gérée, et le travail restait verrouillé dans la file au lieu d'être reporté. La promesse
   * de NOYAU-07 — « la tâche est reportée avec un message clair » — n'était donc pas tenue de
   * bout en bout.
   */
  | { readonly kind: "report_de_quota"; readonly clientMessage: string; readonly detail: string }
  | {
      readonly kind: "decision";
      readonly decision: DecisionPas;
      /** Le résultat de l'exécution, ou `null` quand la décision n'autorisait pas d'agir. */
      readonly execution: ResultatExecution | null;
    };

/** Pourquoi le run continue, s'arrête, ou attend. Un nom par cas : « autre » n'existe pas. */
export type MotifSuite =
  /** Le travail avance et le budget du cycle le permet. */
  | "pas_suivant"
  /** Le budget de pas du cycle est épuisé : le run reprend à la cadence suivante. */
  | "budget_epuise"
  /** Un plafond d'inférence est atteint : le travail est reporté, jamais dégradé (NOYAU-07). */
  | "report_de_quota"
  /** Échec passager : le même pas est retenté après un court délai. */
  | "nouvelle_tentative"
  /** Le modèle a jugé le travail fini. */
  | "travail_acheve"
  /** Échec définitif, ou trop de tentatives. */
  | "echec_definitif"
  /** Le Policy Engine attend un accord du client sur une action précise. */
  | "accord_attendu"
  /** Un effet irréversible a été engagé et son issue est inconnue : personne ne doit deviner. */
  | "verification_humaine"
  /** Une couche indispensable manque : l'employé ne peut pas travailler, et rien ne la comblera. */
  | "contexte_incomplet"
  /** Aucune capacité activée ne s'applique à ce sujet. Le dirigeant, lui, peut y remédier. */
  | "capacite_absente";

export type SuiteDuRun =
  /** Le pas suivant est dû immédiatement. Aucun événement de journal : le pas a déjà écrit le sien. */
  | {
      readonly kind: "poursuivre";
      readonly motif: "pas_suivant";
      readonly quand: Date;
      readonly pasRestants: number;
      readonly nature: null;
      readonly detail: string;
    }
  /** Le run garde sa place dans la file, avec une nouvelle échéance. */
  | {
      readonly kind: "reporter";
      readonly motif: "budget_epuise" | "nouvelle_tentative" | "report_de_quota";
      readonly quand: Date;
      readonly nature: typeof RUN_REPORTE | typeof PAS_REPORTE;
      readonly detail: string;
      /** Le message destiné au client, quand il en existe un (report de quota). Soumis au
       *  lexique — il vient du Gateway, qui l'a déjà rédigé (`DEFERRAL_MESSAGES`). */
      readonly messageClient?: string;
    }
  /** Le run se referme. La tâche quitte la file : plus rien n'est dû. */
  | {
      readonly kind: "terminer";
      readonly motif: "travail_acheve" | "echec_definitif";
      readonly issue: "termine" | "echoue";
      readonly nature: typeof RUN_TERMINE | typeof RUN_ECHOUE;
      readonly detail: string;
    }
  /**
   * Le run est arrêté et **attend une personne**. Aucune échéance : une échéance ferait repartir
   * tout seul un run que personne n'a débloqué, ce qui est exactement le contraire de ce qu'on
   * promet au client.
   *
   * `nature` vaut `null` pour une demande d'accord : le Policy Engine a déjà écrit
   * `politique_suspend`, et ajouter un événement par-dessus ferait perdre à l'état sa lisibilité
   * (`attente_accord` deviendrait `attention_requise`, et la reprise après accord ne saurait plus
   * quoi rouvrir).
   */
  | {
      readonly kind: "attendre_humain";
      readonly motif:
        | "accord_attendu"
        | "verification_humaine"
        | "contexte_incomplet"
        | "capacite_absente";
      readonly nature: typeof ATTENTION_REQUISE | null;
      readonly detail: string;
    };

export interface EntreeSuiteDuRun {
  readonly issue: IssueDuPas;
  /** L'état reconstruit APRÈS le pas — c'est lui qui porte `pasDuCycle` (EXEC-02). */
  readonly etat: EtatRun;
  readonly reglages: ReglagesRuntime;
  /** L'instant de référence. Paramètre, jamais `new Date()` : un test qui dépend de l'heure
   *  réelle est un test qui échouera un jour. */
  readonly maintenant: Date;
}

const MS_PAR_HEURE = 60 * 60 * 1000;
const MS_PAR_MINUTE = 60 * 1000;

/** L'intention brute, avant que le budget de pas ait son mot à dire. */
type Intention =
  | { readonly avancer: true }
  | { readonly avancer: "apres_delai"; readonly detail: string }
  | { readonly avancer: "a_la_cadence"; readonly detail: string; readonly messageClient: string }
  | Extract<SuiteDuRun, { kind: "terminer" | "attendre_humain" }>;

/**
 * Ce que le pas appelle, en ne regardant que le pas lui-même.
 *
 * Séparé du budget à dessein : « ce travail peut-il avancer ? » et « a-t-il encore le droit
 * d'avancer aujourd'hui ? » sont deux questions, et les mêler rendrait les deux illisibles.
 */
function intentionDuPas(issue: IssueDuPas): Intention {
  if (issue.kind === "contexte_incomplet") {
    return {
      kind: "attendre_humain",
      motif: "contexte_incomplet",
      nature: ATTENTION_REQUISE,
      detail: issue.detail,
    };
  }

  // ⚠️ Même destination que `contexte_incomplet` — la mission s'arrête et attend une personne —
  // mais un MOTIF distinct, parce que ce qu'il faut faire n'est pas le même. Là, rien ne comblera
  // le manque ; ici, le dirigeant peut activer la capacité. Un futur canal d'alerte aura besoin
  // de cette différence pour dire quoi que ce soit d'utile.
  //
  // ⚠️ Et surtout : ce n'est PAS `echec_definitif`. Une mission qui meurt sans que personne ne
  // sache qu'il lui manquait un outil, c'est exactement le silence que ce produit ne peut pas se
  // permettre.
  if (issue.kind === "capacite_absente") {
    return {
      kind: "attendre_humain",
      motif: "capacite_absente",
      nature: ATTENTION_REQUISE,
      detail: issue.detail,
    };
  }

  if (issue.kind === "report_de_quota") {
    // À la CADENCE, pas dans un quart d'heure : les trois plafonds qui produisent ce report
    // (entreprise, enveloppe, fournisseur) se rouvrent à l'échelle du jour ou du mois, jamais de
    // la minute. Réessayer plus tôt réveillerait le worker pour se faire refuser à l'identique.
    //
    // Et ce n'est PAS une attente humaine : personne n'a rien à faire, le plafond se rouvre tout
    // seul. Notifier ici contredirait la décision produit « on ne dérange qu'un employé bloqué ».
    return {
      avancer: "a_la_cadence",
      detail: issue.detail,
      messageClient: issue.clientMessage,
    };
  }

  const { decision, execution } = issue;

  switch (decision.kind) {
    case "termine":
      return {
        kind: "terminer",
        motif: "travail_acheve",
        issue: "termine",
        nature: RUN_TERMINE,
        detail: decision.raison,
      };

    case "suspendu":
      return {
        kind: "attendre_humain",
        motif: "accord_attendu",
        // Rien à écrire : `politique_suspend` est déjà au journal, et doit y rester le dernier.
        nature: null,
        detail: `« ${decision.proposition.capabilityKey} » attend l'accord du client.`,
      };

    // Un refus de politique ou une réponse illisible n'arrêtent pas le run : le pas suivant peut
    // proposer autre chose. Ce qui empêche la boucle n'est pas un compteur de plus, c'est le
    // budget de pas — dix propositions refusées coûtent dix appels, puis le cycle se referme.
    case "refuse":
    case "proposition_illisible":
      return { avancer: true };

    case "agir":
      break;
  }

  if (execution === null) {
    // Le pas autorisait d'agir mais rien n'a été exécuté : le câblage est incohérent, et une
    // incohérence de câblage ne se rattrape pas en réessayant.
    return {
      kind: "terminer",
      motif: "echec_definitif",
      issue: "echoue",
      nature: RUN_ECHOUE,
      detail: "Action autorisée mais jamais exécutée : le pas est incohérent.",
    };
  }

  switch (execution.kind) {
    case "execute":
    case "deja_fait":
      return { avancer: true };

    case "echec_transitoire":
      return { avancer: "apres_delai", detail: execution.detail };

    case "verification_humaine_requise":
      return {
        kind: "attendre_humain",
        motif: "verification_humaine",
        nature: ATTENTION_REQUISE,
        detail: execution.detail,
      };

    case "echec_definitif":
    case "non_autorise":
      return {
        kind: "terminer",
        motif: "echec_definitif",
        issue: "echoue",
        nature: RUN_ECHOUE,
        detail: execution.detail,
      };
  }
}

/**
 * Décide de la suite du run.
 *
 * Le budget de pas s'applique **après** l'intention, et seulement à ce qui voulait avancer :
 * terminer, ou appeler un humain, ne consomme pas de budget et ne se reporte pas. Un run qui
 * attend un accord ne doit surtout pas se voir attribuer une échéance de repli — il repartirait
 * sans réponse.
 */
export function deciderLaSuite(entree: EntreeSuiteDuRun): SuiteDuRun {
  const intention = intentionDuPas(entree.issue);

  if ("kind" in intention) return intention;

  const { pasMaximumParRun, cadenceEntreRunsHeures, delaiApresEchecTransitoireMinutes } =
    entree.reglages;
  const pasRestants = Math.max(0, pasMaximumParRun - entree.etat.pasDuCycle);

  // ── Le report de quota passe AVANT le budget de pas : il ne dépend pas de ce qui reste à
  //    faire aujourd'hui, mais de ce que le plafond autorise. Les deux mènent à la même
  //    échéance ; les confondre ferait disparaître la raison réelle du journal.
  if (intention.avancer === "a_la_cadence") {
    return {
      kind: "reporter",
      motif: "report_de_quota",
      quand: new Date(entree.maintenant.getTime() + cadenceEntreRunsHeures * MS_PAR_HEURE),
      // Le cycle est terminé pour aujourd'hui : le budget de pas se rouvre avec lui.
      nature: RUN_REPORTE,
      detail: intention.detail,
      messageClient: intention.messageClient,
    };
  }

  if (pasRestants === 0) {
    // Le budget prime sur la nouvelle tentative : retenter dans un quart d'heure un pas qui n'a
    // plus le droit de s'exécuter aujourd'hui ne ferait que réveiller le worker pour rien.
    return {
      kind: "reporter",
      motif: "budget_epuise",
      quand: new Date(entree.maintenant.getTime() + cadenceEntreRunsHeures * MS_PAR_HEURE),
      nature: RUN_REPORTE,
      detail:
        `${entree.etat.pasDuCycle} pas effectués sur ${pasMaximumParRun} : le cycle se referme, ` +
        "le travail reprend au suivant.",
    };
  }

  if (intention.avancer === "apres_delai") {
    return {
      kind: "reporter",
      motif: "nouvelle_tentative",
      quand: new Date(entree.maintenant.getTime() + delaiApresEchecTransitoireMinutes * MS_PAR_MINUTE),
      nature: PAS_REPORTE,
      detail: intention.detail,
    };
  }

  return {
    kind: "poursuivre",
    motif: "pas_suivant",
    quand: entree.maintenant,
    pasRestants,
    nature: null,
    detail: `${pasRestants} pas encore disponibles dans ce cycle.`,
  };
}

/**
 * Traduit une erreur remontée par un pas en issue exploitable — **et rien d'autre**.
 *
 * Seul `TaskDeferred` a une suite définie : un plafond atteint est un report, pas une panne.
 * Toute autre erreur rend `null` et **doit** être relancée par l'appelant. Avaler ici les erreurs
 * de fournisseur, les routages non conformes ou les bugs les transformerait en « le modèle n'a
 * rien proposé » — exactement ce que `decideNextAction` refuse de faire en amont.
 */
export function issueDepuisErreur(erreur: unknown): IssueDuPas | null {
  if (erreur instanceof TaskDeferred) {
    return {
      kind: "report_de_quota",
      clientMessage: erreur.clientMessage,
      detail: erreur.reason,
    };
  }
  return null;
}

/**
 * La suite exige-t-elle qu'une personne intervienne ?
 *
 * Lecture unique, pour que la question ne soit pas posée de trois façons différentes — et pour
 * que `EXEC-14` n'ait pas à reproduire le raisonnement pour savoir quand notifier. C'est aussi la
 * réponse à la décision produit « on ne notifie pas après chaque run » : la seule notification de
 * travail qui parte d'ici est celle d'un employé bloqué.
 */
export function exigeUnHumain(suite: SuiteDuRun): boolean {
  return suite.kind === "attendre_humain";
}
