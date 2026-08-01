/**
 * L'implémentation réelle de `LeadEmailLookup` et `SuppressionWriter` (`handler.ts`), par appel
 * direct à PostgREST plutôt que par un client de base : la fonction est sans état, un appel par
 * requête, une dépendance de moins à faire tenir sous Deno. `SUPABASE_URL` et
 * `SUPABASE_SERVICE_ROLE_KEY` sont posées automatiquement par la plateforme sur chaque fonction
 * déployée — jamais à définir à la main (`AGENTS.md`, invariant 7).
 *
 * Le rôle de service **contourne RLS** : c'est le seul moyen de lire l'adresse d'un prospect et
 * d'écrire une exclusion sans session, pour un visiteur qui n'en a justement aucune. La sécurité
 * ne tient donc plus à une politique de table mais au jeton signé qui a identifié la demande en
 * amont (`_shared/optout-token.ts`) — c'est pour ça qu'il doit être vérifié avant d'arriver ici,
 * jamais après.
 */

import type { LeadEmailLookup, SuppressionWriter } from "./handler.ts";

function restUrl(path: string): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  return `${base.replace(/\/+$/, "")}/rest/v1/${path}`;
}

function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}

export const supabaseLeadLookup: LeadEmailLookup = {
  async find(tenantId, leadId) {
    const url = restUrl(
      `lead?id=eq.${encodeURIComponent(leadId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=email&limit=1`,
    );
    const response = await fetch(url, { headers: serviceHeaders() });
    if (!response.ok) return null;

    const rows = (await response.json()) as Array<{ email: string | null }>;
    const email = rows[0]?.email;
    return email ? { email } : null;
  },
};

export const supabaseSuppressionWriter: SuppressionWriter = {
  async insert(intent) {
    const url = restUrl("suppression");
    const response = await fetch(url, {
      method: "POST",
      headers: serviceHeaders({
        "content-type": "application/json",
        // Équivalent de `on conflict (tenant_id, pattern) do nothing` : suivre deux fois le
        // même lien ne doit ni échouer ni dupliquer l'exclusion (AGENTS.md, invariant 3).
        prefer: "resolution=ignore-duplicates,return=minimal",
      }),
      body: JSON.stringify({
        tenant_id: intent.tenantId,
        pattern: intent.pattern,
        kind: intent.kind,
        reason: intent.reason,
      }),
    });
    if (!response.ok) {
      throw new Error(`Écriture de la suppression refusée (${response.status}).`);
    }
  },
};
