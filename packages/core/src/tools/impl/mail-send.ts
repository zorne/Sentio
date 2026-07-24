// ════════════════════════════════════════════════════════════════════
// Outil : mail.send — envoie un email à un prospect.
//
// PREMIER OUTIL IRRÉVERSIBLE de la plateforme. Une fois l'email parti,
// on ne peut pas le rappeler : c'est la définition même de "tâche
// importante" côté client. effect: "irreversible" → le Policy Engine
// suspend le run et attend une validation humaine (archi §7).
//
// C'est cette classe d'effet, et non le jugement du modèle, qui décide.
// Même si le LLM est convaincu qu'il faut envoyer, il ne peut pas.
// ════════════════════════════════════════════════════════════════════

import type { Tool, ToolContext } from "../index.js";

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
}

/** Transport d'envoi. Implémentation réelle (SMTP, Resend, Postmark...)
 *  branchée plus tard : le noyau ne connaît aucun fournisseur. */
export interface MailTransport {
  send(email: OutgoingEmail, tenantId: string): Promise<{ messageId: string }>;
}

export function createSendMailTool(transport: MailTransport): Tool {
  return {
    key: "mail.send",
    description:
      "Envoie un email à un prospect. Action définitive : l'email ne peut pas être rappelé.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Adresse email du destinataire." },
        subject: { type: "string", description: "Objet de l'email." },
        body: { type: "string", description: "Corps du message." },
      },
      required: ["to", "subject", "body"],
    },
    effect: "irreversible",
    async execute(rawInput: unknown, ctx: ToolContext): Promise<{ messageId: string }> {
      const input = rawInput as OutgoingEmail;
      return transport.send(input, ctx.tenantId);
    },
  };
}
