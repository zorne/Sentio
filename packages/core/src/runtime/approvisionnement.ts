/**
 * EXEC-17 — d'où vient le travail : l'approvisionnement en nouvelles missions.
 *
 * ══ CE QU'IL FAUT COMPRENDRE AVANT DE LIRE UNE LIGNE ══
 *
 * L'approvisionnement **ne crée pas le travail du jour**. Les missions déjà ouvertes se
 * réveillent toutes seules : `run_reporte` leur repose une échéance à la cadence (EXEC-08). Ce
 * module n'a qu'un seul travail — **ouvrir du neuf** —, et c'est ce qui le rend petit.
 *
 *     objectif actif + sujets éligibles + quotas → au plus N nouvelles missions, une fois par jour
 *
 * ══ POURQUOI AUCUN MODÈLE N'INTERVIENT ICI ══
 *
 * Décider **combien** de travail créer est une décision de cadencement bornée par des quotas
 * payants, pas un jugement métier. Un modèle qui en déciderait pourrait, sur une hallucination ou
 * une consigne injectée, ouvrir mille missions — c'est-à-dire écrire à mille vraies entreprises
 * au nom d'un vrai client. Le modèle décide **comment** traiter une mission, à l'intérieur du
 * run ; il ne décide jamais qu'il y en ait une de plus.
 *
 * ══ CE QUE CE MODULE NE FAIT PAS ══
 *
 * Il ne lit rien, n'écrit rien, ne connaît ni base ni horloge. **Fonction pure.** Les six raisons
 * de refus lui sont **rendues par la base** (`peut_ouvrir_une_mission`), qui seule peut les
 * établir sans course : les recalculer ici en TypeScript reviendrait à tenir deux vérités pour un
 * même quota, et un jour deux réponses différentes.
 *
 * ══ GÉNÉRALISTE PAR CONSTRUCTION ══
 *
 * Un sujet est un couple `(nature, identifiant)`. Rien ici ne connaît le mot « prospect » : le
 * métier Commercial fournit des sujets `lead`, un métier futur en fournira d'autres, et ce module
 * ne changera pas. C'est le `GisementDeMissions` — un port, résolu par métier — qui sait où les
 * chercher.
 *
 * Réalise : EXEC-17
 */

import type { ReglagesRuntime } from "@sentio/config";

/**
 * Le sujet d'une mission : ce sur quoi elle porte.
 *
 * `kind` n'est jamais mis en correspondance avec une table par le domaine — c'est une étiquette,
 * pas un pointeur. C'est ce qui permet d'accueillir un métier futur sans migration ni refonte.
 */
export interface SujetDeMission {
  readonly kind: string;
  readonly id: string;
}

/**
 * Pourquoi aucune mission n'est ouverte. Chaque cas a son nom — « rien ne s'est passé » est
 * indistinguable d'une panne, pour le client comme pour nous.
 *
 * Les sept premiers viennent de `peut_ouvrir_une_mission()` en base. Le dernier est le seul que
 * ce module établit lui-même, parce qu'il dépend du gisement et non d'une règle.
 */
export type RefusDApprovisionnement =
  | "employe_inconnu"
  | "pas_d_abonnement_actif"
  | "aucun_objectif"
  | "objectif_atteint"
  | "objectif_retire"
  | "deja_approvisionne_aujourdhui"
  | "quota_de_periode_atteint"
  | "aucun_sujet_eligible"
  /** La base a rendu un verdict que ce module ne connaît pas. Jamais interprété « au mieux ». */
  | "verdict_inconnu";

export type PlanDApprovisionnement =
  | {
      readonly kind: "ouvrir";
      /** Les sujets retenus, dans l'ordre rendu par le gisement. Jamais réordonnés ici. */
      readonly sujets: readonly SujetDeMission[];
      /** Ce qui a borné le lot — pour que « pourquoi seulement trois ? » ait une réponse. */
      readonly borne: "plafond_du_jour" | "quota_de_periode" | "sujets_disponibles";
    }
  | {
      readonly kind: "rien";
      readonly raison: RefusDApprovisionnement;
      readonly detail: string;
      /**
       * Faut-il inscrire ce refus comme le lot du jour ?
       *
       * `true` pour les refus **métier** : la journée de cet employé est réglée, on n'y revient
       * pas à chaque battement. `false` pour ce qui n'est pas une réponse — un employé introuvable
       * ou un verdict inconnu sont des anomalies, et les inscrire les tairait pendant 24 h. `false`
       * aussi quand le lot existe déjà : il n'y a rien à réécrire.
       */
      readonly bloqueLaJournee: boolean;
    };

export interface EntreeApprovisionnement {
  /** Le verdict de `peut_ouvrir_une_mission()`, tel quel. Jamais recalculé ici. */
  readonly verdict: string;
  /** Les sujets candidats, déjà ordonnés et déjà filtrés par le gisement. */
  readonly sujetsEligibles: readonly SujetDeMission[];
  /**
   * Missions encore autorisées par la formule sur la période. `null` = aucun plafond défini pour
   * cette métrique, ce qui n'est **pas** la même chose que zéro.
   */
  readonly restantDePeriode: number | null;
  readonly reglages: ReglagesRuntime;
}

/** Les verdicts de refus que la base sait rendre. Fermée : ce qui n'y est pas n'est pas deviné. */
const REFUS_CONNUS: ReadonlySet<string> = new Set<RefusDApprovisionnement>([
  "employe_inconnu",
  "pas_d_abonnement_actif",
  "aucun_objectif",
  "objectif_atteint",
  "objectif_retire",
  "deja_approvisionne_aujourdhui",
  "quota_de_periode_atteint",
]);

/** Ce qu'un humain lit quand il demande pourquoi son employé n'a rien ouvert aujourd'hui. */
const EXPLICATIONS: Record<RefusDApprovisionnement, string> = {
  employe_inconnu: "Cet employé n'appartient pas à cette entreprise.",
  pas_d_abonnement_actif: "Aucun abonnement actif : aucun travail n'est ouvert.",
  aucun_objectif: "Aucun objectif déclaré : un employé lancé sans but travaille pour personne.",
  objectif_atteint: "L'objectif est atteint : plus aucune mission nouvelle n'est ouverte.",
  objectif_retire: "L'objectif a été retiré par le client.",
  deja_approvisionne_aujourdhui: "Le travail du jour a déjà été ouvert pour cet employé.",
  quota_de_periode_atteint: "Le nombre de missions autorisées sur la période est atteint.",
  aucun_sujet_eligible: "Aucun sujet éligible : il n'y a rien de nouveau à prendre en charge.",
  verdict_inconnu: "La base a rendu un verdict inconnu : rien n'est ouvert par précaution.",
};

/**
 * Les refus qui règlent la journée de cet employé.
 *
 * Les trois absents ne s'y trouvent pas par oubli : `deja_approvisionne_aujourdhui` est déjà
 * inscrit, et `employe_inconnu` / `verdict_inconnu` sont des anomalies — les inscrire les tairait
 * jusqu'au lendemain, c'est-à-dire exactement le temps qu'il faut pour ne pas les voir.
 */
const REFUS_QUI_REGLENT_LA_JOURNEE: ReadonlySet<RefusDApprovisionnement> = new Set([
  "pas_d_abonnement_actif",
  "aucun_objectif",
  "objectif_atteint",
  "objectif_retire",
  "quota_de_periode_atteint",
  "aucun_sujet_eligible",
]);

function rien(raison: RefusDApprovisionnement, detail?: string): PlanDApprovisionnement {
  return {
    kind: "rien",
    raison,
    detail: detail ?? EXPLICATIONS[raison],
    bloqueLaJournee: REFUS_QUI_REGLENT_LA_JOURNEE.has(raison),
  };
}

/**
 * Décide combien de nouvelles missions ouvrir, et lesquelles.
 *
 * **Fonction pure et totale.** Un verdict inconnu ne fait pas exception : il rend `rien`, parce
 * qu'un verdict qu'on ne comprend pas ne peut pas être lu comme une autorisation. C'est la même
 * règle que le vocabulaire fermé du journal (EXEC-02) — ce qui n'est pas connu n'est pas ignoré.
 */
export function planifierLApprovisionnement(
  entree: EntreeApprovisionnement,
): PlanDApprovisionnement {
  if (entree.verdict !== "ok") {
    if (!REFUS_CONNUS.has(entree.verdict)) {
      return rien("verdict_inconnu", `${EXPLICATIONS.verdict_inconnu} (« ${entree.verdict} »)`);
    }
    return rien(entree.verdict as RefusDApprovisionnement);
  }

  if (entree.sujetsEligibles.length === 0) return rien("aucun_sujet_eligible");

  // ── Trois bornes, et la plus basse gagne. `null` sur le quota de période veut dire « aucun
  //    plafond défini », pas « zéro » : les confondre arrêterait un client dont la formule n'a
  //    simplement pas encore cette métrique.
  const plafondDuJour = entree.reglages.missionsMaxParJour;
  const quota = entree.restantDePeriode ?? Number.POSITIVE_INFINITY;
  const disponibles = entree.sujetsEligibles.length;
  const combien = Math.min(plafondDuJour, quota, disponibles);

  if (combien <= 0) {
    // Seul le quota peut valoir zéro ici : le plafond du jour est un entier strictement positif
    // (la configuration le refuse autrement) et les sujets viennent d'être comptés non vides.
    return rien("quota_de_periode_atteint");
  }

  const borne =
    combien === disponibles
      ? ("sujets_disponibles" as const)
      : combien === plafondDuJour
        ? ("plafond_du_jour" as const)
        : ("quota_de_periode" as const);

  return { kind: "ouvrir", sujets: entree.sujetsEligibles.slice(0, combien), borne };
}

/** Le motif écrit dans le lot du jour. Une phrase, lisible des mois plus tard sans contexte. */
export function motifDuLot(plan: PlanDApprovisionnement): string {
  if (plan.kind === "rien") return plan.detail;
  const bornes: Record<Extract<PlanDApprovisionnement, { kind: "ouvrir" }>["borne"], string> = {
    plafond_du_jour: "plafond du jour atteint",
    quota_de_periode: "quota de la formule atteint",
    sujets_disponibles: "tous les sujets éligibles ont été pris",
  };
  return `${plan.sujets.length} mission(s) ouverte(s) — ${bornes[plan.borne]}.`;
}
