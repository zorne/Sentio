"use client";

// ════════════════════════════════════════════════════════════════════
// Le Conseiller — surface de dialogue intégrée à la page, pas une bulle
// flottante dans un coin. C'est ce qui remplace les longs paragraphes :
// le visiteur demande ce qui l'intéresse LUI plutôt que de lire ce qu'on
// a décidé de lui raconter.
//
// Décisions d'interface :
//   · propositions de départ — un champ vide est la première cause
//     d'abandon d'un agent conversationnel
//   · réponse affichée au fil du flux : le premier mot arrive en quelques
//     centaines de millisecondes, l'attente n'est jamais silencieuse
//   · aucun effet de frappe artificiel : le flux réseau EST la
//     progression, en simuler une par-dessus ne ferait que ralentir
//   · zone de réponse annoncée en aria-live pour les lecteurs d'écran
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Qu'est-ce que SENTIA exactement ?",
  "Comment gardez-vous le contrôle ?",
  "Combien ça coûte ?",
  "Que deviennent mes données ?",
];

export function Advisor() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Une requête en vol doit être annulée si le visiteur quitte la page,
  // sinon le flux continue de consommer des ressources pour rien.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const next: Msg[] = [...messages, { role: "user", content: question }];
      setMessages(next);
      setInput("");
      setError(null);
      setBusy(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/advisor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const { error } = (await res.json().catch(() => ({ error: null }))) as {
            error?: string | null;
          };
          setError(error ?? "Le conseiller est momentanément indisponible.");
          setBusy(false);
          return;
        }
        if (!res.body) throw new Error("no body");

        // On ajoute une bulle vide, puis on la remplit au fil du flux :
        // le visiteur voit la réponse se construire, jamais un écran figé.
        setMessages((m) => [...m, { role: "assistant", content: "" }]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: acc };
            return copy;
          });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("La connexion a été interrompue. Réessayez.");
        }
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [messages, busy]
  );

  const started = messages.length > 0;

  return (
    <div className="adv">
      <div
        className={`adv-log${started ? " is-started" : ""}`}
        ref={logRef}
        aria-live="polite"
        aria-atomic="false"
      >
        {!started && (
          <p className="adv-idle">
            Posez votre question. Le conseiller connaît le produit, ses limites et ses tarifs.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`adv-msg adv-msg--${m.role}`}>
            {m.role === "assistant" && <span className="adv-who">conseiller</span>}
            <p>
              {m.content}
              {busy && i === messages.length - 1 && m.role === "assistant" && (
                <span className="adv-caret" aria-hidden="true" />
              )}
            </p>
          </div>
        ))}

        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="adv-msg adv-msg--assistant">
            <span className="adv-who">conseiller</span>
            <p className="adv-think" aria-label="Le conseiller rédige une réponse">
              <i /><i /><i />
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="adv-error" role="alert">
          {error}
        </p>
      )}

      {!started && (
        <div className="adv-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="adv-chip" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="adv-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="adv-input" className="adv-sr">
          Votre question sur SENTIA
        </label>
        <input
          id="adv-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Votre question sur SENTIA…"
          maxLength={1000}
          autoComplete="off"
          disabled={busy}
        />
        <button
          type="submit"
          className="adv-send"
          disabled={busy || !input.trim()}
          aria-label="Envoyer la question"
        >
          {busy ? "…" : "→"}
        </button>
      </form>
    </div>
  );
}
