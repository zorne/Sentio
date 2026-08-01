// ════════════════════════════════════════════════════════════════════
// Outil : prospecting.find_leads — cherche de VRAIS prospects via une
// base B2B externe (Apollo.io), pas seulement ce qui existe déjà dans le
// CRM (contrairement à crm.read_leads, qui ne fait QUE lire). Celui-ci
// fait entrer de la donnée nouvelle dans le tenant.
//
// effect: "write" — comme crm.update_lead_notes : pas destructeur, mais
// pas neutre non plus (crée de nouvelles lignes), donc soumis à
// l'autonomie réglée par le client (archi §7), jamais automatique par
// défaut comme une simple lecture.
// ════════════════════════════════════════════════════════════════════

import type { Tool, ToolContext } from "../index.js";

export interface ProspectCandidate {
  name: string;
  title?: string | undefined;
  company?: string | undefined;
  email?: string | undefined;
}

export interface ProspectingSearchInput {
  /** Intitulés de poste recherchés (ex: "Directeur commercial"). */
  jobTitles: string[];
  /** Secteur ou mots-clés (ex: "SaaS", "e-commerce"). */
  keywords?: string;
  /** Nombre de prospects à trouver — plafonné à 25 côté outil. */
  limit?: number;
}

/** Fournisseur de recherche B2B — implémentation réelle (Apollo.io)
 *  branchée dans wiring.ts. Le noyau ne connaît aucun fournisseur précis
 *  (principe n°2), juste ce contrat. */
export interface ProspectSearchProvider {
  search(input: ProspectingSearchInput): Promise<ProspectCandidate[]>;
}

/** Écriture des prospects trouvés dans le CRM du tenant — implémentation
 *  réelle (table `lead`) branchée dans wiring.ts. */
export interface LeadWriter {
  insertMany(
    tenantId: string,
    leads: Array<{ name: string; company: string; email: string; notes: string }>
  ): Promise<number>;
}

export function createFindLeadsTool(provider: ProspectSearchProvider, writer: LeadWriter): Tool {
  return {
    key: "prospecting.find_leads",
    description:
      "Cherche de nouveaux prospects correspondant à un profil (intitulés de poste, secteur) " +
      "dans une base de données B2B externe, et les ajoute au CRM du tenant. " +
      "N'ajoute que les résultats avec un email connu.",
    inputSchema: {
      type: "object",
      properties: {
        jobTitles: {
          type: "array",
          items: { type: "string" },
          description: "Intitulés de poste recherchés, ex: [\"Directeur commercial\", \"CEO\"].",
        },
        keywords: { type: "string", description: "Secteur ou mots-clés (ex: SaaS, e-commerce)." },
        limit: { type: "number", description: "Nombre de prospects à trouver (défaut 10, max 25)." },
      },
      required: ["jobTitles"],
    },
    effect: "write",
    async execute(rawInput: unknown, ctx: ToolContext): Promise<{ found: number; added: number }> {
      const input = rawInput as ProspectingSearchInput;
      const candidates = await provider.search({ ...input, limit: Math.min(input.limit ?? 10, 25) });

      const leads = candidates
        .filter((c) => c.email)
        .map((c) => ({
          name: c.name,
          company: c.company ?? "—",
          email: c.email!,
          notes: c.title
            ? `Poste : ${c.title} — trouvé par prospection automatique.`
            : "Trouvé par prospection automatique.",
        }));

      const added = await writer.insertMany(ctx.tenantId, leads);
      return { found: candidates.length, added };
    },
  };
}
