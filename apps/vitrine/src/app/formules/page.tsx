// ════════════════════════════════════════════════════════════════════════════════════════════
// LES FORMULES — lues dans la base, jamais écrites dans le code.
//
// ⚠️ CE QUI VIVAIT ICI AVANT, ET POURQUOI C'EST PARTI.
//
// Une grille en dur (`lib/plans.ts`) annonçait 499, 1 999 et 9 999 € par mois et vendait
// trente-trois fonctionnalités dont presque aucune n'existait, jusqu'à un engagement de
// disponibilité chiffré sur une infrastructure choisie pour coûter zéro euro (constat A3.1 de
// `docs/32`). Pire : deux des trois formules étaient marquées NON commercialisables en base. Un
// client qui payait « Professionnel » achetait une formule que le recrutement aurait refusée,
// après le paiement.
//
// Désormais la page ne peut plus mentir : elle affiche ce que `plan` et `plan_quota` contiennent,
// et un palier non commercialisable se montre comme tel au lieu de se vendre.
//
// ⚠️ AUCUN PRIX, ET C'EST UNE DÉCISION. Le prix vit chez le prestataire de paiement (`docs/31`
// §5) ; l'écrire ailleurs afficherait un chiffre que rien ne garantit. Tant que le paiement n'est
// pas branché, c'est gratuit, et le dire est la seule chose vraie.
// ════════════════════════════════════════════════════════════════════════════════════════════

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { decrireLaFormule, PRIX_PENDANT_LA_BETA, type FormuleDecrite } from "@sentio/domain";

import { ChoisirLaFormule } from "@/components/ChoisirLaFormule";
import { Logomark } from "@/components/Logomark";
import { pool } from "@/lib/db";
import "@/app/landing.css";
import "./formules.css";

export const metadata: Metadata = { title: "Choisir votre formule | Sentio" };
export const dynamic = "force-dynamic";

export default async function FormulesPage({
  searchParams,
}: {
  searchParams: Promise<{ reco?: string }>;
}) {
  const { reco } = await searchParams;

  // Sans diagnostic, il n'y a rien à choisir : une formule s'applique à un employé composé, pas
  // dans le vide. On renvoie plutôt que d'afficher une grille qui ne mènerait nulle part.
  if (reco === undefined || !/^[0-9a-f-]{36}$/i.test(reco)) notFound();

  const { rows } = await pool.query<{
    tier: string;
    commercialisable: boolean;
    metric: string;
    quota_limit: string;
  }>(
    `select p.tier, p.commercialisable, q.metric, q.quota_limit
       from plan p join plan_quota q on q.plan_id = p.id
      order by p.job_priority, q.metric`,
  );

  const parTier = new Map<string, { commercialisable: boolean; quotas: { metric: string; quotaLimit: number }[] }>();
  for (const ligne of rows) {
    const entree = parTier.get(ligne.tier) ?? { commercialisable: ligne.commercialisable, quotas: [] };
    entree.quotas.push({ metric: ligne.metric, quotaLimit: Number(ligne.quota_limit) });
    parTier.set(ligne.tier, entree);
  }

  const formules = [...parTier.entries()]
    .map(([tier, e]) => decrireLaFormule(tier, e.commercialisable, e.quotas))
    .filter((f): f is FormuleDecrite => f !== null);

  return (
    <div className="lp fm-page">
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <Logomark />
            Sentio
          </Link>
        </div>
      </nav>

      <div className="lp-shell fm-wrap">
        <span className="lp-mono">Dernière étape</span>
        <h1 className="fm-titre">Choisissez ce que vous lui confiez.</h1>
        <p className="fm-mot">
          Votre employé est composé. Il reste à dire jusqu&apos;où il travaille pour vous. Ces
          limites sont celles que le produit applique vraiment, pas des chiffres d&apos;affiche.
        </p>

        <div className="fm-grille">
          {formules.map((formule) => (
            <div
              key={formule.tier}
              className={`fm-carte${formule.disponible ? "" : " fm-carte--fermee"}`}
            >
              <div className="fm-carte-nom">{formule.nom}</div>
              <div className="fm-carte-prix">
                {formule.disponible ? PRIX_PENDANT_LA_BETA : "Pas encore ouverte"}
              </div>
              <p className="fm-carte-pour">{formule.pourQui}</p>

              <ul className="fm-carte-limites">
                {formule.limites.map((limite) => (
                  <li key={limite}>{limite}</li>
                ))}
              </ul>

              {formule.disponible ? (
                <ChoisirLaFormule recommandation={reco} tier={formule.tier} nom={formule.nom} />
              ) : (
                /* ⚠️ On dit pourquoi elle est fermée. « Bientôt disponible » sans raison est
                   exactement le genre de phrase qui fait patienter des gens pour rien. */
                <p className="fm-carte-fermee-mot">
                  Nous ne l&apos;ouvrirons que lorsque nous saurons la tenir.
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="fm-note">
          Aucun moyen de paiement ne vous est demandé, à aucun moment. Le jour où des formules
          payantes existeront, vous serez prévenu avant, et rien ne sera prélevé sans votre accord.
        </p>
      </div>
    </div>
  );
}
