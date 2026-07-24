// ════════════════════════════════════════════════════════════════════
// Agent Runtime — LA boucle (archi §3a). Volontairement bête et robuste :
// construit le contexte → interroge le modèle → si outil demandé, l'exécute
// → réinjecte → recompose → jusqu'à réponse finale ou limite atteinte.
// Toute la sophistication est dans ce qu'on branche (context, tools,
// gateway), jamais ici. Ne connaît AUCUN métier (principe n°2).
// ════════════════════════════════════════════════════════════════════

import type { ModelGateway } from "../gateway/index.js";
import type { ContextAssembler, AgentIdentity, ToolTrace } from "../context/index.js";
import type { Tool, ToolContext, ToolExecutor } from "../tools/index.js";
import { HumanApprovalRequired } from "../tools/index.js";
import type { RunJournal } from "../execution/index.js";

const MAX_ITERATIONS = 8; // budget dur : une boucle d'agent ne tourne jamais à l'infini

export type RunOutcome =
  | { status: "done"; text: string }
  | { status: "waiting_human"; tool: string };

export interface RunParams {
  tenantId: string;
  taskId: string;
  identity: AgentIdentity;
  task: { title: string; input: Record<string, unknown> };
  tools: Tool[];
  dataClass: "test" | "real"; // ADR-004/005 : déclaré par l'appelant, jamais deviné
}

export class AgentRuntime {
  constructor(
    private readonly gateway: ModelGateway,
    private readonly context: ContextAssembler,
    private readonly executor: ToolExecutor,
    private readonly journal: RunJournal
  ) {}

  async run(params: RunParams): Promise<RunOutcome> {
    const { tenantId, taskId, identity, task, tools, dataClass } = params;
    const toolByKey = new Map(tools.map((t) => [t.key, t]));
    const trace: ToolTrace[] = [];
    const toolCtx: ToolContext = { tenantId, agentInstanceId: "n/a", taskId };

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

      await this.journal.record("model_decision", {
        text: result.text,
        toolCalls: result.toolCalls,
      }, result.usage);

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
            // système à part. Le journal garde tout ; on reprend plus tard
            // via RunJournal.resume() une fois l'humain décidé.
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
