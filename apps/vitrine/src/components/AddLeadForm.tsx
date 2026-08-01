"use client";

// Formulaire d'ajout de prospect — délibérément minimal (3 champs
// obligatoires + une note libre), pas un import CSV : pour un premier
// client, un geste simple bat une fonctionnalité complète mais lourde.

import { useRef, useState, useTransition } from "react";
import { addLead } from "@/lib/leads-actions";

export function AddLeadForm({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await addLead(tenantId, {
          name: String(form.get("name") ?? ""),
          company: String(form.get("company") ?? ""),
          email: String(form.get("email") ?? ""),
          notes: String(form.get("notes") ?? ""),
        });
        formRef.current?.reset();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        + Ajouter un prospect
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input name="name" placeholder="Nom du contact" required style={{ flex: "1 1 180px" }} />
        <input name="company" placeholder="Entreprise" required style={{ flex: "1 1 180px" }} />
      </div>
      <input name="email" type="email" placeholder="Email du contact" required />
      <input name="notes" placeholder="Note (optionnel) — ce qui l'intéresse, où il en est…" />
      {error && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)} disabled={pending}>
          Annuler
        </button>
      </div>
    </form>
  );
}
