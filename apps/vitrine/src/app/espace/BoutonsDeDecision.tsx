"use client";

// Trancher une action mise en attente. Deux boutons, aucune ambiguïté : ce qui est refusé ne
// part pas, ce qui est accordé part. On ne propose pas « plus tard » — une action suspendue qui
// attend indéfiniment est une décision prise par l'inaction.

import { useState, useTransition } from "react";

import { trancherUneAction } from "./actions";

export function BoutonsDeDecision({ approvalId }: { approvalId: string }) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function trancher(decision: "granted" | "refused") {
    setErreur(null);
    demarrer(async () => {
      const resultat = await trancherUneAction(approvalId, decision);
      if (!resultat.ok) setErreur(resultat.message ?? "La décision n'a pas pu être enregistrée.");
    });
  }

  return (
    <span className="decision">
      <button type="button" onClick={() => trancher("granted")} disabled={enCours}>
        Autoriser
      </button>
      <button type="button" onClick={() => trancher("refused")} disabled={enCours} className="refus">
        Refuser
      </button>
      {erreur ? <em className="erreur">{erreur}</em> : null}
    </span>
  );
}
