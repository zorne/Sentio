// ════════════════════════════════════════════════════════════════════
// Context Assembler — fabrique le contexte envoyé au modèle (archi §3b).
// Séparé du runtime à dessein : on fait évoluer la qualité du contexte
// sans jamais toucher à la boucle d'exécution.
// ════════════════════════════════════════════════════════════════════

import type { Tool } from "../tools/index.js";

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
   *  archi §5 — l'état de la tâche en cours, rien de plus pour l'instant). */
  priorTrace: ToolTrace[];
}

export interface AssembledContext {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

export class ContextAssembler {
  assemble(params: AssembleParams): AssembledContext {
    const { identity, task, availableTools, priorTrace } = params;

    const system = [
      `Tu es ${identity.name}, ${identity.role}.`,
      identity.systemPrompt,
      "Utilise les outils disponibles pour accomplir la tâche. Réponds de façon concise et factuelle.",
    ].join("\n\n");

    const userMessage = [
      `Tâche : ${task.title}`,
      Object.keys(task.input).length ? `Données : ${JSON.stringify(task.input)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const messages: AssembledContext["messages"] = [{ role: "user", content: userMessage }];

    // Réinjecte les résultats d'outils déjà obtenus dans ce run, pour que
    // le modèle sache ce qu'il a déjà fait et raisonne sur les résultats.
    for (const trace of priorTrace) {
      messages.push({
        role: "assistant",
        content: `[Appel outil ${trace.toolKey}] input=${JSON.stringify(trace.input)}`,
      });
      messages.push({
        role: "user",
        content: `[Résultat ${trace.toolKey}] ${JSON.stringify(trace.result)}`,
      });
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
