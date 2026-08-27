"use client";

// ════════════════════════════════════════════════════════════════════
// Le client choisit son mot de passe. C'est le seul endroit du produit
// où un mot de passe est créé, et il ne quitte jamais cette page vers
// autre chose que notre serveur.
//
// ⚠️ LA CONFIRMATION N'EST PAS UNE FORMALITÉ. Une faute de frappe sur
// un mot de passe qu'on ne voit pas enferme le client dehors dès la
// seconde connexion, et il ne comprendra pas pourquoi : il aura tapé
// « ce qu'il a choisi ». Deux champs, comparés ici, coûtent dix
// secondes et évitent un message de support.
// ════════════════════════════════════════════════════════════════════

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { definirLeMotDePasse } from "@/lib/auth-actions";

const LONGUEUR_MINIMALE = 8;

export function DefinirLeMotDePasse() {
  const router = useRouter();
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tropCourt = motDePasse.length > 0 && motDePasse.length < LONGUEUR_MINIMALE;
  const different = confirmation.length > 0 && confirmation !== motDePasse;

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const { error } = await definirLeMotDePasse(motDePasse);
      if (error) {
        setErreur(error);
        return;
      }
      router.push("/espace");
      router.refresh();
    });
  }

  return (
    <form onSubmit={enregistrer} className="form-stack">
      <input
        type="password"
        name="new-password"
        autoComplete="new-password"
        placeholder="Votre mot de passe"
        aria-label="Votre mot de passe"
        value={motDePasse}
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
        required
        disabled={pending}
      />
      <input
        type="password"
        name="confirm-password"
        autoComplete="new-password"
        placeholder="Le même, pour être sûr"
        aria-label="Confirmez votre mot de passe"
        value={confirmation}
        onChange={(evenement) => setConfirmation(evenement.target.value)}
        required
        disabled={pending}
      />

      {/* Dit pendant la frappe, pas après l'envoi : une règle qu'on découvre en échouant est une
          règle mal écrite. */}
      <p style={{ margin: 0, fontSize: 12.5, color: tropCourt ? "var(--red)" : "var(--text-secondary)" }}>
        {tropCourt
          ? `Encore ${LONGUEUR_MINIMALE - motDePasse.length} caractères.`
          : different
            ? "Les deux ne sont pas identiques."
            : `Au moins ${LONGUEUR_MINIMALE} caractères.`}
      </p>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={pending || tropCourt || different || motDePasse.length === 0}
      >
        {pending ? "Enregistrement…" : "Entrer dans mon espace"}
      </button>

      {erreur !== null && (
        <p style={{ color: "var(--red)", fontSize: 12.5, margin: 0 }}>{erreur}</p>
      )}
    </form>
  );
}
