"use client";

// Le réglage d'autonomie.
//
// ⚠️ Les trois libellés disent ce qui CHANGE POUR LE DIRIGEANT, pas le nom technique du niveau.
// « confirm_once » ne veut rien dire pour lui ; « vous validez la première fois » si.

import { useState, useTransition } from "react";

import { reglerLAutonomie, type NiveauDAutonomie } from "./actions";

const NIVEAUX: { readonly valeur: NiveauDAutonomie; readonly libelle: string }[] = [
  { valeur: "confirm", libelle: "Je valide chaque action" },
  { valeur: "confirm_once", libelle: "Je valide la première fois" },
  { valeur: "auto", libelle: "Il agit sans moi" },
];

export function ReglageDAutonomie({
  tenantId,
  employeeId,
  niveau,
}: {
  tenantId: string;
  employeeId: string;
  niveau: NiveauDAutonomie;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function choisir(valeur: NiveauDAutonomie) {
    if (valeur === niveau) return;
    setErreur(null);
    demarrer(async () => {
      const resultat = await reglerLAutonomie(tenantId, employeeId, valeur);
      if (!resultat.ok) setErreur(resultat.message ?? "Le réglage n'a pas pu être enregistré.");
    });
  }

  return (
    <div className="autonomie">
      {NIVEAUX.map((option) => (
        <button
          key={option.valeur}
          type="button"
          onClick={() => choisir(option.valeur)}
          disabled={enCours}
          aria-pressed={option.valeur === niveau}
          className={option.valeur === niveau ? "actif" : ""}
        >
          {option.libelle}
        </button>
      ))}
      {erreur ? <em className="erreur">{erreur}</em> : null}
    </div>
  );
}
