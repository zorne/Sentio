"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onboardingChat, type ChatMessage } from "@/lib/onboarding-actions";

const FIRST_MESSAGE =
  "Bonjour ! Je vais configurer votre premier Employé IA. Pour commencer, quel est le nom de votre entreprise, et une adresse email de contact ?";

export function OnboardingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: FIRST_MESSAGE }]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();
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
    startTransition(async () => {
      const { reply, tenantId } = await onboardingChat(next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (tenantId) {
        setDone(true);
        // Laisse le dernier message le temps de s'afficher, puis bascule
        // vers la page de révélation dédiée (même rendu 3D que le hero).
        // role="commercial" en dur : seul métier "en service" pour l'instant
        // (voir la landing). Adapter si un jour plusieurs métiers sont
        // proposés dès l'onboarding.
        setTimeout(() => {
          router.push(`/agent?tenant=${tenantId}&role=commercial&name=${encodeURIComponent("Employé commercial")}`);
        }, 900);
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
    </div>
  );
}
