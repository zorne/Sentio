// ════════════════════════════════════════════════════════════════════
// Onglet Décisions — liste les tâches en attente de validation humaine
// (notifiées via notify.ts) avec les mêmes contrôles Approuver/Refuser
// que la page détail d'une tâche (ApproveControls, réutilisé tel quel).
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireTenantAccess } from "@/lib/tenant-access";
import { DEMO_TENANT_ID } from "@employes-ia/core/wiring";
import { listPendingDecisions, markNotificationsRead } from "@/lib/prospecting-actions";
import { ApproveControls } from "@/components/ApproveControls";
import { Logomark } from "@/components/Logomark";

export const dynamic = "force-dynamic";

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant } = await searchParams;
  let tenantId = tenant || DEMO_TENANT_ID;

  if (!tenant) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { rows } = await pool.query<{ tenant_id: string }>(
        `select tenant_id from tenant_member where user_id = $1 limit 1`,
        [user.id]
      );
      if (rows[0]) tenantId = rows[0].tenant_id;
    }
  }

  await requireTenantAccess(tenantId);

  const decisions = await listPendingDecisions(tenantId);
  await markNotificationsRead(tenantId);

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            SENTIA
          </Link>
          <Link href={`/dashboard${tenant ? `?tenant=${tenant}` : ""}`} className="nav-back" aria-label="Retour au dashboard">
            ← Dashboard
          </Link>
        </div>
      </nav>

      <section>
        <div className="container">
          <h1>Décisions</h1>
          <p style={{ color: "var(--text-tertiary)", fontSize: 13.5, marginBottom: 24 }}>
            Votre employé a besoin de votre feu vert avant de continuer sur ces tâches.
          </p>

          {decisions.length === 0 ? (
            <div className="card empty">Aucune décision en attente.</div>
          ) : (
            decisions.map((d) => (
              <div key={d.task_id} className="card card--pending" style={{ marginBottom: 16 }}>
                <h2 style={{ marginBottom: 8 }}>
                  <Link href={`/tasks/${d.task_id}`}>{d.title}</Link>
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>
                  {new Date(d.created_at).toLocaleString("fr-FR")}
                </p>
                <ApproveControls taskId={d.task_id} />
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
