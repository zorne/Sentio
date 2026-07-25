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
import "./landing.css";

export const metadata: Metadata = {
  title: "Employés IA — Il travaille seul. Il vous demande avant ce qui compte.",
  description:
    "Un employé numérique qui consulte vos données, arbitre et agit. Vous voyez chaque étape. Rien d'irréversible ne part sans votre accord.",
  openGraph: {
    title: "Employés IA",
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

const MEMORY = [
  { day: "Jour 1", fact: "Il découvre vos prospects et vous demande pour chaque envoi." },
  { day: "Jour 8", fact: "Il sait que <b>Marc a déjà été relancé</b> et ne recommence pas." },
  { day: "Jour 30", fact: "Il connaît votre ton, vos priorités, et vous ne validez plus que l'exceptionnel." },
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
            <Link href="/dashboard" className="lp-btn lp-btn--ghost">
              Voir le tableau de bord
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

      {/* ── IV. APRÈS ───────────────────────────────────────────── */}
      <section className="lp-sec" id="memoire">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Ce qui change avec le temps</span>
            <h2>Il apprend, donc vous validez de moins en moins.</h2>
            <p>
              Chaque mission laisse une trace dans sa mémoire. Ce n&apos;est pas un outil
              qu&apos;on configure une fois : c&apos;est un collaborateur qui vous connaît
              un peu mieux chaque semaine.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {MEMORY.map((m) => (
                <div className="lp-memo-cell" key={m.day}>
                  <div className="lp-memo-day">{m.day}</div>
                  <p className="lp-memo-fact" dangerouslySetInnerHTML={{ __html: m.fact }} />
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-sec" id="metiers">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">L&apos;équipe</span>
            <h2>Un seul moteur. Autant de métiers.</h2>
            <p>
              Même autonomie réglable, même traçabilité, même mémoire. Seul le métier
              change — et il s&apos;écrit en configuration, pas en code.
            </p>
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
              <Link href="/dashboard" className="lp-btn lp-btn--ghost">
                Voir une mission réelle
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-shell lp-foot-in">
          <span>© 2026 employés ia</span>
          <span>hébergement européen · journal permanent · rgpd</span>
        </div>
      </footer>
    </div>
  );
}
