"use client";

// Les deux CTA d'un agent déjà configuré — Tester (lance une vraie
// mission) et Recruter mon agent (choix de formule → paiement, /plans).
// Extrait de /agent pour être réutilisé tel quel dans la nouvelle page
// d'onboarding : la logique de lancement ne doit exister qu'à un seul
// endroit.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { launchSalesRun } from "@/lib/agent-actions";

export function AgentActions({ tenant, agentInstanceId }: { tenant: string; agentInstanceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function test() {
    setError(null);
    startTransition(async () => {
      try {
        const { taskId } = await launchSalesRun(tenant, agentInstanceId);
        router.push(`/tasks/${taskId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div>
      <div className="lp-hero-act">
        <button className="lp-btn lp-btn--primary" onClick={test} disabled={pending}>
          {pending ? "Il travaille…" : "Tester maintenant"}
        </button>
        <Link href={`/plans?tenant=${tenant}&agent=${agentInstanceId}`} className="lp-btn lp-btn--ghost">
          Recruter mon employé
        </Link>
      </div>
      {error && <p className="agt-err">{error}</p>}
    </div>
  );
}
