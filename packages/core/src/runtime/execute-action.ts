/**
 * EXEC-06 — la frontière entre une décision et un effet réel.
 *
 * C'est le seul endroit du produit où quelque chose sort dans le monde. Tout ce qui précède
 * décide ; ici, on agit — et ce qui est fait ne se défait pas.
 *
 *     le modèle propose → le Policy Engine décide → ICI le moteur exécute → le journal enregistre
 *
 * ══ LE PROTOCOLE EN DEUX TEMPS, ET POURQUOI CET ORDRE ══
 *
 *   1. **Engager** — écrire `action_engagee` avec la clé d'idempotence, et le COMMITTER, avant
 *      le moindre effet.
 *   2. **Exécuter** — appeler le moteur.
 *   3. **Enregistrer** — écrire le résultat, ou l'échec.
 *
 * L'ordre n'est pas négociable. Il garantit qu'**il ne peut jamais exister d'effet sans trace** :
 * au pire une trace sans effet, ce qui se rattrape ; jamais l'inverse, qui ne se rattrape pas.
 * L'inverse — exécuter puis journaliser — laisserait, à chaque interruption, un email parti dont
 * le système ignore tout, et qu'il renverrait au battement suivant.
 *
 * ══ CE QUE DEVIENT CHAQUE INTERRUPTION ══
 *
 * | Le worker meurt… | Ce que voit le battement suivant | Ce qu'il fait |
 * |---|---|---|
 * | avant l'engagement | rien | il recommence, sans risque |
 * | après l'engagement, avant l'effet | engagé, sans résultat | **il ne rejoue pas un effet irréversible** |
 * | pendant l'effet | engagé, sans résultat | idem |
 * | après l'effet, avant l'enregistrement | engagé, sans résultat | idem |
 * | après l'enregistrement | résultat présent | il passe à la suite |
 *
 * Les trois lignes du milieu sont **le même état**, et c'est voulu : de l'extérieur, on ne peut
 * pas les distinguer. Le système ne prétend donc pas savoir si l'effet a eu lieu — il refuse de
 * parier. Pour un effet irréversible, l'incertitude arrête le run et appelle un humain. Pour une
 * lecture, rejouer ne coûte rien : le rejeu est autorisé, et borné.
 *
 * ══ L'UNICITÉ N'EST PAS UN `if` ══
 *
 * L'engagement s'appuie sur `unique (tenant_id, idempotency_key)` de `execution_event`. Deux
 * workers qui décident simultanément d'écrire au même prospect franchissent tous les deux
 * n'importe quel test applicatif ; un seul obtient la ligne. C'est la base qui tranche, et elle
 * seule le peut.
 *
 * Réalise : EXEC-06
 */

import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

import type { CapabilityRegistry } from "../capability/registry.js";
import { CapabilityUnavailable } from "../errors.js";
import { ACTION_ECHOUEE, ACTION_EXECUTEE } from "../journal/vocabulaire.js";
import { assertIdempotent, idempotencyKeyFor } from "../idempotency.js";
import type { EffectClass } from "../policy/engine.js";
import type { ActionProposee, DecisionPas } from "./next-action.js";

/**
 * L'état d'un effet, du point de vue du journal. Trois valeurs, pas deux : « on ne sait pas »
 * est un état à part entière, et le confondre avec « pas fait » est exactement ce qui produit
 * un doublon.
 */
export type EtatEffet =
  | { readonly kind: "jamais_engage" }
  | { readonly kind: "engage_sans_resultat"; readonly tentatives: number }
  | { readonly kind: "deja_execute"; readonly resultat: unknown };

/**
 * Le port d'écriture des effets. Implémenté sur Postgres par `apps/worker` — le noyau ne connaît
 * ni base ni transaction.
 */
export interface EffectLedger {
  /** L'état de cet effet, tel que le journal le connaît. */
  statusOf(tenantId: TenantId, idempotencyKey: string): Promise<EtatEffet>;

  /**
   * Réserve l'effet, de façon atomique.
   *
   * Rend `false` si un autre l'a déjà engagé — y compris un worker concurrent qui vient de
   * gagner la course. L'implémentation DOIT s'appuyer sur la contrainte d'unicité de la base, et
   * jamais sur une lecture suivie d'une écriture : entre les deux, un autre passe.
   */
  reserve(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    capabilityKey: string;
    idempotencyKey: string;
  }): Promise<boolean>;

  /** Enregistre le résultat, ou l'échec. Ne porte jamais la clé en propre : elle est sur
   *  l'engagement, et l'unicité refuserait la seconde ligne. */
  record(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    kind: typeof ACTION_EXECUTEE | typeof ACTION_ECHOUEE;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Nombre de tentatives sur une même clé, au-delà duquel on arrête.
 *
 * Une erreur qui se répète n'est plus transitoire, quoi qu'en dise son type : sans cette borne,
 * un fournisseur qui répond « réessayez » indéfiniment produirait une boucle qui consomme du
 * quota sans jamais aboutir.
 */
export const MAX_TENTATIVES = 3;

export type ResultatExecution =
  | { readonly kind: "execute"; readonly resultat: unknown; readonly cle: string }
  /** L'effet avait déjà eu lieu : le résultat vient du journal, aucun nouvel effet. */
  | { readonly kind: "deja_fait"; readonly resultat: unknown; readonly cle: string }
  /** Échec transitoire : le pas suivant a le droit de réessayer. */
  | { readonly kind: "echec_transitoire"; readonly detail: string; readonly tentatives: number }
  /** Échec définitif, ou trop de tentatives : on n'y revient pas. */
  | { readonly kind: "echec_definitif"; readonly detail: string }
  /**
   * Un effet irréversible a été engagé et l'issue est inconnue. **Rien n'est rejoué.** Un humain
   * doit constater ce qui s'est passé dans le monde réel.
   */
  | { readonly kind: "verification_humaine_requise"; readonly cle: string; readonly detail: string }
  /** La décision n'autorisait pas d'agir. Aucun moteur n'a été approché. */
  | { readonly kind: "non_autorise"; readonly detail: string };

export interface ExecuteDeps {
  readonly registry: CapabilityRegistry;
  readonly ledger: EffectLedger;
  /** Résout le moteur de la capacité pour cette entreprise (formule, liaisons). */
  readonly engineFor: (capabilityKey: string) => Promise<{ execute: (input: unknown) => Promise<unknown> }>;
}

export interface ExecuteInput {
  readonly tenantId: TenantId;
  readonly taskId: TaskId;
  readonly employeeId: EmployeeId;
  /** La décision rendue par EXEC-04/05. Seul `agir` ouvre la porte. */
  readonly decision: DecisionPas;
}

/** Une erreur transitoire porte ce marqueur ; tout le reste est définitif. Le moteur en décide,
 *  pas ce module : lui seul sait si son service peut être réessayé. */
export class EffetTransitoire extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EffetTransitoire";
  }
}

/**
 * Exécute l'action **précisément autorisée**, une fois et une seule.
 *
 * ⚠️ Le premier contrôle n'est pas une formalité : tout ce qui n'est pas `agir` sort d'ici sans
 * qu'aucun moteur ait été approché. Il n'existe pas de chemin « pour voir », pas de repli, pas
 * d'exécution directe depuis une proposition de modèle.
 */
export async function executeDecidedAction(
  deps: ExecuteDeps,
  input: ExecuteInput,
): Promise<ResultatExecution> {
  if (input.decision.kind !== "agir") {
    return {
      kind: "non_autorise",
      detail:
        `La décision est « ${input.decision.kind} » : aucune capacité n'est appelée. ` +
        "Seul « agir » produit un effet.",
    };
  }

  const proposition: ActionProposee = input.decision.proposition;

  // La classe d'effet vient du CONTRAT, comme au moment de la décision. La relire ici n'est pas
  // une redondance : c'est ce qui garantit qu'aucune capacité n'a changé de nature entre les deux.
  let effectClass: EffectClass;
  try {
    effectClass = deps.registry.contract(proposition.capabilityKey).effectClass;
  } catch (error) {
    if (error instanceof CapabilityUnavailable) {
      return { kind: "non_autorise", detail: error.message };
    }
    throw error;
  }

  const cle = idempotencyKeyFor({
    tenantId: input.tenantId,
    capabilityKey: proposition.capabilityKey,
    effect: proposition.input,
  });
  // Attrape l'oubli avant l'appel, là où l'erreur est encore lisible.
  assertIdempotent(effectClass, cle, proposition.capabilityKey);

  const irreversible = effectClass === "external_irreversible";
  const etat = await deps.ledger.statusOf(input.tenantId, cle);

  if (etat.kind === "deja_execute") {
    return { kind: "deja_fait", resultat: etat.resultat, cle };
  }

  if (etat.kind === "engage_sans_resultat") {
    if (irreversible) {
      // On ne sait pas si le message est parti. Le renvoyer « au cas où » est le seul geste
      // vraiment irrattrapable ; ne rien faire ne l'est pas.
      return {
        kind: "verification_humaine_requise",
        cle,
        detail:
          `L'action « ${proposition.capabilityKey} » a été engagée sans que son issue soit connue. ` +
          "Elle n'est pas rejouée : son effet est irréversible et pourrait avoir déjà eu lieu.",
      };
    }
    if (etat.tentatives >= MAX_TENTATIVES) {
      return {
        kind: "echec_definitif",
        detail: `Abandon après ${etat.tentatives} tentatives sur « ${proposition.capabilityKey} ».`,
      };
    }
    // Effet rejouable : on repasse, sans réserver de nouveau (la clé est déjà posée).
    return exécuter(deps, input, proposition, cle, etat.tentatives + 1);
  }

  // ── L'engagement. C'est la base qui tranche la course, pas ce code.
  const gagne = await deps.ledger.reserve({
    tenantId: input.tenantId,
    taskId: input.taskId,
    employeeId: input.employeeId,
    capabilityKey: proposition.capabilityKey,
    idempotencyKey: cle,
  });

  if (!gagne) {
    // Un autre worker a engagé le même effet entre notre lecture et notre écriture. On relit
    // plutôt que de supposer : il a peut-être déjà terminé.
    const apres = await deps.ledger.statusOf(input.tenantId, cle);
    if (apres.kind === "deja_execute") {
      return { kind: "deja_fait", resultat: apres.resultat, cle };
    }
    return {
      kind: "verification_humaine_requise",
      cle,
      detail:
        `L'action « ${proposition.capabilityKey} » est déjà engagée ailleurs. Elle n'est pas ` +
        "exécutée une seconde fois.",
    };
  }

  return exécuter(deps, input, proposition, cle, 1);
}

async function exécuter(
  deps: ExecuteDeps,
  input: ExecuteInput,
  proposition: ActionProposee,
  cle: string,
  tentative: number,
): Promise<ResultatExecution> {
  let moteur;
  try {
    moteur = await deps.engineFor(proposition.capabilityKey);
  } catch (error) {
    await deps.ledger.record({
      tenantId: input.tenantId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      kind: ACTION_ECHOUEE,
      idempotencyKey: cle,
      payload: { cle, capacite: proposition.capabilityKey, definitif: true, detail: String(error) },
    });
    return { kind: "echec_definitif", detail: String(error) };
  }

  try {
    const resultat = await moteur.execute(proposition.input);

    await deps.ledger.record({
      tenantId: input.tenantId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      kind: ACTION_EXECUTEE,
      idempotencyKey: cle,
      payload: { cle, capacite: proposition.capabilityKey, resultat, tentative },
    });

    return { kind: "execute", resultat, cle };
  } catch (error) {
    const transitoire = error instanceof EffetTransitoire;
    const epuise = tentative >= MAX_TENTATIVES;

    await deps.ledger.record({
      tenantId: input.tenantId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      kind: ACTION_ECHOUEE,
      idempotencyKey: cle,
      payload: {
        cle,
        capacite: proposition.capabilityKey,
        definitif: !transitoire || epuise,
        tentative,
        detail: String(error),
      },
    });

    if (!transitoire) return { kind: "echec_definitif", detail: String(error) };
    if (epuise) {
      return {
        kind: "echec_definitif",
        detail: `Abandon après ${tentative} tentatives : ${String(error)}`,
      };
    }
    return { kind: "echec_transitoire", detail: String(error), tentatives: tentative };
  }
}
