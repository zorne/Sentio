"use client";

// ════════════════════════════════════════════════════════════════════
// Le dernier geste : la formule est choisie, il reste l'adresse.
//
// ⚠️ L'ADRESSE EST DEMANDÉE ICI, ET NULLE PART AVANT.
//
// Elle ne sert qu'à une chose : envoyer l'employé. La demander plus tôt
// transformerait le diagnostic en collecte d'adresses, ce qu'il n'est
// pas, et le visiteur le sentirait.
//
// Rien d'autre n'est demandé. Le secteur, la cible, l'objectif et ce
// qui bloque ont déjà été dits pendant la conversation : les
// redemander donnerait le sentiment de n'avoir pas été écouté, juste
// après vingt minutes passées à être écouté.
// ════════════════════════════════════════════════════════════════════

import { useState, useTransition } from "react";

import { recruterSurLaRecommandation } from "@/lib/recrutement-actions";

// ⚠️ LE FORMULAIRE EST OUVERT D'EMBLÉE, ET C'EST UNE FRICTION EN MOINS.
//
// Il y avait un bouton « Choisir », qui révélait le formulaire, qu'il fallait ensuite remplir.
// Deux gestes pour une seule décision, sur le dernier écran du parcours : c'est exactement là
// qu'on perd des gens. Le formulaire est visible tout de suite, et le bouton final reste le seul
// moment où quelque chose s'engage.
export function ChoisirLaFormule({
  recommandation,
  tier,
}: {
  recommandation: string;
  tier: string;
}) {
  const [entreprise, setEntreprise] = useState("");
  const [email, setEmail] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [parti, setParti] = useState<{ prenom: string; adresse: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (parti !== null) {
    return (
      <div className="fm-fait">
        <strong>{parti.prenom} a rejoint votre entreprise.</strong>
        <p>
          Nous venons d&apos;écrire à {parti.adresse}. Ce message dit ce qu&apos;il fera, ce
          qu&apos;il ne fera jamais, et comment entrer chez vous.
        </p>
      </div>
    );
  }

  return (
    <form
      className="form-stack fm-form"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        setErreur(null);
        startTransition(async () => {
          const resultat = await recruterSurLaRecommandation(recommandation, tier, {
            entreprise,
            email,
          });
          if (resultat.kind === "refus") {
            setErreur(resultat.message);
            return;
          }
          setParti({ prenom: resultat.prenom, adresse: resultat.adresse });
        });
      }}
    >
      <input
        type="text"
        placeholder="Le nom de votre entreprise"
        aria-label="Le nom de votre entreprise"
        value={entreprise}
        onChange={(evenement) => setEntreprise(evenement.target.value)}
        required
        disabled={pending}
      />
      <input
        type="email"
        placeholder="Votre adresse email"
        aria-label="Votre adresse email"
        value={email}
        onChange={(evenement) => setEmail(evenement.target.value)}
        required
        disabled={pending}
      />
      <button className="lp-btn lp-btn--primary" type="submit" disabled={pending}>
        {pending ? "Un instant…" : "Recevoir mon employé"}
      </button>
      {erreur !== null && <p className="fm-erreur">{erreur}</p>}
    </form>
  );
}
