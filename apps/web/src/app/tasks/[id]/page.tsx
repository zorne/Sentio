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
import { humanizeTask, type EventRow } from "@/lib/humanize";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  done: { label: "Terminé", cls: "done" },
  waiting_human: { label: "Attend votre validation", cls: "waiting" },
  running: { label: "En cours", cls: "running" },
  queued: { label: "En file d'attente", cls: "running" },
  failed: { label: "Échec", cls: "running" },
  canceled: { label: "Annulé", cls: "running" },
};

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

  const { pending } = humanizeTask(events);
  const status = STATUS_LABEL[task.status] ?? { label: task.status, cls: "running" };

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
          <div style={{ marginBottom: 24 }}>
            <span className={`status-chip ${status.cls}`}>
              <span className="dot" />
              {status.label}
            </span>
          </div>

          {task.status === "waiting_human" && pending && (
            <div className="card card--pending">
              <h2 style={{ marginBottom: 8 }}>Votre employé attend votre accord</h2>
              <p className="pending-question">{pending.title}</p>
              <pre className="pending-detail">{pending.detail}</pre>
              <ApproveControls taskId={taskId} />
            </div>
          )}

          <h2>Ce que fait votre employé</h2>
          <TaskLive taskId={taskId} initialEvents={events} />
        </div>
      </section>
    </>
  );
}
