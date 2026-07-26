"use client";

/**
 * AgentOnboardingChat
 * ------------------------------------------------------------------
 * Chat affiché après clic sur "Recruter". Envoie chaque échange au
 * backend en mode:"configure" (voir route.ts). Dès que le backend
 * répond avec done:true, le composant bascule vers AgentReveal3D.
 *
 * Hypothèse : `agentId` correspond à un agent déjà créé en base
 * (brouillon) avant l'ouverture de ce chat — à adapter si ton flow
 * crée l'agent autrement.
 * ------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";
import { AgentReveal3D, type AgentRole } from "./AgentReveal3D";

type ChatMessage = { role: "user" | "assistant"; content: string };

type AgentState = {
  id: string;
  name: string;
  role: AgentRole;
  [key: string]: unknown;
};

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Bonjour, je vais configurer votre employé IA en quelques questions. Quel métier voulez-vous lui confier en priorité ?",
};

export function AgentOnboardingChat({
  agentId,
  apiBase,
  onTester,
}: {
  agentId: string;
  apiBase: string;
  onTester: (agent: AgentState) => void;
}) {
  const [phase, setPhase] = useState<"chatting" | "revealing">("chatting");
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;
    setError(null);
    setInput("");
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setIsSending(true);

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "configure",
          agentId,
          messages: nextMessages.slice(-20),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur serveur");

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.agent) setAgent(data.agent);

      // Voir route.ts : le backend renvoie done:true quand le modèle a
      // inclus ```json {"patch": {...}, "done": true}``` dans sa réponse,
      // c'est-à-dire quand il estime avoir assez d'informations.
      if (data.done) {
        setTimeout(() => setPhase("revealing"), 500);
      }
    } catch (err) {
      console.error("Erreur configuration agent:", err);
      setError("Une erreur est survenue. Réessayez dans un instant.");
    } finally {
      setIsSending(false);
    }
  }

  if (phase === "revealing" && agent) {
    return (
      <AgentReveal3D
        role={agent.role}
        name={agent.name}
        onRecruter={() => {
          // À brancher sur le vrai flow de paiement / activation.
          window.location.href = `/checkout?agentId=${agentId}`;
        }}
        onTester={() => onTester(agent)}
      />
    );
  }

  return (
    <div className="agent-chat">
      <div className="agent-chat__messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`agent-chat__row ${m.role}`}>
            <div className="agent-chat__bubble">{m.content}</div>
          </div>
        ))}
        {isSending && (
          <div className="agent-chat__row assistant">
            <div className="agent-chat__bubble agent-chat__typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        {error && <p className="agent-chat__error">{error}</p>}
      </div>

      <form
        className="agent-chat__footer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          className="agent-chat__input"
          rows={1}
          value={input}
          placeholder="Votre réponse…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" className="agent-chat__send" disabled={isSending || !input.trim()}>
          Envoyer
        </button>
      </form>

      <style jsx>{`
        .agent-chat {
          display: flex;
          flex-direction: column;
          height: 480px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          overflow: hidden;
        }
        .agent-chat__messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .agent-chat__row {
          display: flex;
        }
        .agent-chat__row.user {
          justify-content: flex-end;
        }
        .agent-chat__bubble {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 13.5px;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .agent-chat__row.user .agent-chat__bubble {
          background: #fff;
          color: #0a0a0b;
          border-bottom-right-radius: 4px;
        }
        .agent-chat__row.assistant .agent-chat__bubble {
          background: rgba(255, 255, 255, 0.055);
          color: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-bottom-left-radius: 4px;
        }
        .agent-chat__typing {
          display: flex;
          gap: 4px;
        }
        .agent-chat__typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
          animation: bounce 1.2s ease-in-out infinite;
        }
        .agent-chat__typing span:nth-child(2) {
          animation-delay: 0.15s;
        }
        .agent-chat__typing span:nth-child(3) {
          animation-delay: 0.3s;
        }
        @keyframes bounce {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        .agent-chat__error {
          font-size: 12.5px;
          color: #fca5a5;
          text-align: center;
        }
        .agent-chat__footer {
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          padding: 12px;
          display: flex;
          gap: 8px;
        }
        .agent-chat__input {
          flex: 1;
          resize: none;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #fff;
          font-size: 13.5px;
          padding: 9px 12px;
          outline: none;
        }
        .agent-chat__send {
          background: #fff;
          color: #0a0a0b;
          border: none;
          border-radius: 10px;
          padding: 0 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .agent-chat__send:disabled {
          opacity: 0.35;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
