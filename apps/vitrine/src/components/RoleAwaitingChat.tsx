"use client";

// ════════════════════════════════════════════════════════════════════
// RoleAwaitingChat — même présentation que OnboardingChat, mais pour un
// métier qui n'a PAS encore de vrai agent derrière (voir lib/agent-roles,
// `live: false`). Pas d'appel serveur, pas de LLM, pas de tenant créé :
// un court script fixe qui récolte de quoi faire réagir les cartes de
// compétences, puis annonce honnêtement que l'agent arrive bientôt.
//
// Ne JAMAIS faire semblant d'avoir créé un agent réel ici — c'est
// exactement ce que ce composant existe pour éviter.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import type { AgentRole } from "@/lib/agent-roles";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function RoleAwaitingChat({
  role,
  onUserMessage,
  onComplete,
}: {
  role: AgentRole;
  onUserMessage?: (text: string) => void;
  /** Appelé une fois le script terminé — signale "fin", pas "agent créé". */
  onComplete?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: role.greeting }]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Le script change avec le métier (greeting + followUps) : si le
  // visiteur bascule de métier depuis la landing, on repart à zéro.
  useEffect(() => {
    setMessages([{ role: "assistant", content: role.greeting }]);
    setInput("");
    setStep(0);
    setDone(false);
  }, [role]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || done) return;
    onUserMessage?.(text);
    setInput("");

    const next: Msg[] = [...messages, { role: "user", content: text }];
    const totalSteps = role.followUps.length;

    if (step < totalSteps) {
      next.push({ role: "assistant", content: role.followUps[step]! });
      setMessages(next);
      setStep(step + 1);
      return;
    }

    next.push({
      role: "assistant",
      content: `Merci ! Je note tout ça — ${role.displayName} arrive très bientôt, vous serez prévenu·e dès qu'il est prêt.`,
    });
    setMessages(next);
    setDone(true);
    onComplete?.();
  }

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: 480 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {!done && (
        <div className="chat-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Votre réponse…"
          />
          <button className="btn btn-primary" onClick={send} disabled={!input.trim()}>
            Envoyer
          </button>
        </div>
      )}
    </div>
  );
}
