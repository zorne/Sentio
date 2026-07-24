// ════════════════════════════════════════════════════════════════════
// Context Assembler — fabrique le contexte envoyé au modèle (archi §3b).
// Séparé du runtime à dessein : on fait évoluer la qualité du contexte
// sans jamais toucher à la boucle d'exécution.
// ════════════════════════════════════════════════════════════════════

import type { Tool } from "../tools/index.js";
import type { ConversationTurn } from "../gateway/index.js";

export interface AgentIdentity {
  name: string;
  role: string;
  systemPrompt: string;
}

export interface TaskContext {
  title: string;
  input: Record<string, unknown>;
}

/** Résultat d'un outil déjà exécuté dans le run — réinjecté au modèle. */
export interface ToolTrace {
  toolKey: string;
  input: unknown;
  result: unknown;
}

export interface AssembleParams {
  identity: AgentIdentity;
  task: TaskContext;
  availableTools: Tool[];
  /** Historique des outils déjà appelés dans CE run (mémoire de travail,
   *  archi §5 — l'état de la tâche en cours). */
  priorTrace: ToolTrace[];
  /** Mémoire long terme (archi §5, §8) : faits retenus des runs
   *  précédents de CET agent. Optionnelle — un agent sans historique
   *  fonctionne normalement, juste sans ces rappels. */
  memoryFacts?: string[];
}

export interface AssembledContext {
  system: string;
  messages: ConversationTurn[];
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

export class ContextAssembler {
  assemble(params: AssembleParams): AssembledContext {
    const { identity, task, availableTools, priorTrace, memoryFacts } = params;

    const system = [
      `Tu es ${identity.name}, ${identity.role}.`,
      identity.systemPrompt,
      "Utilise les outils disponibles pour accomplir la tâche. Réponds de façon concise et factuelle.",
      memoryFacts?.length
        ? "Ce que tu sais déjà de tes tâches précédentes :\n" +
          memoryFacts.map((f) => `- ${f}`).join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const userMessage = [
      `Tâche : ${task.title}`,
      Object.keys(task.input).length ? `Données : ${JSON.stringify(task.input)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const messages: AssembledContext["messages"] = [
      { kind: "text", role: "user", content: userMessage },
    ];

    // Réinjecte l'historique RÉEL du run (les appels ont vraiment eu
    // lieu, ce ne sont pas des tours reconstitués en texte libre — voir
    // gateway/index.ts ConversationTurn). Chaque provider encode ces
    // tours dans son propre format natif de function-calling.
    for (const trace of priorTrace) {
      messages.push({ kind: "tool_call", toolKey: trace.toolKey, input: trace.input });
      messages.push({ kind: "tool_result", toolKey: trace.toolKey, result: trace.result });
    }

    return {
      system,
      messages,
      tools: availableTools.map((t) => ({
        name: t.key,
        description: t.description,
        parameters: t.inputSchema,
      })),
    };
  }
}
