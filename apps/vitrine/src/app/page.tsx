// ════════════════════════════════════════════════════════════════════
// LANDING — elle raconte le parcours RÉEL, et rien d'autre.
//
// ⚠️ RÉÉCRITE LE 2026-08-27, ET IL FAUT SAVOIR CONTRE QUOI.
//
// La version précédente promettait six étapes après le recrutement —
// une conversation qui façonne l'employé, un choix entre plusieurs
// profils, une construction visible à l'écran. Son propre commentaire
// avouait : « rien ici n'est encore câblé ». Deux descriptions
// contradictoires du même produit vivaient sur le même site, et le
// visiteur n'avait aucun moyen de savoir laquelle était vraie
// (constat A3.3 de `docs/32`).
//
// C'est le reproche numéro un fait aux concurrents dans les avis
// publics : la démonstration ne ressemble pas au produit livré. Écrire
// une page qui décrit un produit qu'on n'a pas, c'est se placer
// exactement là où ils sont.
//
// Chaque bloc ci-dessous correspond donc à quelque chose qui EXISTE :
//
//   · la conversation             → /diagnostic
//   · la composition              → packages/domain, `recommend()`
//   · l'email de présentation     → packages/domain, `redigerLaPresentation()`
//   · le mot de passe et l'espace → /acces puis /espace
//   · les quatre « jamais »       → quatre garanties tenues par la base
//   · les trois commandes         → l'autonomie, l'arrêt, les accords
//
// ⚠️ ET AUCUN PRIX. Décision du fondateur le 2026-08-27 : c'est gratuit
// pour l'instant, les formules viendront après. La grille précédente
// vendait 33 fonctionnalités dont presque aucune n'existait, dont un
// engagement de disponibilité chiffré sur une infrastructure gratuite.
// Elle est partie avec cette réécriture.
// ════════════════════════════════════════════════════════════════════

import type { Metadata } from "next";

import { DONNEES_EXPLIQUEES } from "@sentio/domain";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { RecruitLink } from "@/components/landing/RecruitLink";
import { CoreStage } from "@/components/landing/CoreStage";
import { Mission } from "@/components/landing/Mission";
import { Threshold } from "@/components/landing/Threshold";
import { Reveal } from "@/components/landing/Reveal";
import { Advisor } from "@/components/landing/Advisor";
import { ScrollNav } from "@/components/landing/ScrollNav";
import "./landing.css";

export const metadata: Metadata = {
  title: "Sentio : un employé numérique composé pour votre entreprise",
  description:
    "Vous racontez votre situation, Sentio compose votre employé à partir de vos réponses. Il travaille seul, et rien ne part sans votre accord. Gratuit pour l'instant.",
  openGraph: {
    title: "Sentio",
    description: "Un employé numérique composé pour votre entreprise, à partir de ce que vous dites.",
    locale: "fr_FR",
    type: "website",
  },
};

// ── Disponibilité ────────────────────────────────────────────────────
// Le seul argument économique qu'on puisse tenir sans client pour le
// prouver : une comparaison d'heures. 1 607 h est la durée légale du
// travail en France et 8 760 h le nombre d'heures d'une année. Deux
// chiffres vérifiables par n'importe qui, zéro pourcentage
//
// ⚠️ UNE TROISIÈME CARTE A ÉTÉ RETIRÉE : « un cycle toutes les 20
// minutes, c'est la fréquence programmée ». Elle se présentait comme le
// chiffre le plus vérifiable des trois, et elle était fausse — la
// planification était commentée dans le dépôt (constat A3.4 de
// docs/32), et le cycle lui-même a été retiré avec l'ancienne
// génération (adr/0030). Ne pas la remettre sans une planification qui
// tourne vraiment : c'est la seule des trois qu'un client pourrait
// prendre en défaut.
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

// ── Comment vous l'obtenez ──────────────────────────────────────────
// Quatre étapes, et les quatre existent. C'est le parcours qu'on peut
// jouer aujourd'hui, de la première question à l'espace privé.
const PARCOURS = [
  {
    cle: "conversation",
    rang: "01 · Vous racontez",
    titre: "Une conversation, pas un formulaire",
    texte: (
      <>
        Ce que vous vendez, à qui, ce qui vous ralentit, ce que vous voulez atteindre. Sentio pose
        les questions et <b>s&apos;arrête quand il a compris</b>. Aucune case à cocher, aucun menu
        déroulant.
      </>
    ),
  },
  {
    cle: "composition",
    rang: "02 · Sentio compose",
    titre: "Votre employé se dessine sous vos yeux",
    texte: (
      <>
        Son métier, ses priorités, ce qu&apos;il saura faire : tout est <b>déduit de vos
        réponses</b>. Deux dirigeants qui répondent différemment reçoivent deux employés
        différents. Rien n&apos;est choisi dans un catalogue.
      </>
    ),
  },
  {
    cle: "refus",
    rang: "03 · Ou il vous le dit",
    titre: "Si ce n'est pas pour vous, on vous le dit",
    texte: (
      <>
        Quand ce qui vous bloque n&apos;est pas ce qu&apos;un employé numérique sait régler, la
        conversation le dit et <b>s&apos;arrête là</b>. Nous préférons vous perdre maintenant que
        vous vendre quelqu&apos;un qui ne réglerait pas le problème.
      </>
    ),
  },
  {
    cle: "arrivee",
    rang: "04 · Vous le recevez",
    titre: "Par email, puis chez vous",
    texte: (
      <>
        Un message vous présente qui il est, ce qu&apos;il fera et <b>ce qu&apos;il ne fera
        jamais</b>. Vous choisissez votre mot de passe, et vous entrez dans votre espace. Aucun
        mot de passe ne vous est jamais envoyé.
      </>
    ),
  },
];

// ── Ce qui n'arrivera jamais ────────────────────────────────────────
// ⚠️ Ces quatre lignes ne sont pas du marketing : chacune correspond à
// une garantie tenue par la BASE, pas par une intention.
//
//   1. l'accord avant tout envoi  → standing_approval + le cliquet ;
//   2. seul le dirigeant élargit  → déclencheur, pas convention ;
//   3. jamais de rôle changé seul → une réévaluation publie INACTIF ;
//   4. étanchéité entre clients   → verify_tenant_isolation, adr/0014.
//
// Les écrire sans qu'elles soient vraies serait exactement le mensonge
// que ce produit ne peut pas se permettre.
const JAMAIS = [
  {
    cle: "accord",
    rang: "Aucun envoi sans vous",
    titre: "Vous lisez avant que ça parte",
    texte: (
      <>
        Chaque message vous est soumis avec <b>son texte exact</b> et le nom de l&apos;entreprise à
        qui il s&apos;adresse. Jamais « une action attend votre accord ».
      </>
    ),
  },
  {
    cle: "cliquet",
    rang: "L'autonomie ne s'élargit pas seule",
    titre: "Rien ne peut se donner plus de liberté",
    texte: (
      <>
        N&apos;importe quoi peut la restreindre. <b>Vous seul pouvez l&apos;ouvrir</b>, et ça se
        retire aussi vite que ça se donne.
      </>
    ),
  },
  {
    cle: "role",
    rang: "Le métier ne change pas sans vous",
    titre: "Il propose, vous décidez",
    texte: (
      <>
        Si les résultats suggèrent autre chose, la proposition vous est soumise <b>terme à
        terme</b> : ce qu&apos;il fait aujourd&apos;hui, ce qu&apos;il ferait, et surtout ce
        qu&apos;il cesserait de faire.
      </>
    ),
  },
  {
    cle: "usage",
    rang: DONNEES_EXPLIQUEES.titre,
    titre: "Il apprend de vous, pour vous",
    texte: (
      <>
        {DONNEES_EXPLIQUEES.corps} <b>Il ne part de rien</b> et devient le vôtre.
      </>
    ),
  },
  {
    cle: "etancheite",
    rang: "Rien ne traverse d'un client à l'autre",
    titre: "Et ça s'arrête à votre entreprise",
    texte: (
      <>
        Aucune donnée ne circule vers un autre client. <b>Jamais, même agrégée, même
        anonymisée</b>, même si on nous le demandait.
      </>
    ),
  },
  {
    cle: "silence",
    rang: "Il s'arrête tout seul",
    titre: "Quarante silences, et il vous prévient",
    texte: (
      <>
        Après quarante entreprises approchées sans la moindre réponse, le travail{" "}
        <b>s&apos;interrompt de lui-même</b>. Un collaborateur qui parle dans le vide vous coûte
        votre réputation, pas seulement son temps.
      </>
    ),
  },
];

// ── Ce que vous gardez en main ──────────────────────────────────────
// Les trois commandes qui existent réellement dans l'espace client :
// le réglage d'autonomie (trois niveaux), le bouton d'arrêt, et les
// accords. Rien d'annoncé ici n'est à construire.
const COMMANDES = [
  {
    cle: "autonomie",
    rang: "Son autonomie",
    titre: "Trois niveaux, et vous en changez quand vous voulez",
    texte: (
      <>
        Il vous demande à chaque fois, il vous demande la première fois, ou il agit seul.{" "}
        <b>Chaque changement est daté</b>, et vous savez qui l&apos;a décidé.
      </>
    ),
  },
  {
    cle: "arret",
    rang: "Le bouton d'arrêt",
    titre: "Tout s'arrête, immédiatement",
    texte: (
      <>
        Un bouton, et plus rien ne part. <b>Sans préavis à donner</b>, sans conversation à avoir,
        sans rien à justifier. Vous le relancez quand vous voulez.
      </>
    ),
  },
  {
    cle: "accords",
    rang: "Ce qui attend votre réponse",
    titre: "Vous voyez ce que vous autorisez",
    texte: (
      <>
        Chaque bouton dit ce qu&apos;il déclenche : <b>si vous autorisez, ce message part tel
        quel ; si vous refusez, il ne partira pas</b>. Pas « autoriser » tout court.
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
          <span className="lp-hero-tag">Gratuit pour l&apos;instant</span>
          <h1>
            <span>Il travaille seul.</span>
            <span>Il vous demande.</span>
          </h1>
          <p className="lp-hero-sub">
            Un employé numérique composé pour votre entreprise, à partir de ce que vous racontez.
            Il ouvre vos données, arbitre et agit, la nuit, le dimanche, en août. Vous voyez chaque
            décision, et rien d&apos;irréversible ne part sans vous.
          </p>
          <div className="lp-hero-act">
            <RecruitLink href="/diagnostic" className="lp-btn lp-btn--primary">
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

      {/* ── COMMENT VOUS L'OBTENEZ ──────────────────────────────── */}
      <section className="lp-sec" id="parcours">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Comment vous l&apos;obtenez</span>
            <h2>Vous racontez. Sentio compose.</h2>
            <p>
              Il n&apos;y a pas de catalogue à parcourir, pas de formule à comparer. Vous décrivez
              votre situation, et votre employé se dessine à partir de ce que vous avez dit.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {PARCOURS.map((p) => (
                <div className="lp-memo-cell" key={p.cle}>
                  <div className="lp-memo-day">{p.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{p.titre}.</b> {p.texte}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CE QUI N'ARRIVERA JAMAIS ────────────────────────────────
             La section la plus importante de la page. Ce qui inquiète un
             dirigeant, ce n'est pas ce qu'un employé numérique sait faire,
             c'est ce qu'il pourrait faire sans lui. ────────────────────*/}
      <section className="lp-sec" id="jamais">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Ce qui n&apos;arrivera jamais</span>
            <h2>Ce qu&apos;il ne fera pas compte plus que le reste.</h2>
            <p>
              Chacune de ces lignes est tenue par la base de données, pas par une promesse.
              Elles ne se désactivent pas, et nous ne pouvons pas les lever nous-mêmes.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {JAMAIS.map((j) => (
                <div className="lp-memo-cell" key={j.cle}>
                  <div className="lp-memo-day">{j.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{j.titre}.</b> {j.texte}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CE QUE VOUS GARDEZ EN MAIN ──────────────────────────────── */}
      <section className="lp-sec" id="commandes">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Ce que vous gardez en main</span>
            <h2>Il se règle. Il ne se subit pas.</h2>
            <p>
              Un collaborateur qu&apos;on ne peut pas cadrer est un gadget. Trois commandes
              suffisent, et aucune n&apos;est technique.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              {COMMANDES.map((c) => (
                <div className="lp-memo-cell" key={c.cle}>
                  <div className="lp-memo-day">{c.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{c.titre}.</b> {c.texte}
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

      {/* ── GRATUIT POUR L'INSTANT ──────────────────────────────────
             ⚠️ Ce qui était ici : trois formules à 499, 1 999 et 9 999 €
             par mois, vendant 33 fonctionnalités dont presque aucune
             n'existait — jusqu'à un engagement de disponibilité chiffré
             sur une infrastructure gratuite (constat A3.1 de docs/32).
             Décision du fondateur le 2026-08-27 : c'est gratuit, et les
             formules viendront quand elles seront vraies. ─────────────*/}
      <section className="lp-sec" id="prix">
        <div className="lp-shell">
          <Reveal className="lp-sec-head">
            <span className="lp-mono">Combien</span>
            <h2>Rien, pour l&apos;instant.</h2>
            <p>
              Sentio est en début de vie. Nous préférons quelques dirigeants qui s&apos;en servent
              vraiment à une grille de prix qui promettrait ce que nous n&apos;avons pas encore.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-memo">
              <div className="lp-memo-cell">
                <div className="lp-memo-day">Aujourd&apos;hui</div>
                <div className="lp-memo-fact">
                  <b>Gratuit, sans carte bancaire.</b> Vous parlez à Sentio, vous recevez votre
                  employé, vous l&apos;utilisez. Aucun moyen de paiement ne vous est demandé, à
                  aucun moment.
                </div>
              </div>
              <div className="lp-memo-cell">
                <div className="lp-memo-day">Plus tard</div>
                <div className="lp-memo-fact">
                  <b>Des formules, quand elles seront vraies.</b> Elles diront ce que le produit
                  fait, pas ce qu&apos;on aimerait qu&apos;il fasse. Vous serez prévenu avant, et
                  rien ne vous sera prélevé sans que vous l&apos;ayez accepté.
                </div>
              </div>
              <div className="lp-memo-cell">
                <div className="lp-memo-day">Ce que ça vous coûte</div>
                <div className="lp-memo-fact">
                  <b>Une conversation.</b> Et si ce que vous décrivez n&apos;est pas ce
                  qu&apos;un employé numérique sait régler, on vous le dit et on s&apos;arrête là.
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-end">
        <div className="lp-shell">
          <Reveal>
            <h2>Commencez par lui raconter votre situation.</h2>
            <p>
              Quelques minutes de conversation, et vous saurez si Sentio peut vous aider. Y compris
              si la réponse est non.
            </p>
            <div className="lp-th-act">
              <RecruitLink href="/diagnostic" className="lp-btn lp-btn--primary">
                Parler à Sentio
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
