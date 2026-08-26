"use client";

// ════════════════════════════════════════════════════════════════════
// LUI PARLER — la seule surface où le dirigeant s'adresse à son employée.
//
// ⚠️ CE N'EST PAS UN AGENT CONVERSATIONNEL, et ça se voit à l'usage.
//
// Elle ne répond qu'à ce qu'elle sait compter, et les chiffres viennent
// tous de lignes en base (`@sentio/domain`, `demander`). Une question
// hors de sa portée reçoit un refus qui dit ce qu'elle sait dire — pas
// une réponse vague, encore moins un chiffre plausible.
//
// Les questions suggérées ne sont donc pas de la décoration : ce sont
// les rails. Un champ libre sans elles laisserait croire à un assistant
// général, et chaque question hors piste serait vécue comme une panne.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useTransition } from "react";

import { demanderALEmployee } from "./actions";

const SUGGESTIONS = [
  "Qu'as-tu fait aujourd'hui ?",
  "Combien d'entreprises approchées cette semaine ?",
  "Combien m'ont répondu ?",
  "Où en est mon objectif ?",
] as const;

interface Tour {
  readonly id: number;
  readonly de: "moi" | "elle";
  readonly texte: string;
  readonly suggestions?: readonly string[];
}

export function Conversation({ tenantId, prenom }: { tenantId: string; prenom: string }) {
  const [tours, setTours] = useState<readonly Tour[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, demarrer] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);

  // La conversation suit toujours sa dernière ligne. Sans ça, la réponse arrive hors de l'écran
  // et l'échange donne l'impression de n'avoir rien produit.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [tours, enCours]);

  function poser(question: string) {
    const dit = question.trim();
    if (dit === "" || enCours) return;

    setSaisie("");
    setTours((t) => [...t, { id: Date.now(), de: "moi", texte: dit }]);

    demarrer(async () => {
      const r = await demanderALEmployee(tenantId, dit);
      setTours((t) => [
        ...t,
        {
          id: Date.now() + 1,
          de: "elle",
          texte: r.ok ? (r.phrase ?? "") : (r.message ?? "Je n'ai pas pu répondre."),
          ...(r.suggestions !== undefined && { suggestions: r.suggestions }),
        },
      ]);
    });
  }

  return (
    <div className="cv">
      <div className="cv-fil">
        {tours.length === 0 ? (
          <p className="cv-invite">Demandez-lui ce qu&apos;elle a fait.</p>
        ) : null}

        {tours.map((tour) => (
          <div key={tour.id} className={`cv-tour cv-tour--${tour.de}`}>
            <p>{tour.texte}</p>
            {tour.suggestions ? (
              <ul className="cv-rails">
                {tour.suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => poser(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}

        {/* Elle « réfléchit » : trois points. Un état d'attente muet se lit comme une panne. */}
        {enCours ? (
          <div className="cv-tour cv-tour--elle">
            <span className="cv-attente" aria-label={`${prenom} cherche`}>
              <i /><i /><i />
            </span>
          </div>
        ) : null}

        <div ref={finRef} />
      </div>

      {tours.length === 0 ? (
        <ul className="cv-rails cv-rails--depart">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => poser(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="cv-saisie"
        onSubmit={(e) => {
          e.preventDefault();
          poser(saisie);
        }}
      >
        <input
          type="text"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder={`Demandez à ${prenom}…`}
          maxLength={400}
          disabled={enCours}
        />
        <button type="submit" className="oui" disabled={enCours || saisie.trim() === ""}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
