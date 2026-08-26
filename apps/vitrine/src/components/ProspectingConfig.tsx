"use client";

// Carte principale du dashboard : le client décrit une fois son "lead
// qualifié" et son offre, clique "Valider et commencer" — l'agent
// cherche et qualifie des prospects tout seul (cron GitHub Actions,
// voir api/cron/prospect) jusqu'à ce qu'il clique "Arrêter". Remplace le
// rôle principal d'AddLeadForm : la prospection devient automatique.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProspectingConfigAndStart, setAgentActive } from "@/lib/prospecting-actions";

export function ProspectingConfig({
  tenantId,
  agentInstanceId,
  isActive,
  hasConfig,
  initialCriteria,
  initialOffer,
}: {
  tenantId: string;
  agentInstanceId: string;
  isActive: boolean;
  hasConfig: boolean;
  initialCriteria: string;
  initialOffer: string;
}) {
  const [criteria, setCriteria] = useState(initialCriteria);
  const [offer, setOffer] = useState(initialOffer);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const running = isActive && hasConfig;

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const { taskId } = await saveProspectingConfigAndStart(tenantId, agentInstanceId, { criteria, offer });
        router.push(`/tasks/${taskId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function stop() {
    setError(null);
    startTransition(async () => {
      try {
        await setAgentActive(tenantId, agentInstanceId, false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span className="lp-mono">Prospection automatique</span>
        {running && (
          <span className="status-chip done">
            <span className="dot" />
            Employé actif
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        <label style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
          Un lead qualifié, pour vous, c&apos;est quoi ?
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            disabled={running || pending}
            placeholder="Ex : dirigeant d'une PME de 10 à 50 salariés, secteur commerce ou artisanat, déjà équipé d'un site web…"
            rows={3}
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
          Quelle(s) offre(s) votre employé doit-il mettre en avant ?
          <textarea
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            disabled={running || pending}
            placeholder="Ex : audit gratuit de 30 min, puis accompagnement mensuel à partir de 299€…"
            rows={3}
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 8 }}>{error}</p>}

      {running ? (
        <button className="btn btn-secondary" onClick={stop} disabled={pending}>
          {pending ? "Arrêt…" : "Arrêter l'employé"}
        </button>
      ) : (
        <button className="btn btn-primary" onClick={start} disabled={pending || !criteria || !offer}>
          {pending ? "Démarrage…" : "Valider et commencer"}
        </button>
      )}
    </div>
  );
}
