import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logomark } from "@/components/Logomark";
import { CheckoutAction } from "@/components/CheckoutAction";
import { getPlan } from "@/lib/plans";
import { pool } from "@/lib/db";
import { getPaymentLink } from "@/lib/stripe";
import "@/app/landing.css";
import "./checkout.css";

export const metadata: Metadata = {
  title: "Récapitulatif de commande | Sentio",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; tenant?: string; agent?: string }>;
}) {
  const { plan: planId, agent: agentInstanceId } = await searchParams;
  const plan = getPlan(planId);
  if (!plan) notFound();

  // Préremplit l'email avec celui déjà donné pendant l'onboarding — le
  // client ne devrait pas avoir à le retaper pour recevoir son agent.
  let defaultEmail: string | undefined;
  if (agentInstanceId) {
    const { rows } = await pool.query<{ email: string | null }>(
      `select config->>'contactEmail' as email from agent_instance where id = $1`,
      [agentInstanceId]
    );
    defaultEmail = rows[0]?.email ?? undefined;
  }

  const paymentLink = getPaymentLink(plan.id);

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            Sentio
          </Link>
          <Link href="/plans" className="nav-back" aria-label="Changer de formule">
            ← Changer de formule
          </Link>
        </div>
      </nav>

      <div className="lp cko-page">
        <div className="lp-shell cko-wrap">
          <div className="cko-summary">
            <span className="lp-mono">Récapitulatif</span>
            <h1 className="cko-title">{plan.name}</h1>
            <div className="lp-plan-amt">
              {plan.price} <i>{plan.period}</i>
            </div>
            <p className="lp-plan-note">{plan.tagline}</p>

            {/* Les points saillants, pas les vingt lignes de la formule : un récapitulatif de
                commande sert à confirmer un montant et une échéance. La décision est déjà prise,
                et re-vendre à cet instant repousse le bouton sous la ligne de flottaison. */}
            <ul className="cko-features">
              {plan.highlights.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>

          <div className="cko-pay-box">
            <span className="lp-mono">Paiement</span>
            <p className="cko-pay-note">
              Facturation mensuelle, résiliable à tout moment. Hébergement européen, aucune
              donnée de carte ne transite par nos serveurs.
            </p>
            <CheckoutAction
              plan={plan}
              defaultEmail={defaultEmail}
              paymentLink={paymentLink}
              agentInstanceId={agentInstanceId}
            />
          </div>
        </div>
      </div>
    </>
  );
}
