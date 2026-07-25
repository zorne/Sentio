// ════════════════════════════════════════════════════════════════════
// Dashboard racine — liste des tâches + bouton "Lancer une tâche".
//
// ADR-018 : auth différée. Pas de login pour l'instant (décision du
// fondateur : finir agents + landing + dashboard d'abord). Lecture
// directe via le pool Postgres, scopée au tenant démo — PAS de RLS/session
// ici. À restaurer avant tout onboarding d'un vrai second client.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { pool } from "@/lib/db";
import { DEMO_TENANT_ID } from "@employes-ia/core/wiring";
import { LaunchRunButton } from "@/components/LaunchRunButton";
import { Logomark } from "@/components/Logomark";

export const dynamic = "force-dynamic"; // pas de cache : chaque visite recharge les tâches

interface TaskRow {
  id: string;
  title: string;
  status: "queued" | "running" | "waiting_human" | "done" | "failed" | "canceled";
  created_at: string;
}

export default async function Home() {
  const { rows: tasks } = await pool.query<TaskRow>(
    `select id, title, status, created_at from task
     where tenant_id = $1 order by created_at desc limit 50`,
    [DEMO_TENANT_ID]
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

          <div className="footer">
            <span>employés ia · sales agent v0.1</span>
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
