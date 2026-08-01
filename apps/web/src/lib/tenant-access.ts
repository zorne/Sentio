// ════════════════════════════════════════════════════════════════════
// Vérification d'accès tenant — remplace la confiance aveugle en `?tenant=`
// (ADR-018, "à restaurer avant tout vrai second client"). Deux niveaux :
//
//   · tenant démo  → une session Supabase suffit, sans appartenance. Il
//     ne contient aucune donnée client réelle, mais ce n'est pas une
//     raison de l'exposer : un visiteur qui tapait /dashboard tombait
//     dessus, et un tableau de bord de test sur un site marchand se lit
//     comme un produit inachevé. Se connecter suffit à y revenir.
//   · tout autre tenant → session ET appartenance réelle (tenant_member),
//     jamais juste "l'URL le dit".
//
// Le cron de prospection n'est pas concerné : il s'authentifie par
// CRON_SECRET, passe par launchSalesRunInternal, et exclut explicitement
// le tenant démo de sa requête.
// ════════════════════════════════════════════════════════════════════

import { redirect } from "next/navigation";
import { pool } from "./db";
import { createSupabaseServerClient } from "./supabase-server";
import { DEMO_TENANT_ID } from "@employes-ia/core/wiring";

export async function isAuthorizedForTenant(tenantId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  if (tenantId === DEMO_TENANT_ID) return true;

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
