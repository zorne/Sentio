"use client";

// ════════════════════════════════════════════════════════════════════
// Trancher une action mise en attente.
//
// Deux boutons, aucune ambiguïté : ce qui est refusé ne part pas, ce
// qui est accordé part. On ne propose pas « plus tard » — une action
// suspendue qui attend indéfiniment est une décision prise par
// l'inaction.
//
// ══ ET UN TROISIÈME GESTE, DEMANDÉ PAR LE FONDATEUR ══
//
// *« Je veux qu'il y ait la possibilité de dire je veux valider cette
// tâche définitivement, et du coup la tâche qu'il aura validée sera
// automatique. »*
//
// ⚠️ IL EST VOLONTAIREMENT PLUS DISCRET QUE LES DEUX AUTRES. Autoriser
// une fois est un geste ordinaire ; autoriser pour toujours élargit
// l'autonomie de quelqu'un qui travaille pour vous. Les mettre côte à
// côte, du même poids, ferait cliquer sur le second par habitude du
// premier.
//
// ⚠️ ET IL DIT SUR QUOI IL PORTE. « Toujours autoriser » tout court
// ferait signer une page blanche, exactement le défaut qu'on a corrigé
// ailleurs dans cet écran. Il nomme la capacité : « Toujours autoriser
// Mettre à jour une fiche ».
// ════════════════════════════════════════════════════════════════════

import { useState, useTransition } from "react";

import { accorderDefinitivement, trancherUneAction } from "./actions";

export function BoutonsDeDecision({
  approvalId,
  tenantId,
  employeeId,
  capaciteCle,
  capaciteNom,
}: {
  approvalId: string;
  tenantId: string;
  employeeId: string;
  /** Nulle quand le journal ne l'a pas retrouvée : on n'accorde alors rien pour toujours. */
  capaciteCle: string | null;
  capaciteNom: string | null;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function trancher(decision: "granted" | "refused") {
    setErreur(null);
    demarrer(async () => {
      const resultat = await trancherUneAction(approvalId, decision);
      if (!resultat.ok) setErreur(resultat.message ?? "La décision n'a pas pu être enregistrée.");
    });
  }

  function autoriserToujours() {
    if (capaciteCle === null) return;
    setErreur(null);
    demarrer(async () => {
      // ⚠️ L'ORDRE COMPTE. On accorde d'abord, on tranche ensuite : si l'accord permanent
      // échouait après avoir laissé partir l'action, le dirigeant croirait avoir automatisé
      // quelque chose qui redemandera son avis la fois suivante.
      const accord = await accorderDefinitivement(tenantId, employeeId, capaciteCle);
      if (!accord.ok) {
        setErreur(accord.message ?? "Cet accord n'a pas pu être enregistré.");
        return;
      }
      const resultat = await trancherUneAction(approvalId, "granted");
      if (!resultat.ok) setErreur(resultat.message ?? "La décision n'a pas pu être enregistrée.");
    });
  }

  return (
    <span className="decision">
      <button type="button" onClick={() => trancher("granted")} disabled={enCours} className="oui">
        Autoriser
      </button>
      <button type="button" onClick={() => trancher("refused")} disabled={enCours} className="refus">
        Refuser
      </button>

      {capaciteCle !== null && capaciteNom !== null ? (
        <button
          type="button"
          onClick={autoriserToujours}
          disabled={enCours}
          className="toujours"
          title="Cette action se fera seule à l'avenir. Vous verrez ce qu'elle produit, et vous pourrez reprendre cet accord quand vous voulez."
        >
          Toujours autoriser « {capaciteNom} »
        </button>
      ) : null}

      {erreur ? <em className="erreur">{erreur}</em> : null}
    </span>
  );
}
