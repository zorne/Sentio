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
import { buildOnboardingDeps, ONBOARDING_SYSTEM_PROMPT } from "@employes-ia/core/wiring";
import type { ConversationTurn } from "@employes-ia/core/gateway";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OnboardingResult {
  reply: string;
  tenantId?: string;
  agentInstanceId?: string;
}

export async function onboardingChat(history: ChatMessage[]): Promise<OnboardingResult> {
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
