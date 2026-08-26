import Link from "next/link";
import type { AgentRole } from "@/lib/agent-roles";

// Remplace AgentActions pour un métier sans agent réel (voir
// lib/agent-roles, `live: false`) — jamais de faux bouton "Tester" qui
// ferait tourner la démo Commercial sous une autre étiquette.
export function ComingSoonActions({ role }: { role: AgentRole }) {
  return (
    <div>
      <p className="lp-hero-sub" style={{ margin: "0 0 16px" }}>
        {role.displayName} n&apos;est pas encore actif. Seul l&apos;employé Commercial
        travaille réellement aujourd&apos;hui. Vous serez prévenu·e dès que celui-ci sera prêt.
      </p>
      <div className="lp-hero-act">
        <Link href="/plans?agent=commercial" className="lp-btn lp-btn--primary">
          Essayer l&apos;employé Commercial
        </Link>
        <Link href="/" className="lp-btn lp-btn--ghost">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
