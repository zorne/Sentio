// ════════════════════════════════════════════════════════════════════
// Page détail d'une tâche — trace complète + boutons Approuver/Refuser
// quand la tâche attend une validation humaine.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { TaskLive } from "@/components/TaskLive";
import { ApproveControls } from "@/components/ApproveControls";

export const dynamic = "force-dynamic";

interface EventRow {
  id: number;
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: task } = await supabase
    .from("task")
    .select("id, title, status, created_at")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) notFound();

  const { data: events } = await supabase
    .from("execution_event")
    .select("id, seq, kind, payload, created_at")
    .eq("task_id", taskId)
    .order("seq", { ascending: true });

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">← Employés IA · Dashboard</Link>
          <span className="user-chip">{user.email}</span>
        </div>
      </nav>

      <section>
        <div className="container">
          <h1>{task.title}</h1>
          <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginBottom: 24 }}>
            Statut&nbsp;: <strong style={{ color: "var(--text-primary)" }}>{task.status}</strong>
            &nbsp;·&nbsp;Task <span className="mono">{taskId.slice(0, 12)}</span>
          </p>

          {task.status === "waiting_human" && (
            <div className="card" style={{ marginBottom: 24, borderColor: "rgba(251,191,36,0.35)" }}>
              <h2 style={{ marginBottom: 8 }}>Validation requise</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 16 }}>
                L'agent a préparé une action irréversible. Approuvez pour qu'il continue, refusez pour l'arrêter.
              </p>
              <ApproveControls taskId={taskId} />
            </div>
          )}

          <h2>Trace d'exécution</h2>
          <TaskLive taskId={taskId} initialEvents={(events ?? []) as EventRow[]} />
        </div>
      </section>
    </>
  );
}
