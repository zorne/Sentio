"use client";

// Indicateur de progression à gauche — repères par section de la landing.
// Met en évidence la section actuellement dans le viewport, clic = scroll
// vers la section. Passif : ne bloque jamais le scroll natif.

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "hero", label: "Présence" },
  { id: "mission", label: "Mission" },
  { id: "seuil", label: "Seuil" },
  { id: "disponibilite", label: "Disponibilité" },
  { id: "reglage", label: "Réglage" },
  { id: "conseiller", label: "Conseiller" },
  { id: "apres-recrutement", label: "Après" },
  { id: "retard", label: "Retard" },
  { id: "tarifs", label: "Tarifs" },
];

export function ScrollNav() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const mid = window.scrollY + window.innerHeight * 0.35;
      let best = 0;
      for (let i = 0; i < SECTIONS.length; i++) {
        const el = document.getElementById(SECTIONS[i]!.id);
        if (!el) continue;
        if (el.offsetTop <= mid) best = i;
      }
      setActive(best);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className="lp-scrollnav" aria-label="Navigation de la page">
      <ul>
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className={i === active ? "is-on" : ""} aria-current={i === active ? "true" : undefined}>
              <span className="lp-sn-dot" />
              <span className="lp-sn-lbl">{s.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
