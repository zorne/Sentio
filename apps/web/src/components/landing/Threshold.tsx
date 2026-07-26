"use client";

// ════════════════════════════════════════════════════════════════════
// Le Seuil — le point de bascule du produit, et le pic de la page.
//
// Décision de conversion : le visiteur ne REGARDE pas une capture, il
// DÉCIDE. Il approuve (ou refuse) réellement, et voit l'employé reprendre
// son travail. Il a vécu la boucle complète du produit avant d'avoir créé
// le moindre compte — c'est l'argument le plus fort qu'on puisse offrir,
// et il ne coûte rien à démontrer.
//
// Refuser est un choix légitime, pas un piège : la page continue et le
// message reste juste. Un « non » qui mène à une impasse trahirait la
// promesse même du produit (vous gardez la main).
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { RecruitLink } from "./RecruitLink";

type Verdict = null | "sent" | "held";

const MAIL = `Objet : Votre démonstration personnalisée

Bonjour Marc,

Je reviens vers vous concernant votre demande de devis
pour 10 postes, restée sans suite depuis le mois dernier.

Seriez-vous disponible cette semaine pour une
démonstration ?

Cordialement,`;

export function Threshold() {
  const [verdict, setVerdict] = useState<Verdict>(null);

  return (
    <section className="lp-threshold" id="seuil">
      <div className="lp-shell">
        <div className="lp-th-mark">
          <span />
          <span />
          <span />
        </div>

        <h2 className="lp-th-title">
          {verdict === null && <>Il ne l’enverra pas sans vous.</>}
          {verdict === "sent" && <>C’est parti. Il reprend la suite.</>}
          {verdict === "held" && <>Rien n’est parti. Il attend.</>}
        </h2>

        <p className="lp-th-sub">
          {verdict === null && (
            <>
              Lire vos données, prendre des notes : il le fait seul. Envoyer un message à
              votre client, non. <em>Décidez maintenant — c’est exactement ce que vous
              ferez chaque jour.</em>
            </>
          )}
          {verdict === "sent" && (
            <>
              Vous pouvez aussi lui dire de ne plus jamais demander pour les emails. La
              confiance se règle, elle ne se subit pas.
            </>
          )}
          {verdict === "held" && (
            <>
              Il a reformulé le brouillon et le garde de côté. Aucune action irréversible
              n’a eu lieu. C’est vous qui décidez du moment.
            </>
          )}
        </p>

        <div className={`lp-th-mail${verdict ? " is-done" : ""}`}>
          <div className="lp-th-mail-to">
            <span className="lp-th-dest">marc.dubois@zenith.com</span>
            <span className={`lp-th-stamp lp-th-stamp--${verdict ?? "wait"}`}>
              {verdict === "sent" ? "envoyé" : verdict === "held" ? "conservé" : "en attente"}
            </span>
          </div>
          <pre className="lp-th-mail-body">{MAIL}</pre>
        </div>

        {verdict === null ? (
          <div className="lp-th-act">
            <button className="lp-btn lp-btn--yes" onClick={() => setVerdict("sent")}>
              Approuver l’envoi
            </button>
            <button className="lp-btn lp-btn--no" onClick={() => setVerdict("held")}>
              Ne pas envoyer
            </button>
          </div>
        ) : (
          <div className="lp-th-after">
            <p className="lp-th-echo">
              Vous venez de faire, en une seconde, la seule chose que ce produit vous
              demandera jamais.
            </p>
            <div className="lp-th-act">
              <RecruitLink href="/onboarding" className="lp-btn lp-btn--primary">
                Recruter mon employé
              </RecruitLink>
              <button className="lp-btn lp-btn--ghost" onClick={() => setVerdict(null)}>
                Revoir la décision
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
