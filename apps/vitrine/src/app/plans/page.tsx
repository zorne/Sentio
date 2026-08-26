import Link from "next/link";
import type { Metadata } from "next";
import { Logomark } from "@/components/Logomark";
import { PlanCard } from "@/components/landing/PlanCard";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "Ce qui se passe après | Sentio",
  description:
    "Le déroulé complet après le recrutement : votre espace privé, le cadrage de votre employé numérique, et ce qu'il attend de vous pour travailler.",
};

// ════════════════════════════════════════════════════════════════════
// /plans — la deuxième page du parcours. Elle ne vend plus une grille de
// prix : elle répond à la seule question qu'on se pose après avoir cliqué
// « Recruter » — qu'est-ce qui va se passer, et qu'est-ce qu'on attend de
// moi ? Le choix de formule vient après, une fois la réponse donnée.
//
// Règle d'écriture, non négociable : on n'annonce ici QUE ce que le
// produit fait réellement aujourd'hui. Le paiement en ligne n'est pas
// branché (CheckoutAction le dit déjà à l'écran) — l'étape 01 le dit donc
// aussi, plutôt que de laisser croire à une facture automatique. Le
// cadrage se fait par deux champs sur le tableau de bord
// (ProspectingConfig), pas par une conversation : l'étape 03 décrit les
// deux champs, pas un chat.
//
// /plans reçoit éventuellement le contexte de l'employé qu'on vient de
// configurer (tenant, agent) — on le reporte sur /checkout pour que le
// paiement sache pour quel employé il s'engage. Un accès direct (depuis
// la landing) n'a simplement pas ce contexte, /checkout reste utilisable
// sans.
// ════════════════════════════════════════════════════════════════════

/** Le déroulé réel, de la formule choisie au premier email envoyé. */
const ETAPES = [
  {
    rang: "Étape 01",
    titre: "Vous choisissez une formule",
    texte: (
      <>
        Le paiement en ligne n&apos;est <b>pas encore activé</b> : votre choix est enregistré, vous
        laissez une adresse email, et vous recevez un lien d&apos;accès. Aucune carte bancaire ne
        vous est demandée à cette étape.
      </>
    ),
  },
  {
    rang: "Étape 02",
    titre: "Vous ouvrez votre espace",
    texte: (
      <>
        Le lien reçu par email vous connecte directement, <b>sans mot de passe à retenir</b>.
        Tout se passe ensuite dans cet espace privé : vous ne revenez plus sur cette page.
      </>
    ),
  },
  {
    rang: "Étape 03",
    titre: "Vous cadrez son travail",
    texte: (
      <>
        Deux questions à remplir une seule fois : <b>à quoi ressemble un bon prospect chez vous</b>,
        et <b>quelle offre il doit mettre en avant</b>. C&apos;est tout ce dont il a besoin pour
        commencer.
      </>
    ),
  },
  {
    rang: "Étape 04",
    titre: "Il se met au travail seul",
    texte: (
      <>
        Il cherche des prospects qui correspondent à votre description, les qualifie, les ajoute à
        votre liste et rédige les relances. <b>Vous n&apos;avez rien à lancer chaque matin.</b>
      </>
    ),
  },
  {
    rang: "Étape 05",
    titre: "Il s'arrête avant l'irréversible",
    texte: (
      <>
        Lire vos données et préparer un message, il le fait seul. <b>Envoyer en votre nom, non.</b>{" "}
        Chaque envoi vous est soumis, et vous approuvez ou refusez.
      </>
    ),
  },
  {
    rang: "Étape 06",
    titre: "Vous suivez, sans piloter",
    texte: (
      <>
        Votre espace montre les tâches en cours, les prospects trouvés et les décisions en attente.{" "}
        <b>Chaque action reste tracée</b>, y compris celles qu&apos;il a prises seul.
      </>
    ),
  },
];

/** Ce qui est réellement demandé au client — et rien de plus. */
const ATTENDU = [
  {
    rang: "Ce que vous fournissez",
    titre: "Votre client idéal",
    texte: (
      <>
        Secteur, taille, situation : ce qui fait qu&apos;un prospect vaut votre temps. Écrit avec
        vos mots, en trois lignes, pas dans un formulaire à cases.
      </>
    ),
  },
  {
    rang: "Ce que vous fournissez",
    titre: "Votre offre",
    texte: (
      <>
        Ce qu&apos;il met en avant, et à quelles conditions. C&apos;est ce qui donne à ses messages
        un contenu, plutôt qu&apos;une formule de relance vide.
      </>
    ),
  },
  {
    rang: "Ce que vous gardez",
    titre: "Le dernier mot",
    texte: (
      <>
        Quelques secondes par envoi. C&apos;est le seul geste récurrent qu&apos;on vous demande, et
        c&apos;est celui qu&apos;on refuse de vous retirer.
      </>
    ),
  },
];

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; agent?: string }>;
}) {
  const { tenant, agent } = await searchParams;
  const extra = tenant && agent ? `&tenant=${tenant}&agent=${agent}` : "";

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            Sentio
          </Link>
          <Link href="/" className="nav-back" aria-label="Retour à l'accueil">
            ← Retour
          </Link>
        </div>
      </nav>

      <div className="lp">
        {/* ── Le déroulé ───────────────────────────────────────────── */}
        <section className="lp-sec">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <span className="lp-mono">Le déroulé</span>
              <h2>Voici exactement ce qui va se passer.</h2>
              <p>
                Six étapes, de votre choix de formule au premier message envoyé en votre nom. Rien
                d&apos;autre ne vous sera demandé que ce qui est écrit ici.
              </p>
            </div>

            <div className="lp-memo">
              {ETAPES.map((e) => (
                <div className="lp-memo-cell" key={e.rang}>
                  <div className="lp-memo-day">{e.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{e.titre}.</b> {e.texte}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Ce qu'on attend de lui ───────────────────────────────── */}
        <section className="lp-sec">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <span className="lp-mono">De votre côté</span>
              <h2>Deux réponses, puis votre accord.</h2>
              <p>
                Un employé numérique ne devine pas votre métier. Ce qu&apos;il attend de vous tient
                en trois choses, et aucune ne demande de compétence technique.
              </p>
            </div>

            <div className="lp-memo">
              {ATTENDU.map((a) => (
                <div className="lp-memo-cell" key={a.titre}>
                  <div className="lp-memo-day">{a.rang}</div>
                  <div className="lp-memo-fact">
                    <b>{a.titre}.</b> {a.texte}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Les formules ─────────────────────────────────────────── */}
        <section className="lp-sec">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <span className="lp-mono">Formules</span>
              <h2>Choisissez la génération de votre équipe.</h2>
              <p>
                Trois paliers, pas trois quotas différents : chacun change ce que vos collaborateurs
                numériques sont capables de faire seuls.
              </p>
            </div>

            <div className="lp-plans">
              {PLAN_ORDER.map((id) => (
                <PlanCard
                  key={id}
                  plan={PLANS[id]}
                  ctaHref={`/checkout?plan=${id}${extra}`}
                  ctaLabel={`Choisir ${PLANS[id].name}`}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
