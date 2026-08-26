"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { launchSalesRun } from "@/lib/agent-actions";

export function LaunchRunButton({
  tenantId,
  agentInstanceId,
}: {
  tenantId: string;
  agentInstanceId: string;
}) {
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
              const { taskId } = await launchSalesRun(tenantId, agentInstanceId);
              router.push(`/tasks/${taskId}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        {pending ? "Au travail…" : "Lancer une tâche pour l'employé commercial"}
      </button>
      {error && (
        <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}
