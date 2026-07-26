"use client";

// ════════════════════════════════════════════════════════════════════
// /onboarding — l'hologramme est la pièce maîtresse : les compétences
// s'équipent en direct autour de lui à mesure que le visiteur répond, le
// chat reste un compagnon discret sur le côté, jamais l'élément dominant.
//
// Le chat (OnboardingChat) ne fait qu'émettre le texte du visiteur et le
// moment où l'agent existe vraiment (onComplete) — le choix des
// compétences affichées est décidé ici, par une fonction pure
// (matchSkills), pas par le chat lui-même : ajouter une compétence ou une
// règle ne touche jamais au composant de conversation.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useMemo, useState } from "react";
import { Logomark } from "@/components/Logomark";
import { OnboardingChat } from "@/components/OnboardingChat";
import { AgentHologramStage } from "@/components/landing/AgentHologramStage";
import { AgentSkillCards } from "@/components/landing/AgentSkillCards";
import { AgentActions } from "@/components/AgentActions";
import { matchSkills } from "@/lib/agent-skills";
import "@/app/landing.css";
import "@/app/agent/agent.css";
import "./onboarding.css";

export default function OnboardingPage() {
  const [userTexts, setUserTexts] = useState<string[]>([]);
  const [ready, setReady] = useState<{ tenant: string; agentInstanceId: string } | null>(null);
  const skills = useMemo(() => matchSkills(userTexts), [userTexts]);

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            SENTIA
          </Link>
          <Link href="/" className="nav-back" aria-label="Retour à l'accueil">
            ← Retour
          </Link>
        </div>
      </nav>

      <div className="lp rec-page">
        <div className="rec-wrap">
          <div className="rec-frame">
            <AgentHologramStage />
            <AgentSkillCards active={skills} />
          </div>

          <aside className="rec-side">
            <div className="rec-side-head">
              <span className="lp-mono">Votre employé</span>
              <h1 className="rec-title">Il s&apos;équipe pendant que vous répondez.</h1>
            </div>

            <OnboardingChat
              onUserMessage={(text) => setUserTexts((prev) => [...prev, text])}
              onComplete={(tenant, agentInstanceId) => setReady({ tenant, agentInstanceId })}
            />

            {ready && <AgentActions tenant={ready.tenant} agentInstanceId={ready.agentInstanceId} />}
          </aside>
        </div>
      </div>
    </>
  );
}
