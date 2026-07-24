// ════════════════════════════════════════════════════════════════════
// Outil : sheets.read_leads — lit des leads depuis un Google Sheet.
//
// Choix Phase 1 (voir docs/DECISIONS.md ADR-007) : source de données la
// plus commune chez la cible (Ch.9), €0, aucune inscription tierce.
// Remplaçable par un vrai CRM plus tard : même contrat Tool, zéro impact
// sur le runtime (principe n°2 — le noyau ne connaît aucun métier).
//
// effect: "read" → autonomie automatique par défaut (archi §7). Aucune
// écriture, donc aucun risque, idéal pour la première démo.
// ════════════════════════════════════════════════════════════════════

import type { Tool, ToolContext } from "../index.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export interface LeadRow {
  name: string;
  company: string;
  email: string;
  lastContact: string;
  notes: string;
}

/** Résout la clé API Sheets à utiliser. Distincte de la clé IA du tenant
 *  (BYOK, ADR-005) — Sheets n'est pas un provider de modèle. Clé publique
 *  "API key" Google Cloud (lecture seule, tier gratuit), pas un OAuth. */
export interface SheetsCredentialResolver {
  resolveApiKey(tenantId: string): Promise<string>;
}

interface ReadLeadsInput {
  spreadsheetId: string;
  /** Ex. "Leads!A2:E" — la ligne d'en-tête n'est pas incluse. */
  range: string;
}

export function createReadLeadsTool(credentials: SheetsCredentialResolver): Tool {
  return {
    key: "sheets.read_leads",
    description:
      "Lit une liste de leads depuis un Google Sheet. Colonnes attendues: " +
      "name, company, email, lastContact (ISO date), notes.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "ID du Google Sheet (dans son URL)." },
        range: { type: "string", description: "Plage A1, ex. 'Leads!A2:E'." },
      },
      required: ["spreadsheetId", "range"],
    },
    effect: "read",
    async execute(rawInput: unknown, ctx: ToolContext): Promise<LeadRow[]> {
      const input = rawInput as ReadLeadsInput;
      const apiKey = await credentials.resolveApiKey(ctx.tenantId);

      const url = `${SHEETS_API}/${input.spreadsheetId}/values/${encodeURIComponent(
        input.range
      )}?key=${apiKey}`;

      const res = await fetch(url);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Google Sheets ${res.status}: ${detail.slice(0, 300)}`);
      }

      const data = (await res.json()) as { values?: string[][] };
      return (data.values ?? []).map((row) => ({
        name: row[0] ?? "",
        company: row[1] ?? "",
        email: row[2] ?? "",
        lastContact: row[3] ?? "",
        notes: row[4] ?? "",
      }));
    },
  };
}
