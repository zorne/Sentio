"use client";

// L'arrêt, et rien d'autre sur ce bouton.
//
// ⚠️ Aucune confirmation, aucune question : un dirigeant qui veut arrêter son employé un dimanche
// soir doit pouvoir le faire d'un geste. Reprendre, en revanche, est une décision — le bouton le
// dit, et rien ne repart tout seul.

import { useState, useTransition } from "react";

import { arreterOuReprendre } from "./actions";

export function ArretDUrgence({
  tenantId,
  employeeId,
  arrete,
}: {
  tenantId: string;
  employeeId: string;
  arrete: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function agir() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await arreterOuReprendre(
        tenantId,
        employeeId,
        arrete ? "reprendre" : "arreter",
      );
      if (!resultat.ok) setErreur(resultat.message ?? "L'action n'a pas pu être enregistrée.");
    });
  }

  return (
    <span className="decision">
      <button type="button" onClick={agir} disabled={enCours} className={arrete ? "" : "arret"}>
        {arrete ? "Le remettre au travail" : "Tout arrêter, maintenant"}
      </button>
      {erreur ? <em className="erreur">{erreur}</em> : null}
    </span>
  );
}
