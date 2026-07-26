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
import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { launchSalesRun } from "@/lib/agent-actions";

const AgentHero3D = dynamic(() => import("@/components/landing/AgentHero3D"), {
  ssr: false,
});

// Couleur unique pour l'instant — à faire varier par rôle plus tard si
// le besoin se confirme, sans complexifier tant que ce n'est pas requis.
const ACCENT = "#6ee7a8";
const BASE = "#c8d2dc";

const DEFAULT_NAME = "Léo";
const DEFAULT_ROLE = "Assistant conversationnel";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const tenant = params.get("tenant");
  const agentInstanceId = params.get("agent");
  const name = params.get("name") ?? DEFAULT_NAME;
  const role = params.get("role") ?? DEFAULT_ROLE;

  // Juste après l'onboarding, on a un vrai (tenant, agentInstanceId) : on
  // propose de recruter ou de tester tout de suite. Un lien direct depuis
  // la landing (sans ces deux ids) reste une simple vitrine — pas de tenant
  // réel à qui rattacher une tâche.
  const justCreated = Boolean(tenant && agentInstanceId);

  function test() {
    if (!tenant || !agentInstanceId) return;
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
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        overflow: "hidden",
        background: "#0b0f0d",
        color: "#ffffff",
        fontFamily: "inherit",
      }}
    >
      {/* Champ 3D en fond, jamais interactif au clic : le pointeur ne sert
          qu'à la parallaxe, gérée directement dans le canvas. */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: "14vh",
        }}
      >
        <div
          style={{
            height: "46vh",
            width: "46vh",
            maxWidth: 560,
            maxHeight: 560,
            minWidth: 280,
            minHeight: 280,
          }}
        >
          <AgentHero3D accent={ACCENT} base={BASE} />
        </div>
      </div>

      {/* Contenu, posé au-dessus du noyau plutôt qu'au milieu de celui-ci. */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 24px 48px",
          paddingTop: "54vh",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.28em",
            color: "rgba(255,255,255,0.45)",
            margin: 0,
          }}
        >
          Employé recruté
        </p>
        <h1
          style={{
            marginTop: 12,
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {name}
        </h1>
        <p style={{ marginTop: 8, fontSize: 17, color: "rgba(255,255,255,0.6)" }}>
          {role}
        </p>

        <div
          style={{
            marginTop: 40,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {justCreated ? (
            <>
              <button
                onClick={test}
                disabled={pending}
                style={{
                  borderRadius: 999,
                  background: "#6ee7a8",
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#0b0f0d",
                  border: "none",
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? "Il travaille…" : "Tester maintenant"}
              </button>
              <a
                href={`/dashboard?tenant=${tenant}`}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.8)",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Recruter — voir le tableau de bord
              </a>
              {error && (
                <p style={{ color: "#f0a", fontSize: 13, marginTop: 4 }}>{error}</p>
              )}
            </>
          ) : (
            <>
              <a
                href={`/chat${tenant ? `?tenant=${tenant}` : ""}`}
                style={{
                  borderRadius: 999,
                  background: "#6ee7a8",
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#0b0f0d",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Parler à {name}
              </a>
              <a
                href="/"
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.8)",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Retour à l'équipe
              </a>
            </>
          )}
        </div>

        <p
          style={{
            marginTop: 32,
            maxWidth: 420,
            fontSize: 14,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          {name} écoute en continu pendant que vous rédigez — pas besoin
          d'attendre la fin pour qu'il commence à comprendre.
        </p>
      </div>
    </main>
  );
}
