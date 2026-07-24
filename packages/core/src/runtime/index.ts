// ════════════════════════════════════════════════════════════════════
// Agent Runtime — LA boucle (archi §3a). Volontairement bête et robuste :
// construit le contexte → interroge le modèle → si outil demandé, l'exécute
// → réinjecte → recompose → jusqu'à réponse finale ou limite atteinte.
// Toute la sophistication est dans ce qu'on branche (context, tools,
// gateway), jamais ici. Ne connaît AUCUN métier (principe n°2).
//
// HITL (archi §7) : une suspension (waiting_human) n'est pas un échec,
// c'est un état de la Task. resume() reprend EXACTEMENT où le run s'est
// arrêté, en reconstruisant la trace depuis le journal — rien n'est
// perdu, aucun outil n'est rejoué deux fois.
// ════════════════════════════════════════════════════════════════════

import type { ModelGateway } from "../gateway/index.js";
import type { ContextAssembler, AgentIdentity, ToolTrace } from "../context/index.js";
import type { Tool, ToolContext, ToolExecutor } from "../tools/index.js";
import { HumanApprovalRequired } from "../tools/index.js";
import type { RunJournal } from "../execution/index.js";
import type { StoredExecutionEvent } from "../execution/index.js";
import type { StandingApprovalStore } from "../policy/index.js";

const MAX_ITERATIONS = 8; // budget dur : une boucle d'agent ne tourne jamais à l'infini

export type RunOutcome =
  | { status: "done"; text: string }
  | { status: "waiting_human"; tool: string };

export interface RunParams {
  tenantId: string;
  taskId: string;
  /** Instance d'agent exécutée — porte le curseur d'autonomie que le
   *  Policy Engine consulte avant chaque effet de bord (archi §7). */
  agentInstanceId: string;
  identity: AgentIdentity;
  task: { title: string; input: Record<string, unknown> };
  tools: Tool[];
  dataClass: "test" | "real"; // ADR-004/005 : déclaré par l'appelant, jamais deviné
}

export type ApprovalDecision =
  | { action: "approve"; trustFuture?: boolean }
  | { action: "reject"; reason?: string };

/** Reconstruit la trace d'outils déjà exécutés depuis le journal, et
 *  identifie l'appel resté en attente (celui suivi d'un human_wait, sans
 *  tool_result correspondant). Pure lecture, aucune hypothèse implicite :
 *  un tool_call sans tool_result qui suit est, par construction, celui
 *  qui a levé HumanApprovalRequired (archi §7 — seul cas qui interrompt
 *  la boucle sans enregistrer de résultat). */
function reconstructTrace(events: StoredExecutionEvent[]): {
  trace: ToolTrace[];
  pending: { tool: string; input: unknown } | null;
} {
  const trace: ToolTrace[] = [];
  let pendingCall: { tool: string; input: unknown } | null = null;

  for (const e of events) {
    if (e.kind === "tool_call") {
      pendingCall = { tool: e.payload.tool as string, input: e.payload.input };
    } else if (e.kind === "tool_result" && pendingCall) {
      trace.push({ toolKey: pendingCall.tool, input: pendingCall.input, result: e.payload.result });
      pendingCall = null;
    }
    // "human_wait" ne touche pas pendingCall : c'est justement l'appel
    // resté en suspens qu'on veut retrouver à la fin de la boucle.
  }

  return { trace, pending: pendingCall };
}

export class AgentRuntime {
  constructor(
    private readonly gateway: ModelGateway,
    private readonly context: ContextAssembler,
    private readonly executor: ToolExecutor,
    private readonly journal: RunJournal
  ) {}

  async run(params: RunParams): Promise<RunOutcome> {
    return this.continueLoop(params, []);
  }

  /**
   * Reprend un run suspendu en waiting_human. `journal` doit avoir été
   * construit via `RunJournal.resume(...)` (continuité du compteur seq).
   * Sur "approve" avec `trustFuture`, accorde aussi une validation
   * permanente (confirm_once, ADR-010) pour ne plus jamais redemander.
   */
  async resume(
    params: RunParams,
    decision: ApprovalDecision,
    approvals?: StandingApprovalStore
  ): Promise<RunOutcome> {
    const events = await this.journal.read();
    const { trace, pending } = reconstructTrace(events);

    if (!pending) {
      throw new Error(`Aucune action en attente de validation pour la tâche ${params.taskId}.`);
    }

    const tool = params.tools.find((t) => t.key === pending.tool);
    if (!tool) {
      throw new Error(`Outil inconnu lors de la reprise: ${pending.tool}`);
    }

    await this.journal.record("human_decision", { tool: pending.tool, decision: decision.action });

    if (decision.action === "reject") {
      const text = `Action refusée par validation humaine: ${pending.tool}. Tâche arrêtée.`;
      await this.journal.record("final", { text });
      return { status: "done", text };
    }

    // Approbation : si le propriétaire choisit "ne plus demander", on
    // grave une validation permanente pour cette classe d'effet AVANT
    // d'exécuter — les appels suivants de cette classe passeront en auto.
    if (decision.trustFuture && approvals) {
      await approvals.grant({
        tenantId: params.tenantId,
        agentInstanceId: params.agentInstanceId,
        effect: tool.effect,
        firstTaskId: params.taskId,
      });
    }

    // Exécution DIRECTE, sans repasser par le Policy Engine : l'humain
    // vient d'approuver explicitement cette action précise — repasser
    // par la politique redemanderait indéfiniment (archi §7).
    const toolCtx: ToolContext = {
      tenantId: params.tenantId,
      agentInstanceId: params.agentInstanceId,
      taskId: params.taskId,
    };
    const toolResult = await tool.execute(pending.input, toolCtx);
    await this.journal.record("tool_result", { tool: pending.tool, result: toolResult });
    trace.push({ toolKey: pending.tool, input: pending.input, result: toolResult });

    return this.continueLoop(params, trace);
  }

  private async continueLoop(params: RunParams, trace: ToolTrace[]): Promise<RunOutcome> {
    const { tenantId, taskId, agentInstanceId, identity, task, tools, dataClass } = params;
    const toolByKey = new Map(tools.map((t) => [t.key, t]));
    const toolCtx: ToolContext = { tenantId, agentInstanceId, taskId };

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const assembled = this.context.assemble({
        identity,
        task,
        availableTools: tools,
        priorTrace: trace,
      });

      const result = await this.gateway.generate({
        tenantId,
        dataClass,
        system: assembled.system,
        messages: assembled.messages,
        tools: assembled.tools,
      });

      await this.journal.record(
        "model_decision",
        { text: result.text, toolCalls: result.toolCalls },
        result.usage
      );

      // Pas d'appel d'outil demandé → le modèle a terminé.
      if (result.toolCalls.length === 0) {
        await this.journal.record("final", { text: result.text });
        return { status: "done", text: result.text };
      }

      // Boucle bête : un outil à la fois, dans l'ordre demandé.
      for (const call of result.toolCalls) {
        const tool = toolByKey.get(call.name);
        if (!tool) {
          await this.journal.record("error", { reason: `Outil inconnu: ${call.name}` });
          continue;
        }

        await this.journal.record("tool_call", { tool: call.name, input: call.input });

        try {
          const toolResult = await this.executor.execute(tool, call.input, toolCtx);
          await this.journal.record("tool_result", { tool: call.name, result: toolResult });
          trace.push({ toolKey: call.name, input: call.input, result: toolResult });
        } catch (err) {
          if (err instanceof HumanApprovalRequired) {
            // Run reprenable : archi §7, HITL = un état de la Task, pas un
            // système à part. Le journal garde tout ; resume() reprend ici.
            await this.journal.record("human_wait", { tool: call.name, input: call.input });
            return { status: "waiting_human", tool: call.name };
          }
          const e = err instanceof Error ? err : new Error(String(err));
          await this.journal.record("error", { tool: call.name, message: e.message });
          trace.push({ toolKey: call.name, input: call.input, result: { error: e.message } });
        }
      }
    }

    await this.journal.record("error", { reason: "Budget d'itérations dépassé" });
    return { status: "done", text: "Tâche non résolue dans le budget d'itérations imparti." };
  }
}
