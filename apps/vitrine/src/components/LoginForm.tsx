"use client";

// ════════════════════════════════════════════════════════════════════
// Le formulaire de connexion : adresse email et mot de passe.
//
// ⚠️ TOUT PASSE PAR UNE SERVER ACTION, jamais par le client Supabase du
// navigateur. Deux raisons, et la seconde est la vraie :
//
//   · la session est posée en cookie côté serveur, donc `/espace` la
//     voit dès la première navigation, sans aller-retour ;
//   · le mot de passe ne traverse que la requête vers notre propre
//     serveur. Il n'est jamais confié à du code qu'une extension de
//     navigateur pourrait lire dans la page.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { connecterAvecMotDePasse, demanderUnNouveauMotDePasse } from "@/lib/auth-actions";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [oubli, setOubli] = useState<"non" | "envoye">("non");
  const [pending, startTransition] = useTransition();

  function seConnecter(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    startTransition(async () => {
      const { error } = await connecterAvecMotDePasse(email, motDePasse);
      if (error) {
        setErreur(error);
        return;
      }
      router.push("/espace");
      router.refresh();
    });
  }

  function motDePasseOublie() {
    if (!email.trim()) {
      setErreur("Indiquez d'abord votre adresse, pour savoir où envoyer le lien.");
      return;
    }
    setErreur(null);
    startTransition(async () => {
      await demanderUnNouveauMotDePasse(email);
      setOubli("envoye");
    });
  }

  // ⚠️ Le même message que l'adresse soit connue ou non : sinon cette page dirait qui est client
  // de Sentio à quiconque essaie une adresse.
  if (oubli === "envoye") {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.6 }}>
        Si un espace existe pour <strong>{email}</strong>, un lien vient d&apos;y être envoyé.
        Ouvrez votre boîte, puis choisissez un nouveau mot de passe.
      </p>
    );
  }

  return (
    <form onSubmit={seConnecter} className="form-stack">
      <input
        type="email"
        name="email"
        autoComplete="username"
        placeholder="votre@email.fr"
        aria-label="Votre adresse email"
        value={email}
        onChange={(evenement) => setEmail(evenement.target.value)}
        required
        disabled={pending}
      />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="Votre mot de passe"
        aria-label="Votre mot de passe"
        value={motDePasse}
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
        required
        disabled={pending}
      />
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Connexion…" : "Entrer dans mon espace"}
      </button>

      {erreur !== null && (
        <p style={{ color: "var(--red)", fontSize: 12.5, margin: 0 }}>{erreur}</p>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 12.5,
          color: "var(--text-secondary)",
        }}
      >
        <button
          type="button"
          onClick={motDePasseOublie}
          disabled={pending}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Mot de passe oublié
        </button>
        <Link href="/" style={{ color: "inherit" }}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </form>
  );
}
