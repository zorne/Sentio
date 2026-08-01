// ════════════════════════════════════════════════════════════════════
// Outil : crm.update_lead_notes — met à jour les notes d'un lead.
//
// Premier outil à EFFET DE BORD de la plateforme. Sa raison d'être :
// donner au curseur d'autonomie quelque chose de réel à contrôler.
//   effect: "write" → selon l'autonomie de l'instance, exécuté
//   automatiquement, notifié, ou suspendu en attente de validation.
//
// Réversible (on écrase un texte, rien n'est envoyé à l'extérieur), donc
// "write" et non "irreversible" — cette distinction est ce qui permet à
// un client de laisser l'agent travailler seul sans risque réel.
// ════════════════════════════════════════════════════════════════════

import type { Tool, ToolContext } from "../index.js";

export interface LeadNotesUpdate {
  email: string;
  notes: string;
}

export interface LeadWriteRepository {
  updateNotes(tenantId: string, email: string, notes: string): Promise<boolean>;
}

export function createUpdateLeadNotesTool(repo: LeadWriteRepository): Tool {
  return {
    key: "crm.update_lead_notes",
    description:
      "Met à jour les notes d'un lead identifié par son email. " +
      "Utilise cet outil pour consigner ce que tu as appris ou décidé sur un prospect.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email du lead à mettre à jour." },
        notes: { type: "string", description: "Nouveau contenu des notes." },
      },
      required: ["email", "notes"],
    },
    effect: "write",
    async execute(rawInput: unknown, ctx: ToolContext): Promise<{ updated: boolean }> {
      const input = rawInput as LeadNotesUpdate;
      const updated = await repo.updateNotes(ctx.tenantId, input.email, input.notes);
      return { updated };
    },
  };
}
