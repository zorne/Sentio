"use client";

// ════════════════════════════════════════════════════════════════════
// Ce qu'elle a fait, et si elle vous l'a demandé.
//
// ══ POURQUOI CE TIROIR EXISTE ══
//
// Demande du fondateur : *« je veux qu'il voie quand même les étapes,
// même si elles sont faites sans son accord, comme ça si ça lui
// déplaît il pourra décider de ne plus automatiser cette tâche. »*
//
// ⚠️ C'EST LA CONTREPARTIE DE « TOUJOURS AUTORISER ». Autoriser une
// capacité pour toujours n'a de sens que si l'on voit ce qui passe
// ensuite. Sans ce tiroir, l'accord permanent reviendrait à fermer les
// yeux, et la confiance donnée ne pourrait plus être reprise faute de
// savoir ce qu'elle a produit.
//
// ══ DEUX CHOSES QUI NE SE DEVINENT PAS EN LISANT L'ÉCRAN ══
//
// 1. « Sans vous demander » n'est pas une déduction du navigateur : le
//    journal relie les maillons d'un même pas, et un pas où la
//    politique a SUSPENDU est un pas qui vous a été soumis. On le lit.
//
// 2. Le bouton de retrait est POSÉ SUR LA LIGNE QUI A GÊNÉ. C'est le
//    moment où le dirigeant se dit « celle-là, je n'en voulais pas » :
//    l'envoyer chercher un réglage ailleurs lui ferait renoncer, et il
//    garderait un accord qu'il ne veut plus.
// ════════════════════════════════════════════════════════════════════

import { useState, useTransition } from "react";

import { retirerLAccord } from "./actions";

export interface ActionFaite {
  readonly quand: string;
  readonly quoi: string;
  readonly capaciteCle: string | null;
  readonly entreprise: string | null;
  readonly sansVous: boolean;
  readonly accordEnCours: boolean;
}

export function CeQuElleAFait({
  actions,
  tenantId,
  employeeId,
}: {
  actions: readonly ActionFaite[];
  tenantId: string;
  employeeId: string;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  if (actions.length === 0) {
    // ⚠️ Jamais « aucun résultat ». Un état vide dit ce qui se passe, sinon le dirigeant se
    // demande si quelque chose est cassé.
    return (
      <p className="sc-vide">
        Elle n&apos;a encore rien fait qui laisse une trace. Vous verrez ici chaque action, avec
        celles qu&apos;elle a menées sans vous déranger.
      </p>
    );
  }

  return (
    <>
      <ul className="sc-faits">
        {actions.map((action, index) => (
          <li key={`${action.quand}-${index}`}>
            <div className="sc-fait-ligne">
              <span className="sc-fait-quoi">{action.quoi}</span>
              <span className="sc-fait-quand">{action.quand}</span>
            </div>

            {action.entreprise !== null ? (
              <p className="sc-fait-cible">{action.entreprise}</p>
            ) : null}

            <p className={`sc-fait-mode${action.sansVous ? " sc-fait-mode--seule" : ""}`}>
              {action.sansVous
                ? "Faite sans vous déranger, parce que vous l'aviez autorisée une fois pour toutes."
                : "Vous l'aviez autorisée avant qu'elle parte."}
            </p>

            {/* Le retrait est ICI, sur la ligne qui a gêné. Pas dans un réglage à trouver. */}
            {action.sansVous && action.accordEnCours && action.capaciteCle !== null ? (
              <button
                type="button"
                className="sc-fait-retirer"
                disabled={enCours}
                onClick={() => {
                  setErreur(null);
                  demarrer(async () => {
                    const resultat = await retirerLAccord(
                      tenantId,
                      employeeId,
                      action.capaciteCle as string,
                    );
                    if (!resultat.ok) {
                      setErreur(resultat.message ?? "Cet accord n'a pas pu être retiré.");
                    }
                  });
                }}
              >
                Me redemander avant, la prochaine fois
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {erreur !== null ? <p className="sc-fait-erreur">{erreur}</p> : null}
    </>
  );
}
