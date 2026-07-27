// ════════════════════════════════════════════════════════════════════
// Client Stripe — même dégradation propre que Groq/Apollo (ADR-005/016) :
// tant que STRIPE_SECRET_KEY n'existe pas dans l'environnement, le
// paiement en ligne reste désactivé et /checkout garde son flux honnête
// actuel (lien magique manuel, pas de paiement). Dès que la clé est
// posée, le vrai Payment Link + la vérification de session s'activent
// sans autre changement de code.
// ════════════════════════════════════════════════════════════════════

import Stripe from "stripe";

let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  client = key ? new Stripe(key) : null;
  return client;
}

// Un Payment Link Stripe par formule — créés manuellement dans le
// Dashboard Stripe (voir docs/DECISIONS.md pour la procédure). Renseigner
// l'URL du bouton "Payer" dans le lien lui-même (success_url) vers
// /checkout/success?session_id={CHECKOUT_SESSION_ID}.
const PAYMENT_LINK_ENV: Record<string, string> = {
  standard: "STRIPE_LINK_STANDARD",
  professionnel: "STRIPE_LINK_PROFESSIONNEL",
  entreprise: "STRIPE_LINK_ENTREPRISE",
};

export function getPaymentLink(planId: string): string | null {
  const envVar = PAYMENT_LINK_ENV[planId];
  return (envVar && process.env[envVar]) || null;
}
