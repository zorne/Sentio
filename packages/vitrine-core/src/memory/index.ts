// ════════════════════════════════════════════════════════════════════
// Mémoire long terme (archi §5, §8) — des faits structurés courts, pas
// un moteur vectoriel. C'est la seule brique qui manquait pour qu'un
// agent se comporte différemment d'un run à l'autre.
//
// L'apprentissage est une CONSÉQUENCE du journal (principe n°1), pas un
// module isolé : reflect() lit les événements d'un run TERMINÉ et en
// tire 0 à 3 faits courts, dignes d'être retenus. Rien de plus — pas de
// fine-tuning, pas de ré-entraînement (archi §8).
// ════════════════════════════════════════════════════════════════════

import type { ModelGateway } from "../gateway/index.js";
import type { StoredExecutionEvent } from "../execution/index.js";

export interface MemoryFact {
  id: string;
  fact: string;
  sourceTaskId: string | null;
  createdAt: string;
}

/** Persistance des faits — table `agent_memory` (migration 0007). */
export interface MemoryStore {
  list(agentInstanceId: string, limit?: number): Promise<MemoryFact[]>;
  remember(params: {
    tenantId: string;
    agentInstanceId: string;
    fact: string;
    sourceTaskId?: string;
  }): Promise<void>;
}

const MAX_FACTS_PER_REFLECTION = 3; // un run n'enseigne jamais des dizaines de choses

/**
 * Résume un run terminé en 0 à 3 faits courts dignes d'être mémorisés
 * (préférence détectée, décision prise, statut d'un prospect...).
 * Un appel modèle supplémentaire, volontairement séparé du runtime :
 * la réflexion n'est pas de l'exécution, elle a lieu APRÈS (archi §8),
 * et ne doit jamais bloquer ni ralentir la tâche elle-même.
 */
export async function reflect(
  gateway: ModelGateway,
  params: {
    tenantId: string;
    dataClass: "test" | "real";
    finalText: string;
    events: StoredExecutionEvent[];
  }
): Promise<string[]> {
  const toolActivity = params.events
    .filter((e) => e.kind === "tool_call" || e.kind === "tool_result")
    .map((e) => `${e.kind}: ${JSON.stringify(e.payload).slice(0, 300)}`)
    .join("\n");

  const result = await gateway.generate({
    tenantId: params.tenantId,
    dataClass: params.dataClass,
    system:
      "Tu résumes une tâche accomplie par un agent en au plus 3 faits courts, " +
      "utiles pour les prochaines tâches (préférence d'un client, statut d'un " +
      "prospect, décision prise). Un fait par ligne, commençant par '- '. " +
      "Si rien de durable n'est à retenir, réponds exactement 'RIEN'. " +
      "Ne commente pas, ne reformule pas la tâche elle-même.",
    messages: [
      {
        kind: "text",
        role: "user",
        content: `Résultat final: ${params.finalText}\n\nActions effectuées:\n${toolActivity || "(aucune)"}`,
      },
    ],
  });

  if (result.text.trim() === "RIEN") return [];

  return result.text
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_FACTS_PER_REFLECTION);
}
