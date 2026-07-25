"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { launchSalesRun } from "@/lib/agent-actions";

export function LaunchRunButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const { taskId } = await launchSalesRun();
              router.push(`/tasks/${taskId}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        {pending ? "Agent en cours…" : "Lancer une tâche — Sales Agent"}
      </button>
      {error && (
        <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}
