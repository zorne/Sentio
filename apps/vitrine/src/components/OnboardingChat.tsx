"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { onboardingChat, type ChatMessage } from "@/lib/onboarding-actions";

const FIRST_MESSAGE =
  "Bonjour ! Je vais configurer votre premier Employé numérique. Pour commencer, quel est le nom de votre entreprise, et une adresse email de contact ?";

// Tenant/agent démo en dur (ADR-018), mêmes valeurs que
// packages/core/src/wiring.ts (DEMO_TENANT_ID / DEMO_AGENT_INSTANCE_ID).
// Dupliqué ici plutôt qu'importé : wiring.ts tire "pg" (Node-only) et ne
// doit pas finir dans le bundle client.
const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_AGENT_INSTANCE_ID = "00000000-0000-0000-0000-000000000002";

export function OnboardingChat({
  onUserMessage,
  onComplete,
}: {
  /** Émis à chaque message envoyé — le texte brut, rien d'autre. Ce que le
   *  destinataire en fait (matcher des compétences, logger…) ne regarde
   *  pas ce composant. */
  onUserMessage?: (text: string) => void;
  /** Émis une fois quand l'agent est réellement créé (ou simulé via
   *  "Passer"). */
  onComplete?: (tenantId: string, agentInstanceId: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: FIRST_MESSAGE }]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    onUserMessage?.(text);
    startTransition(async () => {
      const { reply, tenantId, agentInstanceId } = await onboardingChat(next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (tenantId && agentInstanceId) {
        setDone(true);
        onComplete?.(tenantId, agentInstanceId);
      }
    });
  }

  function skip() {
    setDone(true);
    onComplete?.(DEMO_TENANT_ID, DEMO_AGENT_INSTANCE_ID);
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
        <div ref={endRef} />
      </div>
      {!done && (
        <>
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
          <div style={{ textAlign: "center", padding: "0 20px 16px" }}>
            <button
              onClick={skip}
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                textDecoration: "underline",
                background: "none",
                border: "none",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              Passer voir un exemple d&apos;employé
            </button>
          </div>
        </>
      )}
    </div>
  );
}
