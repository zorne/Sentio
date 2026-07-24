// ════════════════════════════════════════════════════════════════════
// Outil : crm.read_leads — lit les leads du tenant depuis SA PROPRE base
// (table `lead`, migration 0003). Remplace la dépendance Google Sheets
// (ADR-007/008) : zéro compte externe, zéro clé, isolation multi-tenant
// native (RLS déjà en place). Voir ADR-009.
//
// Ce n'est plus un adaptateur vers un service tiers mais une lecture
// directe de la plateforme — le tout premier pas d'un vrai CRM interne
// (Ch.24 de la Project Bible), pas un rafistolage de démo.
//
// effect: "read" → autonomie automatique par défaut (archi §7).
// ════════════════════════════════════════════════════════════════════

import type { Tool, ToolContext } from "../index.js";

export interface LeadRow {
  name: string;
  company: string;
  email: string;
  lastContact: string;
  notes: string;
}

/** Contrat d'accès DB — implémentation concrète dans services/api ou
 *  services/worker (client Supabase). Le noyau ne dépend d'aucun SDK DB
 *  précis (principe n°2 : le noyau ne connaît aucun métier ni fournisseur). */
export interface LeadRepository {
  listForTenant(tenantId: string): Promise<LeadRow[]>;
}

export function createReadLeadsTool(repo: LeadRepository): Tool {
  return {
    key: "crm.read_leads",
    description:
      "Lit la liste des leads du tenant courant (nom, entreprise, email, dernier contact, notes).",
    inputSchema: { type: "object", properties: {} },
    effect: "read",
    async execute(_rawInput: unknown, ctx: ToolContext): Promise<LeadRow[]> {
      return repo.listForTenant(ctx.tenantId);
    },
  };
}
