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

/** Ce que peut valoir l'autonomie pour UNE classe d'effet, en base
 *  (agent_instance.autonomy est un JSON: {"read":"auto",...}). */
export type AutonomySetting = "auto" | "notify" | "confirm" | "deny";

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

/** "notify" se comporte comme "auto" pour l'exécution (on ne bloque
 *  pas), mais le Runtime doit journaliser un événement dédié pour que
 *  l'humain soit informé après coup — voir AgentRuntime (à câbler). */
function toDecision(setting: AutonomySetting): PolicyDecision {
  switch (setting) {
    case "auto":
    case "notify":
      return "allow";
    case "confirm":
      return "require_human";
    case "deny":
      return "deny";
  }
}

export class AutonomyPolicyEngine {
  constructor(private readonly autonomy: AutonomyResolver) {}

  async check(tool: Tool, ctx: ToolContext): Promise<PolicyDecision> {
    const config = await this.autonomy.resolve(ctx.agentInstanceId);
    const setting = config[tool.effect] ?? DEFAULT_AUTONOMY[tool.effect];
    return toDecision(setting);
  }
}
