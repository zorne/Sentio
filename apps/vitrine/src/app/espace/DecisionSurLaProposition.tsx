"use client";

// La réponse du dirigeant à une proposition de son employé.
//
// Deux boutons, et le mot « Plus tard » n'existe pas : une proposition laissée en suspens bloque
// toute réévaluation suivante (`20260815120019`). Ne pas répondre est déjà une réponse, autant
// que ce soit une réponse choisie.

import { useState, useTransition } from "react";

import { repondreALaProposition } from "./actions";

export function DecisionSurLaProposition({
  tenantId,
  configurationId,
}: {
  tenantId: string;
  configurationId: string;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function repondre(reponse: "accepter" | "refuser") {
    setErreur(null);
    demarrer(async () => {
      const resultat = await repondreALaProposition(tenantId, configurationId, reponse);
      if (!resultat.ok) setErreur(resultat.message ?? "Votre réponse n'a pas pu être enregistrée.");
    });
  }

  return (
    <span className="decision">
      <button type="button" onClick={() => repondre("accepter")} disabled={enCours} className="oui">
        Accepter ce changement
      </button>
      <button
        type="button"
        onClick={() => repondre("refuser")}
        disabled={enCours}
        className="refus"
      >
        Garder comme aujourd'hui
      </button>
      {erreur ? <em className="erreur">{erreur}</em> : null}
    </span>
  );
}
