"use client";

// ════════════════════════════════════════════════════════════════════
// TaskLive — s'abonne à Supabase Realtime sur execution_event pour la
// tâche en cours, et affiche chaque nouvel événement au fur et à mesure.
//
// C'est ce qui fait vivre le dashboard : le client voit exactement ce
// que fait l'agent, sans polling, sans rafraîchir. Le journal
// append-only (ADR-Phase 0) rend ça trivial — on ne gère que les inserts.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface EventRow {
  id: number;
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  model_decision: "Décision du modèle",
  tool_call: "Appel d'outil",
  tool_result: "Résultat d'outil",
  human_wait: "En attente humaine",
  human_decision: "Décision humaine",
  error: "Erreur",
  final: "Réponse finale",
};

export function TaskLive({
  taskId,
  initialEvents,
}: {
  taskId: string;
  initialEvents: EventRow[];
}) {
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`task-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "execution_event",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const row = payload.new as EventRow;
          setEvents((prev) => {
            // Idempotent : si l'événement est déjà là (via refresh serveur),
            // on ne le duplique pas.
            if (prev.some((e) => e.id === row.id)) return prev;
            return [...prev, row].sort((a, b) => a.seq - b.seq);
          });
          // Un événement final ou human_wait change le statut de la tâche —
          // on refresh pour que la bannière "Validation requise" (server-side)
          // apparaisse ou disparaisse correctement.
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

  if (events.length === 0) {
    return <div className="empty">Aucun événement encore. L'agent va démarrer…</div>;
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {events.map((e) => (
        <div key={e.id} className="event-row">
          <span className="seq">#{e.seq}</span>
          <span className="kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
          <span className="payload">{summarize(e.kind, e.payload)}</span>
        </div>
      ))}
    </div>
  );
}

function summarize(kind: string, payload: Record<string, unknown>): string {
  if (kind === "model_decision") {
    const calls = payload.toolCalls as Array<{ name: string }> | undefined;
    if (calls?.length) return `→ appelle ${calls.map((c) => c.name).join(", ")}`;
    const text = payload.text as string | undefined;
    return text ? text.slice(0, 200) + (text.length > 200 ? "…" : "") : "";
  }
  if (kind === "tool_call") {
    return `${payload.tool} ${JSON.stringify(payload.input ?? {}).slice(0, 150)}`;
  }
  if (kind === "tool_result") {
    return `${payload.tool} → ${JSON.stringify(payload.result ?? {}).slice(0, 150)}`;
  }
  if (kind === "final") {
    const text = payload.text as string | undefined;
    return text?.slice(0, 300) ?? "";
  }
  if (kind === "human_wait") return `en attente pour ${payload.tool}`;
  if (kind === "human_decision") return `${payload.tool} → ${payload.decision}`;
  if (kind === "error") return String(payload.reason ?? payload.message ?? "");
  return "";
}
