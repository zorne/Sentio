// ════════════════════════════════════════════════════════════════════
// Server Action du briefing — la conversation qui configure RÉELLEMENT
// l'employé d'un client authentifié, dans son espace privé. Un aller-
// retour à la fois, même principe que diagnostic-actions.ts, mais sur
// des données réelles (Gemini, jamais Groq — voir company-briefing/index.ts).
//
// Une fois la configuration extraite, elle part directement dans
// agent_instance.config via saveProspectingConfigAndStart
// (prospecting-actions.ts) — réutilisée telle quelle, pas dupliquée :
// c'est elle qui active l'employé ET lance son premier cycle de travail.
// ════════════════════════════════════════════════════════════════════

"use server";

import { isAuthorizedForTenant } from "@/lib/tenant-access";
import { saveProspectingConfigAndStart } from "@/lib/prospecting-actions";
import {
  buildBriefingGateway,
  createBriefingConverse,
  stepBriefing,
  type BriefingMessage,
} from "@sentio/vitrine-core/company-briefing";

export type { BriefingMessage };

export type BriefingTurnResult =
  | { readonly kind: "message"; readonly reply: string }
  | { readonly kind: "configured"; readonly taskId: string }
  | { readonly kind: "panne"; readonly message: string };

const PANNE = "Nous n'avons pas pu enregistrer votre réponse à l'instant. Réessayez dans un moment.";

export async function briefingTurn(
  tenantId: string,
  agentInstanceId: string,
  history: BriefingMessage[],
): Promise<BriefingTurnResult> {
  if (!(await isAuthorizedForTenant(tenantId))) {
    // Jamais de détail sur la raison — la même réponse qu'une panne, pour ne rien révéler à
    // qui tenterait un tenantId qui n'est pas le sien.
    return { kind: "panne", message: PANNE };
  }

  try {
    const gateway = buildBriefingGateway();
    const step = await stepBriefing(history, { converse: createBriefingConverse(gateway, tenantId) });

    if (step.stage === "conversation") {
      return { kind: "message", reply: step.reply };
    }

    const { taskId } = await saveProspectingConfigAndStart(tenantId, agentInstanceId, {
      criteria: step.configuration.criteria,
      offer: step.configuration.offer,
    });
    return { kind: "configured", taskId };
  } catch (error) {
    console.error(JSON.stringify({ route: "company-briefing", error: String(error) }));
    return { kind: "panne", message: PANNE };
  }
}
