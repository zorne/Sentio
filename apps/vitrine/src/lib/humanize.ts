// ════════════════════════════════════════════════════════════════════
// Traduit le journal technique (execution_event) en langage compréhensible
// par un client non-technique. Principe fondateur du projet (Tome 1,
// Ch.3 « Philosophie Produit ») : la complexité technique est absorbée
// par la plateforme, jamais transférée au client.
//
// Aucun JSON, aucun nom d'outil brut, aucun jargon (« modèle », « tool
// call »...) dans ce qui s'affiche par défaut — juste ce que l'employé
// a fait, pourquoi, et ce qu'il attend de vous.
// ════════════════════════════════════════════════════════════════════

export interface EventRow {
  id: number;
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Step {
  key: string;
  icon: "read" | "write" | "mail" | "error";
  title: string;
  detail?: string;
}

export interface PendingAction {
  title: string;
  detail: string;
}

export interface HumanizedTask {
  steps: Step[];
  pending: PendingAction | null;
  summary: string | null;
}

/** Décrit un appel d'outil en une phrase compréhensible, sans jargon. */
function describeTool(tool: string, input: Record<string, unknown>, result?: unknown): Step {
  if (tool === "crm.read_leads") {
    const count = Array.isArray(result) ? result.length : undefined;
    return {
      key: tool,
      icon: "read",
      title: "A consulté la liste de vos prospects",
      ...(count !== undefined
        ? { detail: `${count} prospect${count > 1 ? "s" : ""} trouvé${count > 1 ? "s" : ""}.` }
        : {}),
    };
  }
  if (tool === "crm.update_lead_notes") {
    const email = String(input.email ?? "");
    const notes = String(input.notes ?? "");
    return {
      key: tool,
      icon: "write",
      title: `A mis à jour la fiche de ${email}`,
      detail: notes,
    };
  }
  if (tool === "mail.send") {
    const to = String(input.to ?? "");
    const subject = String(input.subject ?? "");
    const body = String(input.body ?? "");
    return {
      key: tool,
      icon: "mail",
      title: `A envoyé un email à ${to}`,
      detail: `Objet : ${subject}\n\n${body}`,
    };
  }
  // Filet de sécurité : un outil futur non encore traduit reste lisible,
  // mais sans jargon technique dans le titre.
  return { key: tool, icon: "write", title: `A effectué une action (${tool})` };
}

function describePending(tool: string, input: Record<string, unknown>): PendingAction {
  if (tool === "mail.send") {
    const to = String(input.to ?? "");
    const subject = String(input.subject ?? "");
    const body = String(input.body ?? "");
    return {
      title: `Envoyer cet email à ${to} ?`,
      detail: `Objet : ${subject}\n\n${body}`,
    };
  }
  return { title: `Effectuer cette action : ${tool} ?`, detail: JSON.stringify(input) };
}

export function humanizeTask(events: EventRow[]): HumanizedTask {
  const steps: Step[] = [];
  let pendingCall: { tool: string; input: Record<string, unknown> } | null = null;
  let summary: string | null = null;

  for (const e of events) {
    if (e.kind === "tool_call") {
      pendingCall = { tool: String(e.payload.tool), input: (e.payload.input as Record<string, unknown>) ?? {} };
    } else if (e.kind === "tool_result" && pendingCall) {
      steps.push(describeTool(pendingCall.tool, pendingCall.input, e.payload.result));
      pendingCall = null;
    } else if (e.kind === "error") {
      steps.push({
        key: `error-${e.id}`,
        icon: "error",
        title: "Une étape a rencontré un problème",
        detail: String(e.payload.message ?? e.payload.reason ?? ""),
      });
      pendingCall = null;
    } else if (e.kind === "final") {
      summary = String(e.payload.text ?? "");
    }
    // "model_decision" et "human_decision" ne sont pas montrés directement :
    // ce sont des détails d'implémentation, pas des actions à comprendre.
  }

  const pending = pendingCall ? describePending(pendingCall.tool, pendingCall.input) : null;
  return { steps, pending, summary };
}
