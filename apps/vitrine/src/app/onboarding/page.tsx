"use client";

// ════════════════════════════════════════════════════════════════════
// /onboarding — l'hologramme est la pièce maîtresse : les compétences
// s'équipent en direct autour de lui à mesure que le visiteur répond, le
// chat reste un compagnon discret sur le côté, jamais l'élément dominant.
//
// Le métier vient de ?agent=<slug> (choisi depuis la landing, section
// "L'équipe") — voir lib/agent-roles pour le registre des métiers. Seul
// "commercial" a un vrai agent (OnboardingChat, backend réel) ; les
// autres passent par RoleAwaitingChat, qui ne crée rien de réel et le dit
// clairement (voir ComingSoonActions).
//
// Le chat ne fait qu'émettre le texte du visiteur et le moment où c'est
// terminé — le choix des compétences affichées est décidé ici, par une
// fonction pure (matchSkills), pas par le chat lui-même.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logomark } from "@/components/Logomark";
import { OnboardingChat } from "@/components/OnboardingChat";
import { RoleAwaitingChat } from "@/components/RoleAwaitingChat";
import { AgentHologramStage } from "@/components/landing/AgentHologramStage";
import { AgentSkillCards } from "@/components/landing/AgentSkillCards";
import { AgentActions } from "@/components/AgentActions";
import { ComingSoonActions } from "@/components/ComingSoonActions";
import { getAgentRole, matchSkills } from "@/lib/agent-roles";
import "@/app/landing.css";
import "@/app/agent/agent.css";
import "./onboarding.css";

// Next.js exige un Suspense autour de tout composant qui lit
// useSearchParams() quand la page est pré-rendue.
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPageContent />
    </Suspense>
  );
}

function OnboardingPageContent() {
  const params = useSearchParams();
  const role = getAgentRole(params.get("agent"));

  const [userTexts, setUserTexts] = useState<string[]>([]);
  const [ready, setReady] = useState<{ tenant: string; agentInstanceId: string } | null>(null);
  const [awaitingDone, setAwaitingDone] = useState(false);
  const skills = useMemo(() => matchSkills(role, userTexts), [role, userTexts]);

  // Changer de métier depuis la landing doit repartir d'une conversation
  // propre, pas garder les compétences du métier précédent affichées.
  useEffect(() => {
    setUserTexts([]);
    setReady(null);
    setAwaitingDone(false);
  }, [role]);

  // La navigation client (router.push) ne recrée jamais <body> : la classe
  // posée par RecruitLink avant de quitter la page précédente doit être
  // retirée ici, sinon la page reste invisible (opacity: 0 pour toujours).
  useEffect(() => {
    document.body.classList.remove("rt-leaving");
  }, []);

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            Sentio
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
            <AgentSkillCards catalog={role.skills} active={skills} />
          </div>

          <aside className="rec-side">
            <div className="rec-side-head">
              <span className="lp-mono">Votre employé {role.label}</span>
              <h1 className="rec-title">Il s&apos;équipe pendant que vous répondez.</h1>
            </div>

            <div className="rec-chat">
              {role.live ? (
                <OnboardingChat
                  onUserMessage={(text) => setUserTexts((prev) => [...prev, text])}
                  onComplete={(tenant, agentInstanceId) => setReady({ tenant, agentInstanceId })}
                />
              ) : (
                <RoleAwaitingChat
                  role={role}
                  onUserMessage={(text) => setUserTexts((prev) => [...prev, text])}
                  onComplete={() => setAwaitingDone(true)}
                />
              )}
            </div>

            {role.live && ready && (
              <AgentActions tenant={ready.tenant} agentInstanceId={ready.agentInstanceId} />
            )}
            {!role.live && awaitingDone && <ComingSoonActions role={role} />}
          </aside>
        </div>
      </div>
    </>
  );
}
