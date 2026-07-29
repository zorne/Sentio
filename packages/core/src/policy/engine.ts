/**
 * NOYAU-09 à 12 — le Policy Engine : autorise, suspend, ou refuse. Rien ne s'exécute sans lui.
 *
 * **Le modèle propose, la politique dispose.** C'est cette séparation qui fait qu'une injection
 * réussie dans un email entrant ne se transforme pas en action réelle
 * (`docs/10-securite-rgpd.md`).
 *
 * C'est aussi, juridiquement, le **droit d'intervention humaine** sur une décision automatisée.
 * Il n'est pas seulement codé : il est documenté comme tel.
 */

import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

import type { ApprovalStore, JournalWriter } from "../ports.js";

/**
 * La classe d'effet d'une action — ce qu'elle change, et si on peut revenir en arrière.
 * Elle est déclarée par le **contrat** de la capacité, jamais devinée à l'exécution.
 */
export type EffectClass = "read" | "internal_write" | "external_irreversible";

/** Les quatre niveaux d'autonomie, choisis par le client (`docs/05-runtime-employe.md`). */
export type AutonomyLevel = "auto" | "notify" | "confirm" | "confirm_once";

export interface PolicyRequest {
  readonly tenantId: TenantId;
  readonly taskId: TaskId;
  readonly employeeId: EmployeeId;
  readonly capabilityKey: string;
  readonly effectClass: EffectClass;
  readonly autonomy: AutonomyLevel;
}

export type PolicyDecision =
  | { readonly outcome: "allow"; readonly notify: boolean }
  | { readonly outcome: "suspend"; readonly approvalId: string; readonly clientMessage: string }
  | { readonly outcome: "refuse"; readonly reason: string };

/**
 * Message de demande d'accord, visible par le client : soumis au lexique
 * (`docs/17-lexique.md`), vérifié par un test.
 */
export const APPROVAL_REQUEST_MESSAGE =
  "Votre employé attend votre accord avant d'agir à l'extérieur de votre entreprise.";

export class PolicyEngine {
  constructor(
    private readonly approvals: ApprovalStore,
    private readonly journal: JournalWriter,
  ) {}

  /**
   * ⚠️ **Règle non négociable** (`AGENTS.md`, invariant 6) : une action à effet extérieur
   * irréversible n'est **jamais** automatique par défaut, quel que soit le niveau d'autonomie
   * choisi par le client. Choisir `auto` ne désactive donc pas la confirmation sur
   * l'irréversible : cela ne l'enlève que sur les lectures et les écritures internes.
   *
   * L'accord ne se donne qu'une fois si le client le veut (`confirmer une fois`), et il se
   * révoque à tout moment — la révocation ramène immédiatement à la suspension.
   */
  async decide(request: PolicyRequest): Promise<PolicyDecision> {
    if (request.effectClass === "read" || request.effectClass === "internal_write") {
      const decision: PolicyDecision = {
        outcome: "allow",
        notify: request.autonomy === "notify",
      };
      await this.trace(request, decision);
      return decision;
    }

    // À partir d'ici : effet extérieur irréversible.
    if (request.autonomy === "confirm") {
      // Le client a demandé à confirmer chaque fois : un accord permanent ne s'y substitue pas.
      const decision = await this.suspend(request);
      await this.trace(request, decision);
      return decision;
    }

    const standing = await this.approvals.hasStandingApproval(
      request.tenantId,
      request.employeeId,
      request.effectClass,
    );

    const decision: PolicyDecision = standing
      ? { outcome: "allow", notify: request.autonomy === "notify" }
      : await this.suspend(request);

    await this.trace(request, decision);
    return decision;
  }

  /**
   * Refus hors périmètre — le verrou de métier (`TEST-02`), **journalisé**.
   *
   * ⚠️ Cette méthode existe parce que la fonction pure ci-dessous ne suffisait pas : elle rendait
   * une décision sans laisser de trace, et l'appelant pouvait l'oublier. Or `TEST-02` n'exige pas
   * seulement que l'employé refuse : il exige que **le refus soit tracé**. Un refus non tracé est
   * indistinguable d'une panne, pour le client comme pour nous.
   */
  async refuse(request: PolicyRequest, allowed: readonly string[]): Promise<PolicyDecision> {
    const decision = refuseOutOfScope(request.capabilityKey, allowed);
    await this.trace(request, decision);
    return decision;
  }

  private async suspend(request: PolicyRequest): Promise<PolicyDecision> {
    const approvalId = await this.approvals.requestApproval({
      tenantId: request.tenantId,
      taskId: request.taskId,
      employeeId: request.employeeId,
      effectClass: request.effectClass,
    });
    return { outcome: "suspend", approvalId, clientMessage: APPROVAL_REQUEST_MESSAGE };
  }

  /**
   * Toute décision est journalisée, y compris — surtout — les refus et les suspensions.
   * `TEST-02` exige que le refus d'un employé soit tracé : un refus non tracé est
   * indistinguable d'une panne, pour le client comme pour nous.
   */
  private async trace(request: PolicyRequest, decision: PolicyDecision): Promise<void> {
    await this.journal.append({
      tenantId: request.tenantId,
      taskId: request.taskId,
      employeeId: request.employeeId,
      kind: `politique_${decision.outcome}`,
      payload: {
        capacite: request.capabilityKey,
        classe_effet: request.effectClass,
        autonomie: request.autonomy,
      },
    });
  }
}

/**
 * La décision de refus, à l'état pur — sans journal, pour être testable seule.
 *
 * Le refus est **une décision de politique**, pas une consigne de rédaction adressée au modèle :
 * une règle de prompt se contourne, une politique non. En production, passer par
 * `PolicyEngine.refuse()`, qui journalise.
 */
export function refuseOutOfScope(capabilityKey: string, allowed: readonly string[]): PolicyDecision {
  return {
    outcome: "refuse",
    reason:
      `La capacité « ${capabilityKey} » sort du périmètre de ce métier ` +
      `(autorisées : ${allowed.join(", ")}).`,
  };
}
