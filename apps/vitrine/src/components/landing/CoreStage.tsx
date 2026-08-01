"use client";

// Enveloppe du Noyau : chargement différé (le WebGL ne pèse pas sur le
// premier rendu), repli statique si l'utilisateur refuse les animations ou
// si le GPU est absent. Aucun écran ne doit dépendre de la 3D pour être
// compréhensible — elle ajoute de la présence, jamais de l'information.
//
// Un IntersectionObserver suit la visibilité du conteneur et coupe la
// boucle de rendu (`active`, lu par Core3D) dès que le hero quitte
// l'écran. Sans ça, la scène tourne à plein régime en continu, y compris
// pendant que le visiteur lit la section suivante — un coût GPU et
// thread principal payé pour rien, exactement au moment où le scroll
// des autres sections en a le plus besoin.

import { Suspense, lazy, useEffect, useRef, useState } from "react";

const Core3D = lazy(() => import("./Core3D"));

export function CoreStage() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      rootMargin: "20% 0px 20% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp-core" aria-hidden="true" ref={ref}>
      {enabled && (
        <Suspense fallback={null}>
          <Core3D active={visible} />
        </Suspense>
      )}
      <div className="lp-core-fallback" />
    </div>
  );
}
