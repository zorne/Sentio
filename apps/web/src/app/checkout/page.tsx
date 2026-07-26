import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logomark } from "@/components/Logomark";
import { CheckoutAction } from "@/components/CheckoutAction";
import { getPlan } from "@/lib/plans";
import "@/app/landing.css";
import "./checkout.css";

export const metadata: Metadata = {
  title: "SENTIA — Récapitulatif de commande",
};

export default function CheckoutPage({
  searchParams,
}: {
  searchParams: { plan?: string; tenant?: string; agent?: string };
}) {
  const plan = getPlan(searchParams.plan);
  if (!plan) notFound();

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            SENTIA
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

            <ul className="cko-features">
              {plan.fullFeatures.map((f) => (
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
            <CheckoutAction plan={plan} />
          </div>
        </div>
      </div>
    </>
  );
}
