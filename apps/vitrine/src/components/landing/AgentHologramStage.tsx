"use client";

// Enveloppe de l'hologramme : chargement différé, repli statique si
// l'utilisateur refuse les animations ou si le GPU est absent. Même
// contrat que CoreStage — aucun écran ne doit dépendre de la 3D pour
// être compréhensible.

import { Suspense, lazy, useEffect, useState } from "react";
import type { HologramPalette } from "./AgentHologram3D";

const AgentHologram3D = lazy(() => import("./AgentHologram3D"));

export function AgentHologramStage(props: HologramPalette) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    <div className="agt-stage" aria-hidden="true">
      {enabled && (
        <Suspense fallback={null}>
          <AgentHologram3D {...props} />
        </Suspense>
      )}
      <div className="agt-stage-fallback" />
    </div>
  );
}
