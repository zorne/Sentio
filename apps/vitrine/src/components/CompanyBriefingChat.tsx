"use client";

// Le vrai chat de configuration, dans l'espace privé — remplace le
// formulaire à deux champs de ProspectingConfig pour la toute première
// configuration. Une fois enregistrée (agent_instance.config, via
// saveProspectingConfigAndStart), la page se rafraîchit et
// ProspectingConfig prend le relais pour tout réglage ultérieur.
//
// Même langage visuel que OnboardingChat (chat-bubble, chat-input-row) :
// c'est le dashboard, pas la landing — sobre, pas cinématographique.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { briefingTurn, type BriefingMessage } from "@/lib/company-briefing-actions";

const FIRST_MESSAGE = "Parlez-moi un peu de votre entreprise, pour que je sache pour qui il travaille.";

export function CompanyBriefingChat({
  tenantId,
  agentInstanceId,
}: {
  tenantId: string;
  agentInstanceId: string;
}) {
  const [messages, setMessages] = useState<BriefingMessage[]>([{ role: "assistant", content: FIRST_MESSAGE }]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next: BriefingMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setPending(true);

    const result = await briefingTurn(tenantId, agentInstanceId, next);
    setPending(false);

    if (result.kind === "message") {
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      return;
    }
    if (result.kind === "panne") {
      // Le message reste visible (il a bien été dit), et redisponible dans le champ pour
      // le réessayer ou le préciser — rien n'est perdu.
      setMessages((prev) => [...prev, { role: "assistant", content: result.message }]);
      setInput(text);
      return;
    }
    router.push(`/tasks/${result.taskId}`);
  }

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: 420, marginBottom: 32 }}>
      <div style={{ padding: "14px 20px 0" }}>
        <span className="lp-mono">Configuration de votre employé</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.content}
          </div>
        ))}
        {pending && <div className="chat-bubble chat-bubble--assistant chat-bubble--pending">…</div>}
        <div ref={endRef} />
      </div>
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
    </div>
  );
}
