// ════════════════════════════════════════════════════════════════════
// Page détail d'une tâche — trace complète + boutons Approuver/Refuser
// quand la tâche attend une validation humaine.
//
// ADR-018 : auth différée, lecture via pool Postgres direct (pas de RLS
// côté Server Component). Le temps réel (TaskLive, navigateur) passe lui
// par une policy RLS publique bornée au tenant démo — voir migration 0008.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { TaskLive } from "@/components/TaskLive";
import { ApproveControls } from "@/components/ApproveControls";
import { Logomark } from "@/components/Logomark";

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

  const { rows: taskRows } = await pool.query(
    `select id, title, status, created_at from task where id = $1`,
    [taskId]
  );
  const task = taskRows[0];
  if (!task) notFound();

  const { rows: events } = await pool.query<EventRow>(
    `select id, seq, kind, payload, created_at from execution_event
     where task_id = $1 order by seq asc`,
    [taskId]
  );

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            Employés IA
          </Link>
          <span className="user-chip">Mode démo — sans connexion</span>
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
          <TaskLive taskId={taskId} initialEvents={events} />
        </div>
      </section>
    </>
  );
}
