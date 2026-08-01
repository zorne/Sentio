"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideOnTask } from "@/lib/agent-actions";

export function ApproveControls({ taskId }: { taskId: string }) {
  const [trust, setTrust] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function decide(action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      try {
        await decideOnTask(taskId, action, action === "approve" && trust);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <>
      <div className="approve-controls">
        <button className="btn btn-approve" disabled={pending} onClick={() => decide("approve")}>
          {pending ? "Reprise en cours…" : "✓ Approuver et reprendre"}
        </button>
        <button className="btn btn-reject" disabled={pending} onClick={() => decide("reject")}>
          ✕ Refuser
        </button>
        <label className="trust-checkbox">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
          Faire confiance pour les prochaines fois
        </label>
      </div>
      {error && <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 12 }}>{error}</p>}
    </>
  );
}
