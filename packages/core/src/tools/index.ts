// ════════════════════════════════════════════════════════════════════
// Tool Registry & Executor — contrat d'outil déclaratif (archi §3c, §6).
//
// Un outil = une déclaration (nom, schéma, classe d'effet) + une
// implémentation. Ajouter un outil ne touche JAMAIS le runtime.
// La classe d'effet alimente le curseur d'autonomie (archi §7) :
//   read         → auto par défaut
//   write        → auto ou notification
//   irreversible → validation humaine par défaut
// ════════════════════════════════════════════════════════════════════

/** Classe d'effet de bord. Déclarée par l'outil, jamais devinée. */
export type EffectClass = "read" | "write" | "irreversible";

/** Ce que le Policy Engine décide pour un appel d'outil donné. */
export type PolicyDecision = "allow" | "require_human" | "deny";

export interface ToolContext {
  tenantId: string;
  agentInstanceId: string;
  taskId: string;
}

/** Déclaration + implémentation d'un outil. */
export interface Tool {
  /** Clé unique, ex. "crm.search_leads", "mail.send". */
  readonly key: string;
  readonly description: string;
  /** Schéma JSON des entrées — exposé au modèle via le gateway. */
  readonly inputSchema: Record<string, unknown>;
  readonly effect: EffectClass;
  execute(input: unknown, ctx: ToolContext): Promise<unknown>;
}

/** Point de passage obligé avant tout effet de bord (archi §3e).
 *  L'implémentation lit l'autonomie de l'agent_instance (DB) ;
 *  ici on ne définit que le contrat. Le modèle ne s'auto-autorise jamais. */
export interface PolicyEngine {
  check(tool: Tool, ctx: ToolContext): Promise<PolicyDecision>;
}

/** Journalisation des appels — branchée sur l'Execution Store. */
export interface ToolAuditSink {
  onCall(tool: Tool, input: unknown, ctx: ToolContext): Promise<void>;
  onResult(tool: Tool, result: unknown, ctx: ToolContext): Promise<void>;
  onError(tool: Tool, error: Error, ctx: ToolContext): Promise<void>;
}

export class ToolError extends Error {}
/** Levée quand la politique exige une validation humaine : le runtime
 *  suspend alors la Task en 'waiting_human' au lieu d'exécuter. */
export class HumanApprovalRequired extends Error {
  constructor(public readonly tool: string) {
    super(`Validation humaine requise pour l'outil: ${tool}`);
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): this {
    if (this.tools.has(tool.key)) throw new ToolError(`Outil déjà enregistré: ${tool.key}`);
    this.tools.set(tool.key, tool);
    return this;
  }

  get(key: string): Tool | undefined {
    return this.tools.get(key);
  }

  /** Sous-ensemble autorisé pour un agent (liste venant de sa config DB). */
  forAgent(allowedKeys: string[]): Tool[] {
    return allowedKeys.flatMap((k) => this.tools.get(k) ?? []);
  }
}

export class ToolExecutor {
  constructor(
    private readonly policy: PolicyEngine,
    private readonly audit: ToolAuditSink
  ) {}

  async execute(tool: Tool, input: unknown, ctx: ToolContext): Promise<unknown> {
    const decision = await this.policy.check(tool, ctx);
    if (decision === "deny") throw new ToolError(`Outil refusé par la politique: ${tool.key}`);
    if (decision === "require_human") throw new HumanApprovalRequired(tool.key);

    await this.audit.onCall(tool, input, ctx);
    try {
      const result = await tool.execute(input, ctx);
      await this.audit.onResult(tool, result, ctx);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      await this.audit.onError(tool, e, ctx);
      throw e; // un outil défaillant ne fait pas tomber la boucle : le runtime décide
    }
  }
}
