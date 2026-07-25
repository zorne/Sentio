// Layout partagé des pages légales — sobre, lisible, cohérent avec la
// direction artistique de la landing (sérif éditorial, mono pour les
// étiquettes). Nav minimaliste pour ramener l'utilisateur au produit.

import Link from "next/link";
import { Logomark } from "@/components/Logomark";
import type { ReactNode } from "react";
import "../landing.css";
import "./legal.css";

const PAGES = [
  { href: "/legal/confidentialite", label: "Confidentialité" },
  { href: "/legal/cgu", label: "Conditions" },
  { href: "/legal/mentions", label: "Mentions légales" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/rgpd", label: "Vos droits" },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lp">
      <nav className="lp-nav" data-solid="1">
        <div className="lp-shell lp-nav-in">
          <Link href="/" className="lp-brand">
            <Logomark size={18} />
            SENTIA
          </Link>
          <Link href="/" className="lp-btn lp-btn--ghost lp-btn--sm">Retour</Link>
        </div>
      </nav>

      <div className="legal-wrap">
        <aside className="legal-nav">
          <div className="lp-mono" style={{ marginBottom: 14 }}>Documents</div>
          <ul>
            {PAGES.map((p) => (
              <li key={p.href}><Link href={p.href}>{p.label}</Link></li>
            ))}
          </ul>
        </aside>
        <main className="legal-doc">{children}</main>
      </div>

      <footer className="lp-foot">
        <div className="lp-shell lp-foot-in">
          <span>© 2026 SENTIA</span>
          <span>hébergement européen · journal permanent · rgpd</span>
        </div>
      </footer>
    </div>
  );
}
