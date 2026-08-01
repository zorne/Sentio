"use client";

// Enveloppe du Noyau : chargement différé (le WebGL ne pèse pas sur le
// premier rendu), repli statique si l'utilisateur refuse les animations ou
// si le GPU est absent. Aucun écran ne doit dépendre de la 3D pour être
// compréhensible — elle ajoute de la présence, jamais de l'information.

import { Suspense, lazy, useEffect, useState } from "react";

const Core3D = lazy(() => import("./Core3D"));

export function CoreStage() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Un test WebGL réel plutôt qu'une détection d'agent utilisateur.
    let webgl = false;
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
    if (!reduced && webgl) setEnabled(true);
  }, []);

  return (
    <div className="lp-core" aria-hidden="true">
      {enabled && (
        <Suspense fallback={null}>
          <Core3D />
        </Suspense>
      )}
      <div className="lp-core-fallback" />
    </div>
  );
}
