// ════════════════════════════════════════════════════════════════════
// Dashboard racine — liste des tâches, prospects, bouton "Lancer une tâche".
//
// Le tenant démo reste public par construction (aucune vraie donnée
// client dedans). Pour tout autre tenant, l'accès exige une session
// Supabase + appartenance réelle (tenant_member) — voir tenant-access.ts.
// Sans `?tenant=`, on retrouve automatiquement le tenant du compte
// connecté (utile juste après la connexion par lien magique).
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireTenantAccess } from "@/lib/tenant-access";
import { DEMO_TENANT_ID } from "@employes-ia/core/wiring";
import { LaunchRunButton } from "@/components/LaunchRunButton";
import { AddLeadForm } from "@/components/AddLeadForm";
import { Logomark } from "@/components/Logomark";

export const dynamic = "force-dynamic"; // pas de cache : chaque visite recharge les tâches

interface TaskRow {
  id: string;
  title: string;
  status: "queued" | "running" | "waiting_human" | "done" | "failed" | "canceled";
  created_at: string;
}

interface LeadRow {
  id: string;
  name: string;
  company: string;
  email: string;
  notes: string;
}

export default async function Home({
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

  const { rows: tasks } = await pool.query<TaskRow>(
    `select id, title, status, created_at from task
     where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId]
  );
  const { rows: agentRows } = await pool.query<{ id: string; name: string }>(
    `select id, name from agent_instance where tenant_id = $1 limit 1`,
    [tenantId]
  );
  const { rows: leads } = await pool.query<LeadRow>(
    `select id, name, company, email, notes from lead
     where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId]
  );
  const agentInstance = agentRows[0];

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            SENTIA
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="user-chip">
              {tenantId === DEMO_TENANT_ID ? "Mode démo — sans connexion" : agentInstance?.name}
            </span>
            <Link href="/" className="nav-back" aria-label="Retour à l'accueil">← Retour</Link>
          </div>
        </div>
      </nav>

      <section>
        <div className="container">
          <h1>Vos tâches</h1>

          <div style={{ marginBottom: 32 }}>
            {agentInstance ? (
              <LaunchRunButton tenantId={tenantId} agentInstanceId={agentInstance.id} />
            ) : (
              <p style={{ color: "var(--text-tertiary)", fontSize: 13.5 }}>
                Aucun Employé IA pour ce compte. <Link href="/onboarding">Recrutez-en un</Link>.
              </p>
            )}
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 40 }}>
            {tasks && tasks.length > 0 ? (
              tasks.map((t: TaskRow) => (
                <Link key={t.id} href={`/tasks/${t.id}`} className="task-row">
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {t.id.slice(0, 8)}
                  </span>
                  <span>{t.title}</span>
                  <StatusChip status={t.status} />
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "right" }}>
                    {new Date(t.created_at).toLocaleString("fr-FR")}
                  </span>
                </Link>
              ))
            ) : (
              <div className="empty">
                Aucune tâche pour le moment. Cliquez sur « Lancer une tâche » pour démarrer votre premier Employé IA.
              </div>
            )}
          </div>

          <h1>Vos prospects</h1>
          <p style={{ color: "var(--text-tertiary)", fontSize: 13.5, marginBottom: 16 }}>
            C'est ici que votre employé va chercher qui relancer.
          </p>

          <div style={{ marginBottom: 16 }}>
            <AddLeadForm tenantId={tenantId} />
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 32 }}>
            {leads && leads.length > 0 ? (
              leads.map((l) => (
                <div
                  key={l.id}
                  className="task-row"
                  style={{ gridTemplateColumns: "1fr 1fr auto", cursor: "default" }}
                >
                  <span>{l.name} · {l.company}</span>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{l.email}</span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "right" }}>
                    {l.notes || "—"}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty">
                Aucun prospect pour le moment. Ajoutez-en un pour que votre employé ait de quoi travailler.
              </div>
            )}
          </div>

          <div className="footer">
            <span>sentia · sales agent v0.1</span>
            <span>{tasks?.length ?? 0} tâche{(tasks?.length ?? 0) > 1 ? "s" : ""}</span>
          </div>
        </div>
      </section>
    </>
  );
}

function StatusChip({ status }: { status: TaskRow["status"] }) {
  const map = {
    done: { label: "Terminé", cls: "done" },
    waiting_human: { label: "Attend validation", cls: "waiting" },
    running: { label: "En cours", cls: "running" },
    queued: { label: "En file", cls: "running" },
    failed: { label: "Échec", cls: "running" },
    canceled: { label: "Annulé", cls: "running" },
  } as const;
  const info = map[status];
  return (
    <span className={`status-chip ${info.cls}`}>
      <span className="dot" />
      {info.label}
    </span>
  );
}
