// ════════════════════════════════════════════════════════════════════
// Landing publique — racine du site. Le dashboard vit sur /dashboard.
//
// Server Component : zéro JS pour le contenu, seuls la démo animée et
// les révélations au scroll sont hydratés côté client. C'est ce qui
// permet de tenir un Lighthouse élevé tout en gardant du mouvement.
//
// Discipline visuelle (audit skill brandkit) : un seul accent (mint)
// répété partout, typographie sparse, détails premium discrets, aucun
// visuel décoratif générique. La preuve (trace réelle de l'agent)
// remplace l'illustration.
// ════════════════════════════════════════════════════════════════════

import type { Metadata } from "next";
import Link from "next/link";
import { Logomark } from "@/components/Logomark";
import { Reveal } from "@/components/landing/Reveal";
import { AgentDemo } from "@/components/landing/AgentDemo";
import "./landing.css";

export const metadata: Metadata = {
  title: "Employés IA — Un employé numérique autonome, jamais hors de contrôle",
  description:
    "Recrutez un collaborateur numérique qui consulte vos données, arbitre et agit seul. Vous voyez chaque étape, et rien d'irréversible ne part sans votre accord.",
  openGraph: {
    title: "Employés IA",
    description:
      "Un employé numérique autonome sur ce qui est réversible, qui s'arrête sur ce qui ne l'est pas.",
    locale: "fr_FR",
    type: "website",
  },
};

const ROLES = [
  { name: "Commercial", desc: "Relance vos prospects et prépare vos rendez-vous.", live: true },
  { name: "Support", desc: "Traite les demandes clients et documente les réponses.", live: false },
  { name: "Comptabilité", desc: "Émet les factures et relance les impayés.", live: false },
  { name: "Marketing", desc: "Rédige et planifie vos campagnes.", live: false },
  { name: "Ressources humaines", desc: "Trie les candidatures et organise les entretiens.", live: false },
  { name: "Développement", desc: "Corrige les anomalies et tient la documentation à jour.", live: false },
];

export default function LandingPage() {
  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-shell lp-nav-in">
          <Link href="/" className="brand">
            <Logomark />
            Employés IA
          </Link>
          <div className="lp-nav-links">
            <a href="#principe">Principe</a>
            <a href="#deroule">Déroulé</a>
            <a href="#equipe">Métiers</a>
            <a href="#controle">Contrôle</a>
            <a href="#tarifs">Tarifs</a>
          </div>
          <Link href="/onboarding" className="lp-btn lp-btn--primary lp-btn--sm">
            Recruter
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <header className="lp-hero">
        <div className="lp-shell lp-hero-in">
          <span className="lp-eyebrow">Employé IA · Commercial — disponible</span>
          <h1>
            Il travaille seul.<br />
            <em>Il vous demande avant ce qui compte.</em>
          </h1>
          <p className="lp-hero-sub">
            Un collaborateur numérique qui consulte vos données, arbitre et agit. Vous voyez
            chaque étape en français. Rien d&apos;irréversible ne part sans votre accord.
          </p>
          <div className="lp-hero-cta">
            <Link href="/onboarding" className="lp-btn lp-btn--primary">
              Recruter mon employé
            </Link>
            <Link href="/dashboard" className="lp-btn lp-btn--ghost">
              Voir le tableau de bord
            </Link>
          </div>
          <p className="lp-hero-note">
            Configuration par conversation, en deux minutes. Sans carte bancaire.
          </p>

          <AgentDemo />
        </div>
      </header>

      {/* ─── Principe ─────────────────────────────────────────────── */}
      <section className="lp-section" id="principe">
        <div className="lp-shell">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">Le principe</span>
            <h2 className="lp-h2">L&apos;autonomie n&apos;a de valeur que si elle reste sous contrôle.</h2>
            <p className="lp-lead">
              Un employé à qui l&apos;on doit tout valider ne fait gagner aucun temps. Un employé
              qui décide de tout seul est ingérable. Nous avons tranché entre les deux.
            </p>
          </Reveal>

          <div className="lp-grid lp-grid--3">
            <Reveal delay={0}>
              <article className="lp-card">
                <div className="lp-card-n">01</div>
                <h3>Autonome sur le réversible</h3>
                <p>
                  Consulter vos données, comparer, prendre des notes, préparer un travail : il
                  le fait seul, sans jamais vous interrompre.
                </p>
                <div className="lp-card-note">
                  <b>Concrètement :</b> lecture et écriture interne en autonomie complète.
                </div>
              </article>
            </Reveal>

            <Reveal delay={80}>
              <article className="lp-card">
                <div className="lp-card-n">02</div>
                <h3>Il s&apos;arrête sur l&apos;irréversible</h3>
                <p>
                  Envoyer un email à un client, modifier une facture : il prépare, il vous
                  montre exactement ce qu&apos;il veut faire, et il attend.
                </p>
                <div className="lp-card-note">
                  <b>Réglable :</b> à chaque fois, une seule fois, ou jamais — vous choisissez
                  le niveau de confiance, par type d&apos;action.
                </div>
              </article>
            </Reveal>

            <Reveal delay={160}>
              <article className="lp-card">
                <div className="lp-card-n">03</div>
                <h3>Il se souvient</h3>
                <p>
                  Chaque mission enrichit sa mémoire. Il ne repart jamais de zéro et ne
                  relance jamais deux fois le même prospect par erreur.
                </p>
                <div className="lp-card-note">
                  <b>Après quelques jours :</b> il connaît vos comptes, vos priorités et votre
                  façon d&apos;écrire.
                </div>
              </article>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Déroulé ──────────────────────────────────────────────── */}
      <section className="lp-section" id="deroule">
        <div className="lp-shell">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">Le déroulé</span>
            <h2 className="lp-h2">Trois étapes, et vous n&apos;écrivez pas une ligne de configuration.</h2>
          </Reveal>

          <Reveal>
            <div className="lp-flow">
              <div className="lp-flow-item">
                <div className="lp-flow-n">01</div>
                <h3>Vous répondez à quelques questions</h3>
                <p>
                  Pas de panneau de réglages. Un assistant vous interroge sur votre activité,
                  vos clients types et votre façon de communiquer — puis façonne votre employé
                  à partir de vos réponses.
                </p>
              </div>
              <div className="lp-flow-item">
                <div className="lp-flow-n">02</div>
                <h3>Il se met au travail</h3>
                <p>
                  Il consulte vos données, choisit l&apos;action la plus utile et l&apos;exécute.
                  Vous n&apos;avez rien à piloter, rien à relancer.
                </p>
              </div>
              <div className="lp-flow-item">
                <div className="lp-flow-n">03</div>
                <h3>Vous gardez la main</h3>
                <p>
                  Chaque étape est lisible en français clair, en direct. Les actions sensibles
                  s&apos;affichent en entier et attendent votre accord.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Métiers ──────────────────────────────────────────────── */}
      <section className="lp-section" id="equipe">
        <div className="lp-shell">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">Les métiers</span>
            <h2 className="lp-h2">Un socle commun, des métiers spécialisés.</h2>
            <p className="lp-lead">
              Tous les employés partagent le même moteur : même autonomie réglable, même
              traçabilité, même mémoire. Seul le métier change.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-roster">
              {ROLES.map((r) => (
                <div className="lp-role" key={r.name}>
                  <div className="lp-role-top">
                    <span className="lp-role-name">{r.name}</span>
                    <span className={`lp-tag${r.live ? " lp-tag--live" : ""}`}>
                      {r.live ? "disponible" : "bientôt"}
                    </span>
                  </div>
                  <span className="lp-role-desc">{r.desc}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Contrôle ─────────────────────────────────────────────── */}
      <section className="lp-section" id="controle">
        <div className="lp-shell">
          <div className="lp-grid lp-grid--2" style={{ gap: 48, alignItems: "start" }}>
            <Reveal>
              <span className="lp-eyebrow">Contrôle et traçabilité</span>
              <h2 className="lp-h2">Vous ne déléguez rien que vous ne puissiez vérifier.</h2>
              <p className="lp-lead" style={{ marginBottom: 26 }}>
                Chaque décision, chaque action, chaque email est enregistré de façon
                permanente. Vous pouvez remonter n&apos;importe quelle mission, étape par
                étape, même six mois plus tard.
              </p>
              <Link href="/dashboard" className="lp-btn lp-btn--ghost">
                Voir une mission réelle
              </Link>
            </Reveal>

            <Reveal delay={90}>
              <div className="lp-trust">
                <div className="lp-trust-row">
                  <h4>Journal permanent</h4>
                  <p>
                    Chaque action est écrite dans un registre qui ne peut être ni modifié ni
                    effacé, y compris par l&apos;employé lui-même.
                  </p>
                </div>
                <div className="lp-trust-row">
                  <h4>Permissions par type d&apos;action</h4>
                  <p>
                    Lecture, modification, action définitive : vous fixez le niveau
                    d&apos;autonomie de chacune, indépendamment.
                  </p>
                </div>
                <div className="lp-trust-row">
                  <h4>Vos données restent les vôtres</h4>
                  <p>
                    Hébergement européen, cloisonnement strict entre clients, et aucune
                    donnée réelle transmise à un service qui l&apos;utiliserait pour son
                    apprentissage.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Tarifs ───────────────────────────────────────────────── */}
      <section className="lp-section" id="tarifs">
        <div className="lp-shell">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">Tarifs</span>
            <h2 className="lp-h2">Le coût d&apos;un outil. La charge de travail d&apos;un poste.</h2>
          </Reveal>

          <div className="lp-grid lp-grid--3">
            <Reveal delay={0}>
              <div className="lp-price">
                <div className="lp-price-tier">Découverte</div>
                <div className="lp-price-amt">Gratuit</div>
                <div className="lp-price-sub">Pour voir si ça tient ses promesses.</div>
                <ul>
                  <li>1 employé actif</li>
                  <li>Jusqu&apos;à 100 missions par mois</li>
                  <li>Journal et validations inclus</li>
                </ul>
                <Link href="/onboarding" className="lp-btn lp-btn--ghost">
                  Commencer
                </Link>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="lp-price lp-price--hot">
                <div className="lp-price-tier">Business</div>
                <div className="lp-price-amt">
                  790&nbsp;€ <span>/ mois</span>
                </div>
                <div className="lp-price-sub">Environ quatre fois moins qu&apos;un poste équivalent.</div>
                <ul>
                  <li>Employés illimités</li>
                  <li>Missions illimitées</li>
                  <li>Autonomie réglable par action</li>
                  <li>Connexion à vos outils existants</li>
                </ul>
                <Link href="/onboarding" className="lp-btn lp-btn--primary">
                  Recruter
                </Link>
              </div>
            </Reveal>

            <Reveal delay={160}>
              <div className="lp-price">
                <div className="lp-price-tier">Entreprise</div>
                <div className="lp-price-amt">Sur mesure</div>
                <div className="lp-price-sub">Volume, conformité et accompagnement dédié.</div>
                <ul>
                  <li>Engagement de service</li>
                  <li>Employés sur mesure</li>
                  <li>Accompagnement conformité</li>
                </ul>
                <a href="mailto:contact@employes-ia.com" className="lp-btn lp-btn--ghost">
                  Nous écrire
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── CTA final ────────────────────────────────────────────── */}
      <section className="lp-final">
        <div className="lp-shell">
          <Reveal>
            <h2>Votre premier employé peut commencer aujourd&apos;hui.</h2>
            <p>Deux minutes de conversation, et il se met au travail.</p>
            <div className="lp-hero-cta">
              <Link href="/onboarding" className="lp-btn lp-btn--primary">
                Recruter mon employé
              </Link>
              <Link href="/dashboard" className="lp-btn lp-btn--ghost">
                Voir le tableau de bord
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
