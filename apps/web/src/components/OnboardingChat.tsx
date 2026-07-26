"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { onboardingChat, type ChatMessage } from "@/lib/onboarding-actions";

// Chargé côté client uniquement (Canvas/WebGL n'existe pas en SSR),
// comme c'est probablement déjà fait pour Core3D ailleurs sur le site.
const AgentCore3D = dynamic(() => import("./AgentCore3D"), { ssr: false });

const FIRST_MESSAGE =
  "Bonjour ! Je vais configurer votre premier Employé IA. Pour commencer, quel est le nom de votre entreprise, et une adresse email de contact ?";

export function OnboardingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: FIRST_MESSAGE }]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, done]);

  function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    startTransition(async () => {
      const { reply, tenantId: newTenantId } = await onboardingChat(next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (newTenantId) {
        setTenantId(newTenantId);
        setDone(true);
        // Plus de redirection automatique ici : c'est le clic sur
        // "Recruter" ou "Tester" ci-dessous qui décide de la suite.
      }
    });
  }

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: 480 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.content}
          </div>
        ))}
        {pending && <div className="chat-bubble chat-bubble--assistant chat-bubble--pending">…</div>}

        {done && tenantId && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              padding: "28px 12px 8px",
              animation: "agentRevealFade 0.7s ease",
            }}
          >
            <div style={{ width: 220, height: 220 }}>
              <AgentCore3D role="commercial" />
            </div>

            <div style={{ textAlign: "center" }}>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.46)",
                }}
              >
                Votre employé IA est prêt
              </span>
              <h3 style={{ fontSize: 20, fontWeight: 600, margin: "8px 0 0", color: "#fff" }}>
                Employé commercial
              </h3>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => router.push(`/?tenant=${tenantId}`)}
              >
                Recruter
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => router.push(`/?tenant=${tenantId}&mode=test`)}
              >
                Tester
              </button>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {!done && (
        <div className="chat-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Votre réponse…"
            disabled={pending}
          />
          <button className="btn btn-primary" onClick={send} disabled={pending || !input.trim()}>
            Envoyer
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes agentRevealFade {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
