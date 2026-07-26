"use client";

// Le seul endroit du parcours d'achat qui a besoin d'interactivité :
// révéler l'étape de paiement au clic. Aucun compte Stripe n'est encore
// connecté (voir la conversation) — on ne simule surtout pas un
// formulaire de carte bancaire qui ne mènerait nulle part. Une fois
// Stripe branché, ce bouton devient un appel à /api/checkout qui crée
// une session Stripe Checkout réelle et y redirige.

import Link from "next/link";
import { useState } from "react";
import type { Plan } from "@/lib/plans";

export function CheckoutAction({ plan }: { plan: Plan }) {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="cko-panel">
        <span className="lp-hero-tag" style={{ marginBottom: 14 }}>
          {plan.name} · en attente de paiement
        </span>
        <p className="lp-hero-sub" style={{ margin: "0 0 24px", maxWidth: "48ch" }}>
          Le paiement en ligne n&apos;est pas encore activé sur cette formule — votre choix est
          bien noté. Revenez dès qu&apos;il sera disponible pour finaliser {plan.name} à{" "}
          {plan.price} {plan.period}.
        </p>
        <div className="lp-hero-act">
          <Link href="/" className="lp-btn lp-btn--ghost">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <button className="lp-btn lp-btn--primary cko-pay" onClick={() => setSubmitted(true)}>
      Procéder au paiement
    </button>
  );
}
