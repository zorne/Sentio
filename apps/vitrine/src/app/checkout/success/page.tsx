// ════════════════════════════════════════════════════════════════════
// Retour Stripe après un vrai paiement (Payment Link, success_url =
// /checkout/success?session_id={CHECKOUT_SESSION_ID}). On revérifie côté
// serveur avec la clé secrète Stripe que la session est bien payée — un
// visiteur ne peut pas fabriquer un session_id valide, donc c'est une
// vraie porte, pas un flag client. Une fois confirmé, on envoie le même
// lien magique Supabase que le flux honnête actuel : la livraison de
// l'agent reste identique, seul l'accès y est désormais conditionné au
// paiement réel.
// ════════════════════════════════════════════════════════════════════

import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Logomark } from "@/components/Logomark";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "Sentio — Paiement confirmé",
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const stripe = getStripe();

  let email: string | null = null;
  let error: string | null = null;

  if (!stripe || !session_id) {
    error = "Session de paiement introuvable.";
  } else {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status !== "paid") {
        error = "Paiement non confirmé pour cette session.";
      } else {
        email = session.customer_details?.email ?? null;
        if (!email) error = "Aucun email associé à ce paiement.";
      }
    } catch {
      error = "Impossible de vérifier ce paiement.";
    }
  }

  if (email) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
  }

  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <Logomark />
        <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Sentio</h1>
        {error ? (
          <>
            <p style={{ color: "var(--red)", fontSize: 13.5, marginBottom: 16 }}>{error}</p>
            <Link href="/plans" className="btn btn-secondary">Retour aux formules</Link>
          </>
        ) : (
          <>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 16 }}>
              Paiement reçu. Un email a été envoyé à <strong>{email}</strong> avec un lien pour
              accéder à votre employé — pas de mot de passe à retenir.
            </p>
            <Link href="/" className="btn btn-secondary">Retour à l&apos;accueil</Link>
          </>
        )}
      </div>
    </section>
  );
}
