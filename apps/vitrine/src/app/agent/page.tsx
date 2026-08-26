"use client";

// ════════════════════════════════════════════════════════════════════
// /agent — l'écran d'un employé déjà recruté, pas une carte de sélection.
//
// Alimenté par deux sources possibles :
//   · l'onboarding (OnboardingChat.tsx) qui redirige avec
//     ?tenant=<id>&agent=<id>&role=<slug>&name=<nom affiché>
//   · un lien direct depuis la landing, qui peut ne passer qu'un nom/role
//     (mode aperçu, sans tenant réel à qui rattacher une tâche)
//
// Même direction artistique que la landing (landing.css) : c'est le même
// genre de moment — une présence qui se révèle — donc le même vocabulaire
// visuel, pas celui, plus fonctionnel, du dashboard.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AgentHologramStage } from "@/components/landing/AgentHologramStage";
import { AgentActions } from "@/components/AgentActions";
import "@/app/landing.css";
import "./agent.css";

const DEFAULT_NAME = "Léo";
const DEFAULT_ROLE = "Collaborateur numérique";

// Next.js exige que tout composant lisant useSearchParams() soit enveloppé
// dans un Suspense quand la page est pré-rendue : sans ce boundary, le
// build échoue à l'étape "Generating static pages".
export default function AgentPage() {
  return (
    <Suspense fallback={null}>
      <AgentPageContent />
    </Suspense>
  );
}

function AgentPageContent() {
  const params = useSearchParams();

  const tenant = params.get("tenant");
  const agentInstanceId = params.get("agent");
  const name = params.get("name") ?? DEFAULT_NAME;
  const role = params.get("role") ?? DEFAULT_ROLE;

  // Juste après l'onboarding, on a un vrai (tenant, agentInstanceId) : on
  // propose de recruter ou de tester tout de suite. Un lien direct depuis
  // la landing (sans ces deux ids) reste un aperçu — pas de tenant réel à
  // qui rattacher une tâche.
  const justCreated = Boolean(tenant && agentInstanceId);

  return (
    <div className="lp">
      <header className="agt-hero">
        <AgentHologramStage />
        <div className="lp-shell agt-in">
          <span className="lp-hero-tag">{justCreated ? "Employé recruté" : "Aperçu"}</span>
          <h1 className="agt-name">{name}</h1>
          <p className="agt-role">{role}</p>

          {tenant && agentInstanceId ? (
            <AgentActions tenant={tenant} agentInstanceId={agentInstanceId} />
          ) : (
            <div className="lp-hero-act">
              <a href={`/chat${tenant ? `?tenant=${tenant}` : ""}`} className="lp-btn lp-btn--primary">
                Parler à {name}
              </a>
              <Link href="/" className="lp-btn lp-btn--ghost">
                Retour à l&apos;équipe
              </Link>
            </div>
          )}

          <p className="lp-hero-sub">
            {name} écoute en continu pendant que vous rédigez, sans que vous ayez à attendre
            la fin pour qu&apos;il commence à comprendre.
          </p>
        </div>
      </header>
    </div>
  );
}
