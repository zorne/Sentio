// ════════════════════════════════════════════════════════════════════
// LANDING — un arc en quatre actes, pas une liste de sections.
//
//   I.   PRÉSENCE  — le noyau. On ne vend rien encore, on installe.
//   II.  MISSION   — le scroll devient le temps ; il travaille.
//   III. SEUIL     — il s'arrête. Vous décidez, pour de vrai.
//   IV.  APRÈS     — court, parce que l'essentiel est déjà vécu.
//
// Ce qui a été SUPPRIMÉ de la version précédente, et pourquoi :
//   · les trois cartes de bénéfices → la mission les démontre, les
//     énoncer ensuite serait redondant et c'est la section la plus
//     copiée du web
//   · la grille « comment ça marche » en trois colonnes → le scroll EST
//     le déroulé, l'expliquer à côté reviendrait à sous-titrer un film
//     qu'on est en train de regarder
//   · la troisième offre tarifaire → moins d'options, moins d'hésitation
// ════════════════════════════════════════════════════════════════════

import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { CoreStage } from "@/components/landing/CoreStage";
import { Mission } from "@/components/landing/Mission";
import { Threshold } from "@/components/landing/Threshold";
import { Reveal } from "@/components/landing/Reveal";
import { Advisor } from "@/components/landing/Advisor";
import "./landing.css";

export const metadata: Metadata = {
  title: "SENTIA — Il travaille seul. Il vous demande avant ce qui compte.",
  description:
    "Un employé numérique qui consulte vos données, arbitre et agit. Vous voyez chaque étape. Rien d'irréversible ne part sans votre accord.",
  openGraph: {
    title: "SENTIA",
    description: "Il travaille seul. Il vous demande avant ce qui compte.",
    locale: "fr_FR",
    type: "website",
  },
};

const ROLES = [
  { name: "Commercial", desc: "Relance vos prospects, prépare vos rendez-vous.", live: true },
  { name: "Support", desc: "Traite les demandes, documente les réponses.", live: false },
  { name: "Comptabilité", desc: "Émet les factures, relance les impayés.", live: false },
  { name: "Marketing", desc: "Rédige et planifie vos campagnes.", live: false },
  { name: "Ressources humaines", desc: "Trie les candidatures, organise les entretiens.", live: false },
];


export default function LandingPage() {
  return (
    <div className="lp">
      <Nav />

      {/* ── I. PRÉSENCE ─────────────────────────────────────────── */}
      <header className="lp-hero">
        <CoreStage />
        <div className="lp-shell lp-hero-in">
          <span className="lp-hero-tag">Employé commercial · en service</span>
          <h1>
            <span>Il travaille seul.</span>
            <span>Il vous demande.</span>
          </h1>
          <p className="lp-hero-sub">
            Un employé numérique qui ouvre vos données, arbitre et agit. Vous voyez chaque
            décision. Rien d&apos;irréversible ne part sans vous.
          </p>
          <div className="lp-hero-act">
            <Link href="/onboarding" className="lp-btn lp-btn--primary">
              Recruter mon employé
            </Link>
          </div>
        </div>

        <div className="lp-scroll-hint">
          <span className="lp-scroll-line" />
          une mission, en direct
        </div>
      </header>

      {/* ── II. MISSION ─────────────────────────────────────────── */}
      <Mission />

      {/* ── III. SEUIL ──────────────────────────────────────────── */}
      <Threshold />

      {/* ── IV. LE CONSEILLER ───────────────────────────────────────
          Remplace les paragraphes explicatifs : plutôt que d'imposer au
          visiteur ce qu'on a décidé de lui raconter, on le laisse
          demander ce qui l'intéresse lui. ────────────────────────────*/}
      <section className="lp-sec" id="conseiller">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Le conseiller</span>
            <h2>Demandez-lui plutôt que de nous lire.</h2>
            <p>
              Un conseiller SENTIA répond sur le produit, son fonctionnement, ses limites
              et ses tarifs. Il ne sort jamais de ce périmètre.
            </p>
          </Reveal>

          <Reveal>
            <Advisor />
          </Reveal>
        </div>
      </section>

      <section className="lp-sec" id="metiers">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">L&apos;équipe</span>
            <h2>Un seul moteur. Autant de métiers.</h2>
          </Reveal>

          <Reveal>
            <div className="lp-roles">
              {ROLES.map((r) => (
                <div className="lp-role" key={r.name}>
                  <div className="lp-role-l">
                    <span className="lp-role-name">{r.name}</span>
                    <span className="lp-role-desc">{r.desc}</span>
                  </div>
                  <span className={`lp-role-state${r.live ? " is-live" : ""}`}>
                    {r.live ? "en service" : "bientôt"}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-sec" id="tarifs">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Tarifs</span>
            <h2>Commencez gratuitement. Payez quand il travaille vraiment.</h2>
          </Reveal>

          <div className="lp-plans">
            <Reveal>
              <div className="lp-plan">
                <div className="lp-plan-tag">Essai</div>
                <div className="lp-plan-amt">
                  Gratuit
                </div>
                <p className="lp-plan-note">Le temps de vérifier qu&apos;il tient ses promesses.</p>
                <ul>
                  <li>Un employé actif</li>
                  <li>Cent missions par mois</li>
                  <li>Journal complet et validations</li>
                </ul>
                <Link href="/onboarding" className="lp-btn lp-btn--ghost">
                  Commencer
                </Link>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="lp-plan lp-plan--hot">
                <div className="lp-plan-tag">Business</div>
                <div className="lp-plan-amt">
                  790 € <i>/ mois</i>
                </div>
                <p className="lp-plan-note">
                  Environ quatre fois moins qu&apos;un poste équivalent, sans délai de
                  recrutement.
                </p>
                <ul>
                  <li>Employés et missions illimités</li>
                  <li>Autonomie réglable par type d&apos;action</li>
                  <li>Connexion à vos outils existants</li>
                  <li>Hébergement européen</li>
                </ul>
                <Link href="/onboarding" className="lp-btn lp-btn--primary">
                  Recruter
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="lp-end">
        <div className="lp-shell">
          <Reveal>
            <h2>Il peut commencer aujourd&apos;hui.</h2>
            <p>Deux minutes de conversation, et il se met au travail.</p>
            <div className="lp-th-act">
              <Link href="/onboarding" className="lp-btn lp-btn--primary">
                Recruter mon employé
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-shell lp-foot-in">
          <span>© 2026 sentia</span>
          <span>hébergement européen · journal permanent · rgpd</span>
        </div>
      </footer>
    </div>
  );
}
