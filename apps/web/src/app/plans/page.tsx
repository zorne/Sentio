import Link from "next/link";
import type { Metadata } from "next";
import { Logomark } from "@/components/Logomark";
import { PlanCard } from "@/components/landing/PlanCard";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "SENTIA — Choisissez votre formule",
};

// /plans reçoit éventuellement le contexte de l'agent qu'on vient de
// configurer (tenant, agent) depuis AgentActions ("Recruter mon agent") —
// on le reporte sur /checkout pour que le paiement sache pour quel agent
// il s'engage. Un accès direct (depuis la landing) n'a simplement pas ce
// contexte, /checkout reste utilisable sans.
export default function PlansPage({
  searchParams,
}: {
  searchParams: { tenant?: string; agent?: string };
}) {
  const { tenant, agent } = searchParams;
  const extra = tenant && agent ? `&tenant=${tenant}&agent=${agent}` : "";

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            SENTIA
          </Link>
          <Link href="/" className="nav-back" aria-label="Retour à l'accueil">
            ← Retour
          </Link>
        </div>
      </nav>

      <div className="lp">
        <section className="lp-sec">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <span className="lp-mono">Formules</span>
              <h2>Choisissez la génération de votre équipe.</h2>
              <p>
                Trois paliers, pas trois quotas différents — chacun change ce que vos employés
                IA sont capables de faire seuls.
              </p>
            </div>

            <div className="lp-plans">
              {PLAN_ORDER.map((id) => (
                <PlanCard
                  key={id}
                  plan={PLANS[id]}
                  ctaHref={`/checkout?plan=${id}${extra}`}
                  ctaLabel={`Choisir ${PLANS[id].name}`}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
