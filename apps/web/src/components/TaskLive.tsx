"use client";

// ════════════════════════════════════════════════════════════════════
// TaskLive — s'abonne à Supabase Realtime sur execution_event et affiche
// ce que fait l'employé IA en LANGAGE CLAIR (voir lib/humanize.ts).
// Aucun JSON, aucun terme technique par défaut — un client doit
// comprendre sans explication (Ch.3 Philosophie Produit).
// ════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { humanizeTask, type EventRow, type Step } from "@/lib/humanize";

export function TaskLive({
  taskId,
  initialEvents,
}: {
  taskId: string;
  initialEvents: EventRow[];
}) {
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [showRaw, setShowRaw] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`task-${taskId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "execution_event", filter: `task_id=eq.${taskId}` },
        (payload) => {
          const row = payload.new as EventRow;
          setEvents((prev) => {
            if (prev.some((e) => e.id === row.id)) return prev;
            return [...prev, row].sort((a, b) => a.seq - b.seq);
          });
          // Un human_wait ou final change le statut affiché par la page
          // (bannière de validation, résumé) — on la resynchronise.
          if (row.kind === "human_wait" || row.kind === "final") {
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, router]);

  const { steps, summary } = humanizeTask(events);

  if (steps.length === 0 && !summary) {
    return <div className="empty">Votre employé se met au travail…</div>;
  }

  return (
    <div>
      <div className="card" style={{ padding: 0 }}>
        {steps.map((step, i) => (
          <StepRow key={step.key + i} step={step} />
        ))}
        {summary && (
          <div className="step-row step-row--summary">
            <span className="step-icon step-icon--done" aria-hidden="true" />
            <div>
              <div className="step-title">Tâche terminée</div>
              <div className="step-detail">{summary}</div>
            </div>
          </div>
        )}
      </div>

      <button className="raw-toggle" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? "Masquer" : "Afficher"} le détail technique
      </button>
      {showRaw && (
        <div className="card" style={{ padding: 0, marginTop: 8 }}>
          {events.map((e) => (
            <div key={e.id} className="event-row">
              <span className="seq">#{e.seq}</span>
              <span className="kind">{e.kind}</span>
              <span className="payload">{JSON.stringify(e.payload).slice(0, 200)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <div className="step-row">
      <span className={`step-icon step-icon--${step.icon}`} aria-hidden="true" />
      <div>
        <div className="step-title">{step.title}</div>
        {step.detail && <div className="step-detail">{step.detail}</div>}
      </div>
    </div>
  );
}
