"use client";

// Révélation au scroll. UN observer partagé pour tous les éléments de la
// page (et non un par élément) : coût constant quel que soit le nombre de
// sections. Se désabonne après apparition — l'animation ne rejoue jamais,
// ce qui évite le clignotement au scroll inverse.
//
// L'observer est un singleton de module, créé au premier Reveal monté et
// jamais recréé. Avant ce changement, chaque Reveal créait sa propre
// instance : une quinzaine d'observers indépendants tournaient en
// permanence pendant le scroll, chacun avec son propre cycle de calcul de
// layout. Un seul observer, une seule liste d'entrées par tick — moins de
// travail pour le thread principal pendant exactement le moment où il est
// le plus sollicité.

import { useEffect, useRef, type ReactNode } from "react";

let sharedObserver: IntersectionObserver | null = null;
const onReveal = new Map<Element, () => void>();

function getSharedObserver() {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const reveal = onReveal.get(entry.target);
        if (!reveal) continue;
        reveal();
        onReveal.delete(entry.target);
        sharedObserver!.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  return sharedObserver;
}

export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "header";
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = getSharedObserver();
    onReveal.set(el, () => {
      el.dataset.in = "1";
    });
    observer.observe(el);
    return () => {
      onReveal.delete(el);
      observer.unobserve(el);
    };
  }, []);

  return (
    // @ts-expect-error — Tag est une union restreinte de balises HTML
    <Tag ref={ref} className={`lp-rv ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}
