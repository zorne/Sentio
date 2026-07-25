// ════════════════════════════════════════════════════════════════════
// Outil : platform.create_tenant_agent — utilisé par L'AGENT D'ACCUEIL
// (pas par un agent client). Une fois l'interview terminée, il crée le
// tenant du prospect et son premier Employé IA, avec des instructions
// personnalisées à partir des réponses données.
//
// Fidèle à la philosophie fondatrice (Tome 1 Ch.3) : le client ne
// configure pas un outil, il répond à des questions — c'est la
// plateforme qui traduit ça en configuration technique.
//
// effect: "write" — pas de validation humaine (c'est un formulaire
// d'inscription, pas une action destructrice), mais tracé comme tout le
// reste (archi §3f).
// ════════════════════════════════════════════════════════════════════

import type { Tool, ToolContext } from "../index.js";

export type AutonomyLevel = "cautious" | "balanced" | "autonomous";

interface CreateTenantInput {
  companyName: string;
  contactEmail: string;
  industry: string;
  /** Ce à quoi ressemble un bon prospect pour ce client — alimente le
   *  system prompt de son agent (« comment choisir qui relancer »). */
  idealLeadDescription: string;
  /** Ton de communication souhaité (formel, chaleureux, direct...). */
  tone: string;
  autonomyLevel: AutonomyLevel;
}

/** Traduit un niveau d'autonomie en langage client vers le curseur
 *  technique réel (archi §7). Toujours prudent sur l'irréversible par
 *  défaut, même en "autonomous" — un client ne peut pas activer un envoi
 *  d'email totalement silencieux dès sa première interview. */
function mapAutonomy(level: AutonomyLevel) {
  switch (level) {
    case "cautious":
      return { read: "auto", write: "confirm_once", irreversible: "confirm" };
    case "balanced":
      return { read: "auto", write: "auto", irreversible: "confirm_once" };
    case "autonomous":
      return { read: "auto", write: "auto", irreversible: "confirm_once" };
  }
}

function buildSystemPrompt(input: CreateTenantInput): string {
  return [
    `Tu es l'Employé IA Commercial de ${input.companyName}, dans le secteur ${input.industry}.`,
    `Un bon prospect pour cette entreprise : ${input.idealLeadDescription}.`,
    `Ton de communication à adopter : ${input.tone}.`,
    "Consulte les leads, choisis le plus pertinent à relancer, consigne ton analyse dans ses notes, puis envoie-lui un email de relance.",
  ].join(" ");
}

/** Persistance déléguée à l'appelant (implémentation Postgres réelle
 *  dans apps/web) — le noyau ne connaît aucun driver DB (principe n°2). */
export interface TenantProvisioner {
  createTenantWithSalesAgent(params: {
    companyName: string;
    contactEmail: string;
    systemPrompt: string;
    autonomy: Record<string, string>;
  }): Promise<{ tenantId: string; agentInstanceId: string }>;
}

export function createProvisionTenantTool(provisioner: TenantProvisioner): Tool {
  return {
    key: "platform.create_tenant_agent",
    description:
      "Crée le compte du prospect et son premier Employé IA Commercial, personnalisé " +
      "selon les réponses données pendant l'interview. À utiliser UNE SEULE FOIS, " +
      "quand toutes les informations nécessaires ont été recueillies.",
    inputSchema: {
      type: "object",
      properties: {
        companyName: { type: "string" },
        contactEmail: { type: "string" },
        industry: { type: "string" },
        idealLeadDescription: { type: "string", description: "À quoi ressemble un bon prospect pour ce client." },
        tone: { type: "string", description: "Ton de communication souhaité." },
        autonomyLevel: { type: "string", enum: ["cautious", "balanced", "autonomous"] },
      },
      required: ["companyName", "contactEmail", "industry", "idealLeadDescription", "tone", "autonomyLevel"],
    },
    effect: "write",
    async execute(rawInput: unknown, _ctx: ToolContext) {
      const input = rawInput as CreateTenantInput;
      const systemPrompt = buildSystemPrompt(input);
      const autonomy = mapAutonomy(input.autonomyLevel);
      const { tenantId, agentInstanceId } = await provisioner.createTenantWithSalesAgent({
        companyName: input.companyName,
        contactEmail: input.contactEmail,
        systemPrompt,
        autonomy,
      });
      return { tenantId, agentInstanceId, created: true };
    },
  };
}
