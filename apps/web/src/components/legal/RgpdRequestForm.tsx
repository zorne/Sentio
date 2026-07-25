"use client";

// Formulaire de demande RGPD — écrit directement en base pour traçabilité.
// L'écriture en base sert de preuve juridique de la demande (RGPD art. 12.3
// impose une réponse sous 30 jours ; il faut pouvoir prouver la date de
// réception).

import { useState, useTransition } from "react";
import { submitRgpdRequest } from "@/lib/rgpd-actions";

const RIGHTS = [
  { value: "access", label: "Accès à mes données" },
  { value: "portability", label: "Portabilité (export)" },
  { value: "rectification", label: "Rectification" },
  { value: "erasure", label: "Effacement (droit à l'oubli)" },
  { value: "restriction", label: "Limitation" },
  { value: "objection", label: "Opposition" },
];

export function RgpdRequestForm() {
  const [right, setRight] = useState("access");
  const [email, setEmail] = useState("");
  const [detail, setDetail] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitRgpdRequest({ right, email, detail });
      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
        setError(res.error);
      }
    });
  }

  if (status === "sent") {
    return (
      <div className="rgpd-ok">
        Demande enregistrée. Nous vous répondrons à <strong>{email}</strong> sous
        30 jours maximum, conformément à l&apos;article 12.3 du RGPD.
      </div>
    );
  }

  return (
    <form className="rgpd-form" onSubmit={submit}>
      <label className="rgpd-field">
        <span>Droit exercé</span>
        <select value={right} onChange={(e) => setRight(e.target.value)} required>
          {RIGHTS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>

      <label className="rgpd-field">
        <span>Votre email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={200}
          placeholder="celui de votre compte, ou celui à contacter"
        />
      </label>

      <label className="rgpd-field">
        <span>Détails (facultatif)</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Éléments utiles au traitement de votre demande"
        />
      </label>

      {error && <p className="rgpd-err">{error}</p>}

      <button type="submit" className="lp-btn lp-btn--primary" disabled={pending || !email}>
        {pending ? "Envoi…" : "Envoyer la demande"}
      </button>

      <p className="rgpd-note">
        Nous pouvons vous demander une pièce d&apos;identité si un doute
        raisonnable existe sur votre identité (article 12.6 RGPD).
      </p>
    </form>
  );
}
