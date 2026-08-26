// ════════════════════════════════════════════════════════════════════
// Server Action de l'agent d'accueil — un aller-retour de conversation
// à la fois (pas la boucle autonome d'AgentRuntime, qui est faite pour
// un agent qui travaille seul en arrière-plan, pas pour discuter avec un
// humain en direct). Chaque appel : un message du visiteur → une
// réponse de l'IA, jusqu'à ce qu'elle ait assez d'infos pour créer le
// compte (appel de l'outil platform.create_tenant_agent).
// ════════════════════════════════════════════════════════════════════

"use server";

import { Client } from "pg";
import { buildOnboardingDeps, ONBOARDING_SYSTEM_PROMPT } from "@sentio/vitrine-core/wiring";
import type { ConversationTurn } from "@sentio/vitrine-core/gateway";

import { pool } from "@/lib/db";
import { checkDiagnosticRateLimit, resolveDiagnosticVisitor } from "@/lib/diagnostic-rate-limit";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OnboardingResult {
  reply: string;
  tenantId?: string;
  agentInstanceId?: string;
}

/** Ce qu'on répond quand le plafond du jour est atteint. Sobre : rien n'a échoué, une règle a
 *  fermé la porte, et le visiteur n'a pas à comprendre pourquoi. */
const LIMITE =
  "Nous avons beaucoup échangé aujourd'hui. Revenez demain pour reprendre où nous en sommes.";

export async function onboardingChat(history: ChatMessage[]): Promise<OnboardingResult> {
  // ⚠️ L'ACCUEIL N'AVAIT AUCUN PLAFOND, ALORS QUE LE DIAGNOSTIC EN A DEUX.
  //
  // C'est une Server Action publique, sans session, qui appelle un modèle. Sans plafond, elle
  // est une facture d'inférence ouverte à qui écrit une boucle — et la clé est partagée avec le
  // conseiller et le diagnostic, donc l'épuiser d'un côté éteint les trois.
  //
  // Le budget est VOLONTAIREMENT le même que celui du diagnostic, par visiteur et par adresse :
  // ce qui coûte, c'est le total qu'une personne consomme sur les portes publiques, pas ce
  // qu'elle consomme sur chacune. Deux compteurs séparés doubleraient le plafond réel sans que
  // personne ne l'ait décidé.
  const { visitorId, ipHash } = await resolveDiagnosticVisitor();
  const verdict = await checkDiagnosticRateLimit(pool, visitorId, ipHash);
  if (!verdict.allowed) return { reply: LIMITE };

  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    const deps = buildOnboardingDeps(db);
    const tool = deps.tools[0]!;

    const messages: ConversationTurn[] = history.map((m) => ({
      kind: "text",
      role: m.role === "assistant" ? "model" : "user",
      content: m.content,
    }));

    const result = await deps.gateway.generate({
      tenantId: "platform-onboarding", // pas un vrai tenant — agent de la plateforme elle-même
      dataClass: "real", // vraies infos d'un vrai prospect (ADR-004) — Gemini no-train uniquement
      system: ONBOARDING_SYSTEM_PROMPT,
      messages,
      tools: [{ name: tool.key, description: tool.description, parameters: tool.inputSchema }],
    });

    if (result.toolCalls.length > 0) {
      const call = result.toolCalls[0]!;
      const output = (await tool.execute(call.input, {
        tenantId: "platform-onboarding",
        agentInstanceId: "platform-onboarding",
        taskId: "platform-onboarding",
      })) as { tenantId: string; agentInstanceId: string };

      return {
        reply:
          "C'est fait ! Votre Employé numérique Commercial est prêt et personnalisé selon vos réponses. " +
          "Vous pouvez maintenant voir son tableau de bord.",
        tenantId: output.tenantId,
        agentInstanceId: output.agentInstanceId,
      };
    }

    return { reply: result.text };
  } finally {
    await db.end();
  }
}
