// ════════════════════════════════════════════════════════════════════
// Dashboard racine — liste des tâches + bouton "Lancer une tâche".
// Server Component : lit directement Supabase avec la session utilisateur,
// RLS filtre automatiquement à ses tenants.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LaunchRunButton } from "@/components/LaunchRunButton";

export const dynamic = "force-dynamic"; // pas de cache : chaque visite recharge les tâches

interface TaskRow {
  id: string;
  title: string;
  status: "queued" | "running" | "waiting_human" | "done" | "failed" | "canceled";
  created_at: string;
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasks } = await supabase
    .from("task")
    .select("id, title, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">Employés IA · Dashboard</Link>
          <span className="user-chip">{user.email}</span>
        </div>
      </nav>

      <section>
        <div className="container">
          <h1>Vos tâches</h1>

          <div style={{ marginBottom: 32 }}>
            <LaunchRunButton />
          </div>

          <div className="card" style={{ padding: 0 }}>
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
