"use client";

// Le paiement en ligne (Stripe) n'est pas encore branché — on ne simule
// surtout pas un formulaire de carte bancaire qui ne mènerait nulle part.
// En attendant, ce qui EST réel : le lien magique Supabase (déjà utilisé
// pour /login) envoie un vrai email. On le réutilise ici comme "porte
// d'entrée" — le client laisse son email, reçoit un lien, et accède à son
// agent (OnboardingChat/AgentActions ont déjà rattaché ce tenant à cet
// email pendant l'onboarding — voir claimTenantsForCurrentUser).

import Link from "next/link";
import { useState } from "react";
import type { Plan } from "@/lib/plans";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Step = "idle" | "email" | "sent";

export function CheckoutAction({
  plan,
  defaultEmail,
}: {
  plan: Plan;
  defaultEmail?: string | undefined;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendAccess(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("sent");
  }

  if (step === "sent") {
    return (
      <div className="cko-panel">
        <span className="lp-hero-tag" style={{ marginBottom: 14 }}>
          {plan.name} · accès envoyé
        </span>
        <p className="lp-hero-sub" style={{ margin: "0 0 24px", maxWidth: "48ch" }}>
          Email envoyé à <strong>{email}</strong>. Ouvrez-le et cliquez sur le lien pour accéder à
          votre agent — pas de mot de passe à retenir.
        </p>
        <div className="lp-hero-act">
          <Link href="/" className="lp-btn lp-btn--ghost">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  if (step === "email") {
    return (
      <div className="cko-panel">
        <span className="lp-hero-tag" style={{ marginBottom: 14 }}>
          {plan.name} · en attente de paiement
        </span>
        <p className="lp-hero-sub" style={{ margin: "0 0 20px", maxWidth: "48ch" }}>
          Le paiement en ligne n&apos;est pas encore activé sur cette formule — votre choix est
          bien noté. En attendant, laissez votre email pour recevoir votre agent dès maintenant.
        </p>
        <form onSubmit={sendAccess} className="form-inline" style={{ marginBottom: error ? 8 : 0 }}>
          <input
            type="email"
            required
            placeholder="votre@email.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Envoi…" : "Recevoir mon agent"}
          </button>
        </form>
        {error && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{error}</p>}
      </div>
    );
  }

  return (
    <button className="lp-btn lp-btn--primary cko-pay" onClick={() => setStep("email")}>
      Procéder au paiement
    </button>
  );
}
