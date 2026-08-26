// ════════════════════════════════════════════════════════════════════
// /diagnostic — ACQUIS-01. Même direction artistique que la landing
// (landing.css) : sérif éditorial, fond sombre, mint pour ce qui est
// vivant. Cette feuille (diagnostic.css) n'ajoute que la mise en page
// propre à cette expérience, elle réutilise les variables et
// animations de la landing plutôt que de les redéfinir — même principe
// que /agent (agent.css).
// ════════════════════════════════════════════════════════════════════

import type { Metadata } from "next";
import Link from "next/link";
import { Logomark } from "@/components/Logomark";
import { DiagnosticExperience } from "@/components/diagnostic/DiagnosticExperience";
import "@/app/landing.css";
import "./diagnostic.css";

export const metadata: Metadata = {
  title: "Parlez-moi de votre entreprise | Sentio",
  description: "Décrivez votre entreprise à Sentio, qui vous présente le collaborateur numérique adapté.",
};

export default function DiagnosticPage() {
  return (
    <div className="lp diag-page">
      <Link href="/" className="diag-brand">
        <Logomark size={18} />
        Sentio
      </Link>
      <DiagnosticExperience />
    </div>
  );
}
