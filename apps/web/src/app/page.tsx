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
import { RecruitLink } from "@/components/landing/RecruitLink";
import { PlanCard } from "@/components/landing/PlanCard";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { CoreStage } from "@/components/landing/CoreStage";
import { Mission } from "@/components/landing/Mission";
import { Threshold } from "@/components/landing/Threshold";
import { Reveal } from "@/components/landing/Reveal";
import { Advisor } from "@/components/landing/Advisor";
import { ScrollNav } from "@/components/landing/ScrollNav";
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
  { slug: "commercial", name: "Commercial", desc: "Relance vos prospects, prépare vos rendez-vous.", live: true },
  { slug: "support", name: "Support", desc: "Traite les demandes, documente les réponses.", live: false },
  { slug: "comptabilite", name: "Comptabilité", desc: "Émet les factures, relance les impayés.", live: false },
  { slug: "marketing", name: "Marketing", desc: "Rédige et planifie vos campagnes.", live: false },
  { slug: "rh", name: "Ressources humaines", desc: "Trie les candidatures, organise les entretiens.", live: false },
];


export default function LandingPage() {
  return (
    <div className="lp">
      <Nav />
      <ScrollNav />

      {/* ── I. PRÉSENCE ─────────────────────────────────────────── */}
      <header className="lp-hero" id="hero">
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
            <RecruitLink href="/onboarding" className="lp-btn lp-btn--primary">
              Recruter mon employé
            </RecruitLink>
          </div>
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
            <p>Choisissez votre agent — il vous accompagne dès l&apos;interview.</p>
          </Reveal>

          <Reveal>
            <div className="lp-roles">
              {ROLES.map((r) => (
                <RecruitLink href={`/onboarding?agent=${r.slug}`} className="lp-role" key={r.slug}>
                  <div className="lp-role-l">
                    <span className="lp-role-name">{r.name}</span>
                    <span className="lp-role-desc">{r.desc}</span>
                  </div>
                  <span className={`lp-role-state${r.live ? " is-live" : ""}`}>
                    {r.live ? "en service" : "bientôt"}
                  </span>
                </RecruitLink>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-sec" id="tarifs">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Tarifs</span>
            <h2>Choisissez la génération de votre équipe.</h2>
            <p>
              Trois paliers, pas trois quotas différents — chacun change ce que vos employés IA
              sont capables de faire seuls.
            </p>
          </Reveal>

          <div className="lp-plans">
            {PLAN_ORDER.map((id, i) => (
              <Reveal key={id} delay={i * 90}>
                <PlanCard plan={PLANS[id]} ctaHref={`/checkout?plan=${id}`} ctaLabel={`Choisir ${PLANS[id].name}`} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-end">
        <div className="lp-shell">
          <Reveal>
            <h2>Il peut commencer aujourd&apos;hui.</h2>
            <p>Deux minutes de conversation, et il se met au travail.</p>
            <div className="lp-th-act">
              <RecruitLink href="/onboarding" className="lp-btn lp-btn--primary">
                Recruter mon employé
              </RecruitLink>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-shell lp-foot-in">
          <span>© 2026 SENTIA</span>
          <div className="lp-foot-links">
            <Link href="/legal/confidentialite">Confidentialité</Link>
            <Link href="/legal/cgu">Conditions</Link>
            <Link href="/legal/mentions">Mentions légales</Link>
            <Link href="/legal/rgpd">Vos droits</Link>
          </div>
          <span>hébergement européen · rgpd</span>
        </div>
      </footer>
    </div>
  );
}
