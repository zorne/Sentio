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
  title: "Sentio : ils travaillent seuls. Ils vous demandent avant ce qui compte.",
  description:
    "Des employés numériques qui consultent vos données, arbitrent et agissent : 8 760 heures par an contre 1 607 pour un salarié. Vous voyez chaque étape. Rien d'irréversible ne part sans votre accord.",
  openGraph: {
    title: "Sentio",
    description: "Ils travaillent seuls. Ils vous demandent avant ce qui compte.",
    locale: "fr_FR",
    type: "website",
  },
};

// ── Disponibilité ────────────────────────────────────────────────────
// Le seul argument économique qu'on puisse tenir sans client pour le
// prouver : une comparaison d'heures. 1 607 h est la durée légale du
// travail en France, 8 760 h le nombre d'heures d'une année, et les
// vingt minutes sont la fréquence réelle du cron (.github/workflows/
// prospect-cron.yml). Trois chiffres vérifiables, zéro pourcentage
// inventé — une allégation chiffrée invérifiable est une pratique
// commerciale trompeuse (art. L121-2), et nous n'avons aucune donnée
// client derrière un « +40 % de CA ».
const DISPONIBILITE = [
  {
    cle: "salarie",
    rang: "Un salarié",
    titre: "1 607 heures par an",
    texte: (
      <>
        C&apos;est la durée légale du travail en France. Retirez encore les congés, les onze jours
        fériés, les arrêts, les trajets, les réunions, <b>et les nuits</b>.
      </>
    ),
  },
  {
    cle: "numerique",
    rang: "Un employé numérique",
    titre: "8 760 heures par an",
    texte: (
      <>
        Il n&apos;y a pas de calcul caché derrière ce nombre : <b>c&apos;est une année entière</b>.
        Pas de pause déjeuner, pas de vendredi après-midi, pas de mois d&apos;août.
      </>
    ),
  },
  {
    cle: "rythme",
    rang: "Le rythme réel",
    titre: "Un cycle toutes les 20 minutes",
    texte: (
      <>
        Ce n&apos;est pas une façon de parler : <b>c&apos;est la fréquence programmée</b>, nuit et
        week-end compris. Il reprend son travail pendant que vous dormez.
      </>
    ),
  },
  {
    cle: "samedi",
    rang: "Ce que vous ratiez",
    titre: "Le prospect du samedi soir",
    texte: (
      <>
        Celui qui vous découvre à 23 h un samedi n&apos;attend pas votre lundi matin. Il a déjà{" "}
        <b>une réponse</b> quand vous rouvrez votre boîte.
      </>
    ),
  },
  {
    cle: "dormant",
    rang: "Ce que vous perdiez",
    titre: "Le devis de l'an dernier",
    texte: (
      <>
        Quarante jours de silence sur une affaire à cinq chiffres. Personne chez vous n&apos;a le
        temps de la reprendre. <b>Lui n&apos;a que ça à faire.</b>
      </>
    ),
  },
  {
    cle: "gain",
    rang: "Ce que vous récupérez",
    titre: "Du temps, et des affaires",
    texte: (
      <>
        Les heures que vous passiez à relancer, et le chiffre que vous perdiez par oubli. Nous
        n&apos;avancerons pas de pourcentage : <b>nous n&apos;avons pas encore de client pour le prouver</b>.
      </>
    ),
  },
  {
    cle: "vitesse",
    rang: "Sa vitesse",
    titre: "Il ne s'interrompt jamais",
    texte: (
      <>
        Lire une fiche, comparer des prospects, rédiger une relance : un salarié fait ça entre
        deux réunions, un appel, une pause café. <b>Lui va d&apos;un bout à l&apos;autre sans
        détour</b>, la tâche entière en une seule fois.
      </>
    ),
  },
];

// ── Réglage ──────────────────────────────────────────────────────────
// Chacun des trois correspond à une commande qui existe réellement :
// ProspectingConfig (deux champs), ApproveControls (la case « faire
// confiance pour les prochaines fois », qui écrit une standing approval),
// et le bouton de démarrage/arrêt. Rien d'annoncé ici n'est à construire.
const REGLAGE = [
  {
    cle: "perimetre",
    rang: "Son périmètre",
    titre: "Vous l'écrivez avec vos mots",
    texte: (
      <>
        Ce qu&apos;est un bon prospect chez vous, et l&apos;offre qu&apos;il met en avant.{" "}
        <b>Deux champs libres</b>, remplis une fois : ni cases à cocher, ni menu déroulant.
      </>
    ),
  },
  {
    cle: "autonomie",
    rang: "Son autonomie",
    titre: "Vous l'élargissez quand vous voulez",
    texte: (
      <>
        À chaque décision qu&apos;il vous soumet, une case : <b>« faire confiance pour les
        prochaines fois »</b>. Vous lui accordez les envois le jour où vous êtes prêt, pas avant.
      </>
    ),
  },
  {
    cle: "rythme",
    rang: "Son rythme",
    titre: "Vous le lancez, vous l'arrêtez",
    texte: (
      <>
        Un bouton pour le mettre au travail, un autre pour le suspendre. <b>Il s&apos;arrête
        immédiatement</b>, sans préavis à donner ni conversation à avoir.
      </>
    ),
  },
];

// ── Après le recrutement ────────────────────────────────────────────
// Décrit le parcours voulu par le fondateur, pas ce que le produit fait
// aujourd'hui : la conversation qui construit l'agent visuellement,
// le choix parmi plusieurs profils, la fiche de résultats. Rien ici
// n'est encore câblé — /plans (« Le déroulé ») décrit le parcours
// RÉEL actuel (deux champs, pas de conversation, pas de choix). Les
// deux textes divergent volontairement tant que celui-ci n'est pas
// construit ; à réconcilier au moment de l'implémenter.
const APRES_RECRUTEMENT = [
  {
    cle: "espace",
    rang: "01 · Votre espace",
    titre: "Vous quittez cette page, pour de bon",
    texte: (
      <>
        Le recrutement vous ouvre un espace privé. Toute la suite <b>s&apos;y déroule</b> : la
        conversation, le suivi, les résultats. Vous n&apos;avez plus de raison d&apos;y revenir.
      </>
    ),
  },
  {
    cle: "conversation",
    rang: "02 · La conversation",
    titre: "Vous parlez à Sentio avant toute chose",
    texte: (
      <>
        Pas de formulaire à remplir seul dans un coin : <b>Sentio vous pose les questions qui
        comptent</b>, sur votre activité, vos objectifs, ce qui vous ralentit.
      </>
    ),
  },
  {
    cle: "choix",
    rang: "03 · Vous choisissez",
    titre: "Sentio propose, vous décidez",
    texte: (
      <>
        Selon vos réponses, plusieurs profils d&apos;employé se dessinent. <b>Vous choisissez
        celui qui vous correspond</b>, jamais un catalogue imposé.
      </>
    ),
  },
  {
    cle: "construction",
    rang: "04 · Il se construit",
    titre: "Vous le voyez prendre forme",
    texte: (
      <>
        Une fois choisi, il se construit sous vos yeux. <b>Pas une ligne de code affichée</b>,
        juste ce qu&apos;il devient, en train de se faire.
      </>
    ),
  },
  {
    cle: "cadrage",
    rang: "05 · Son terrain de jeu",
    titre: "Vous lui donnez ce qui lui manque",
    texte: (
      <>
        Le profil d&apos;un bon prospect chez vous, les informations qui comptent avant qu&apos;il
        agisse. <b>Vous validez</b>, et il se met au travail.
      </>
    ),
  },
  {
    cle: "resultats",
    rang: "06 · Sa fiche, ses chiffres",
    titre: "Vous voyez tout, sans avoir à demander",
    texte: (
      <>
        Sa fiche de poste, le chiffre d&apos;affaires généré, son taux de conversion, les
        prospects contactés et ceux réellement intéressés. <b>Aucun chiffre décoratif</b> : que
        ce qui compte pour vous.
      </>
    ),
  },
];

// ── Le retard ────────────────────────────────────────────────────────
// Une conviction, annoncée comme telle. Aucune étude n'est citée parce
// qu'aucune n'est vérifiée — et une statistique inventée sur ce sujet
// serait exactement le genre de page qu'un dirigeant a déjà vue trente
// fois, donc contre-productive en plus d'être fausse.
const RETARD = [
  {
    cle: "conviction",
    rang: "Ce que nous pensons",
    titre: "Ça deviendra la norme",
    texte: (
      <>
        Comme le site web, comme le terminal de paiement. <b>Plus personne ne se demande s&apos;il
        en faut un</b>. On se demande seulement pourquoi certains n&apos;en ont toujours pas.
      </>
    ),
  },
  {
    cle: "ecart",
    rang: "Ce que ça implique",
    titre: "L'écart se creuse lentement",
    texte: (
      <>
        Pas d&apos;un coup, et c&apos;est ce qui le rend difficile à voir : <b>un prospect relancé
        pendant que le vôtre attend</b>, répété chaque jour pendant deux ans.
      </>
    ),
  },
  {
    cle: "cout",
    rang: "Ce que ça vous coûte",
    titre: "Attendre a un prix",
    texte: (
      <>
        Et ce n&apos;est pas celui de l&apos;abonnement. C&apos;est <b>le temps qu&apos;il faudra
        pour rattraper</b> ceux qui n&apos;auront pas attendu.
      </>
    ),
  },
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
            <span>Ils travaillent seuls.</span>
            <span>Ils vous demandent.</span>
          </h1>
          <p className="lp-hero-sub">
            Des employés numériques qui ouvrent vos données, arbitrent et agissent, la nuit, le
            dimanche, en août. Vous voyez chaque décision. Rien d&apos;irréversible ne part sans
            vous.
          </p>
          <div className="lp-hero-act">
            <RecruitLink href="/plans" className="lp-btn lp-btn--primary">
              Recruter mon employé
            </RecruitLink>
          </div>
        </div>

      </header>

      {/* ── II. MISSION ─────────────────────────────────────────── */}
      <Mission />

      {/* ── III. SEUIL ──────────────────────────────────────────── */}
      <Threshold />

      {/* ── LA DISPONIBILITÉ ────────────────────────────────────── */}
      <section className="lp-sec" id="disponibilite">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">La disponibilité</span>
            <h2>Il n&apos;a ni week-end, ni mois d&apos;août.</h2>
            <p>
              La comparaison n&apos;est pas une figure de style, c&apos;est une soustraction. Voici
              les seuls chiffres que nous puissions tenir, et d&apos;où ils viennent.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {DISPONIBILITE.map((d) => (
                <div className="lp-memo-cell" key={d.cle}>
                  <div className="lp-memo-day">{d.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{d.titre}.</b> {d.texte}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── LE RÉGLAGE ──────────────────────────────────────────── */}
      <section className="lp-sec" id="reglage">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Le réglage</span>
            <h2>Il se règle. Il ne se subit pas.</h2>
            <p>
              Un collaborateur qu&apos;on ne peut pas cadrer est un gadget. Trois réglages suffisent,
              et aucun n&apos;est technique.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {REGLAGE.map((r) => (
                <div className="lp-memo-cell" key={r.cle}>
                  <div className="lp-memo-day">{r.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{r.titre}.</b> {r.texte}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

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
              Un conseiller Sentio répond sur le produit, son fonctionnement, ses limites
              et ses tarifs. Il ne sort jamais de ce périmètre.
            </p>
          </Reveal>

          <Reveal>
            <Advisor />
          </Reveal>
        </div>
      </section>

      {/* ── APRÈS LE RECRUTEMENT ────────────────────────────────────
          Vision du fondateur, pas le comportement actuel du produit —
          voir le commentaire au-dessus d'APRES_RECRUTEMENT. ──────────*/}
      <section className="lp-sec" id="apres-recrutement">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Après le recrutement</span>
            <h2>Le recrutement n&apos;est que le premier geste.</h2>
            <p>
              Six étapes vous séparent d&apos;un employé qui travaille vraiment pour vous, de la
              conversation qui le façonne à la fiche qui prouve son travail.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {APRES_RECRUTEMENT.map((a) => (
                <div className="lp-memo-cell" key={a.cle}>
                  <div className="lp-memo-day">{a.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{a.titre}.</b> {a.texte}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── LE RETARD ───────────────────────────────────────────── */}
      <section className="lp-sec" id="retard">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Le retard</span>
            <h2>Dans quelques années, la question ne se posera plus.</h2>
            <p>
              Nous n&apos;avons pas d&apos;étude à vous citer, et nous n&apos;allons pas en inventer
              une. Nous avons une conviction : la voici en clair, à vous d&apos;en faire ce que vous
              voulez.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {RETARD.map((r) => (
                <div className="lp-memo-cell" key={r.cle}>
                  <div className="lp-memo-day">{r.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{r.titre}.</b> {r.texte}
                  </div>
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
            <h2>Choisissez la génération de votre équipe.</h2>
            <p>
              Trois paliers, pas trois quotas différents : chacun change ce que vos employés numériques
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
            <h2>Une équipe commence par une personne.</h2>
            <p>Deux minutes pour le cadrer, et il travaille pendant que vous fermez boutique.</p>
            <div className="lp-th-act">
              <RecruitLink href="/plans" className="lp-btn lp-btn--primary">
                Recruter mon employé
              </RecruitLink>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-shell lp-foot-in">
          <span>© 2026 Sentio</span>
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
