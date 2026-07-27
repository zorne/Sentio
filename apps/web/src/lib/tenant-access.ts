// ════════════════════════════════════════════════════════════════════
// Vérification d'accès tenant — remplace la confiance aveugle en `?tenant=`
// (ADR-018, "à restaurer avant tout vrai second client"). Le tenant démo
// reste public par construction (aucune vraie donnée client dedans) ;
// tout le reste exige une session Supabase + appartenance réelle
// (table tenant_member), jamais juste "l'URL le dit".
// ════════════════════════════════════════════════════════════════════

import { redirect } from "next/navigation";
import { pool } from "./db";
import { createSupabaseServerClient } from "./supabase-server";
import { DEMO_TENANT_ID } from "@employes-ia/core/wiring";

export async function isAuthorizedForTenant(tenantId: string): Promise<boolean> {
  if (tenantId === DEMO_TENANT_ID) return true;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { rows } = await pool.query(
    `select 1 from tenant_member where tenant_id = $1 and user_id = $2`,
    [tenantId, user.id]
  );
  return rows.length > 0;
}

/** Pour les Server Components (pages) : redirige vers /login plutôt que
 *  de laisser fuiter les données d'un tenant qui n'est pas le vôtre. */
export async function requireTenantAccess(tenantId: string): Promise<void> {
  if (!(await isAuthorizedForTenant(tenantId))) redirect("/login");
}
