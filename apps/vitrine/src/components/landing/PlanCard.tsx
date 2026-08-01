import Link from "next/link";
import type { Plan } from "@/lib/plans";

// Carte de plan partagée entre la landing (#tarifs) et /plans — une
// seule mise en page pour la grille tarifaire, jamais deux versions qui
// pourraient diverger.
export function PlanCard({
  plan,
  ctaHref,
  ctaLabel,
}: {
  plan: Plan;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className={`lp-plan${plan.popular ? " lp-plan--hot" : ""}`}>
      {plan.popular && <span className="lp-plan-badge">★ Le plus populaire</span>}
      <div className="lp-plan-tag">{plan.name}</div>
      <div className="lp-plan-amt">
        {plan.price} <i>{plan.period}</i>
      </div>
      <p className="lp-plan-note">{plan.tagline}</p>
      <p className="lp-plan-unlock">{plan.unlock}</p>
      <ul>
        {plan.highlights.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {plan.limits && (
        <ul className="lp-plan-limits">
          {plan.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <Link href={ctaHref} className={`lp-btn ${plan.popular ? "lp-btn--primary" : "lp-btn--ghost"}`}>
        {ctaLabel}
      </Link>
    </div>
  );
}
