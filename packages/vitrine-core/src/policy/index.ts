// ════════════════════════════════════════════════════════════════════
// Policy Engine — implémentation réelle (archi §3e, §7).
//
// Jusqu'ici la démo utilisait allowAllPolicy (tout est permis). Ce n'est
// pas de l'autonomie, c'est un script sans garde-fou. Ce module lit le
// VRAI curseur d'autonomie de l'agent_instance (colonne `autonomy`,
// migration 0001) et décide, par classe d'effet, si l'action est
// automatique, notifiée, ou doit attendre une validation humaine.
//
// Le modèle ne s'auto-autorise jamais : cette décision est prise ici,
// en dehors de tout contrôle du LLM, avant que l'outil ne s'exécute.
// ════════════════════════════════════════════════════════════════════

import type { EffectClass, PolicyDecision, Tool, ToolContext } from "../tools/index.js";

export type { EffectClass };

/** Ce que peut valoir l'autonomie pour UNE classe d'effet, en base
 *  (agent_instance.autonomy est un JSON: {"read":"auto",...}).
 *
 *  "confirm"      → validation demandée à CHAQUE action de cette classe
 *  "confirm_once" → validation demandée la PREMIÈRE fois seulement ;
 *                   une fois accordée (table standing_approval), l'agent
 *                   agit seul. Révocable en supprimant la validation.
 */
export type AutonomySetting = "auto" | "notify" | "confirm" | "confirm_once" | "deny";

export type AutonomyConfig = Record<EffectClass, AutonomySetting>;

/** Autonomie par défaut si l'agent_instance n'en définit pas (prudence
 *  par défaut, archi §2 principe 5 : humain dans la boucle par défaut). */
export const DEFAULT_AUTONOMY: AutonomyConfig = {
  read: "auto",
  write: "notify",
  irreversible: "confirm",
};

/** Résout la config d'autonomie d'une instance d'agent depuis la DB. */
export interface AutonomyResolver {
  resolve(agentInstanceId: string): Promise<AutonomyConfig>;
}

/** Consulte les validations permanentes déjà accordées (table
 *  standing_approval) pour le mode "confirm_once". */
export interface StandingApprovalStore {
  hasApproval(agentInstanceId: string, effect: EffectClass): Promise<boolean>;
  grant(params: {
    tenantId: string;
    agentInstanceId: string;
    effect: EffectClass;
    grantedBy?: string;
    firstTaskId?: string;
  }): Promise<void>;
  /** Révocation : l'agent redemandera la prochaine fois. */
  revoke(agentInstanceId: string, effect: EffectClass): Promise<void>;
}

/** "notify" se comporte comme "auto" pour l'exécution (on ne bloque
 *  pas), mais le Runtime doit journaliser un événement dédié pour que
 *  l'humain soit informé après coup — voir AgentRuntime (à câbler). */
function toDecision(setting: AutonomySetting): PolicyDecision {
  switch (setting) {
    case "auto":
    case "notify":
      return "allow";
    case "confirm":
    case "confirm_once": // résolu en amont via standing_approval
      return "require_human";
    case "deny":
      return "deny";
  }
}

export class AutonomyPolicyEngine {
  constructor(
    private readonly autonomy: AutonomyResolver,
    /** Optionnel : sans lui, "confirm_once" se comporte comme "confirm"
     *  (prudent par défaut — jamais l'inverse). */
    private readonly approvals?: StandingApprovalStore
  ) {}

  async check(tool: Tool, ctx: ToolContext): Promise<PolicyDecision> {
    const config = await this.autonomy.resolve(ctx.agentInstanceId);
    const setting = config[tool.effect] ?? DEFAULT_AUTONOMY[tool.effect];

    // Mode "valider une fois puis auto" : si la validation permanente a
    // déjà été accordée pour cette classe d'action, on laisse passer.
    if (setting === "confirm_once" && this.approvals) {
      const granted = await this.approvals.hasApproval(ctx.agentInstanceId, tool.effect);
      if (granted) return "allow";
    }

    return toDecision(setting);
  }
}
