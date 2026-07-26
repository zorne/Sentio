"use client";

// ════════════════════════════════════════════════════════════════════
// /agent — l'écran d'un employé déjà recruté, pas une carte de sélection.
//
// Alimenté par deux sources possibles :
//   · l'onboarding (OnboardingChat.tsx) qui redirige avec
//     ?tenant=<id>&role=<slug>&name=<nom affiché>
//   · un lien direct depuis la landing, qui peut ne passer qu'un nom/role
//
// Layout : le noyau occupe le centre optique haut (comme au hero), le nom
// et le métier posent juste en dessous, les actions ferment la lecture en
// bas. Rien ne doit rivaliser avec le noyau : pas de carte, pas de bordure,
// juste de l'espace.
// ════════════════════════════════════════════════════════════════════

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const AgentHero3D = dynamic(() => import("@/components/landing/AgentHero3D"), {
  ssr: false,
});

// Couleur unique pour l'instant — à faire varier par rôle plus tard si
// le besoin se confirme, sans complexifier tant que ce n'est pas requis.
const ACCENT = "#6ee7a8";
const BASE = "#c8d2dc";

const DEFAULT_NAME = "Léo";
const DEFAULT_ROLE = "Assistant conversationnel";

export default function AgentPage() {
  const params = useSearchParams();

  const tenant = params.get("tenant");
  const name = params.get("name") ?? DEFAULT_NAME;
  const role = params.get("role") ?? DEFAULT_ROLE;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0b0f0d] text-white">
      {/* Champ 3D en fond, jamais interactif au clic : le pointeur ne sert
          qu'à la parallaxe, gérée directement dans le canvas. */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-[14vh]">
        <div className="h-[46vh] w-[46vh] max-w-[560px] max-h-[560px] min-w-[280px] min-h-[280px]">
          <AgentHero3D accent={ACCENT} base={BASE} />
        </div>
      </div>

      {/* Contenu, posé au-dessus du noyau plutôt qu'au milieu de celui-ci. */}
      <div className="relative z-10 flex min-h-screen flex-col items-center px-6 pb-12 pt-[54vh] text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-white/45">
          Employé recruté
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight sm:text-5xl">
          {name}
        </h1>
        <p className="mt-2 text-base text-white/60 sm:text-lg">{role}</p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a
            href={`/chat${tenant ? `?tenant=${tenant}` : ""}`}
            className="rounded-full bg-[#6ee7a8] px-7 py-3 text-sm font-medium text-[#0b0f0d] transition hover:bg-[#7ff0b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6ee7a8]"
          >
            Parler à {name}
          </a>
          <a
            href="/"
            className="rounded-full border border-white/15 px-7 py-3 text-sm font-medium text-white/80 transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          >
            Retour à l'équipe
          </a>
        </div>

        <p className="mt-8 max-w-md text-sm text-white/40">
          {name} écoute en continu pendant que vous rédigez — pas besoin
          d'attendre la fin pour qu'il commence à comprendre.
        </p>
      </div>
    </main>
  );
}
