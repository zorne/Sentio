"use client";

// La barre est transparente sur le noyau (rien ne doit couper la présence
// de l'ouverture) et ne se densifie qu'une fois le hero dépassé.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Logomark } from "@/components/Logomark";

export function Nav() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      if (ref.current) ref.current.dataset.solid = window.scrollY > 80 ? "1" : "0";
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav className="lp-nav" ref={ref} data-solid="0">
      <div className="lp-shell lp-nav-in">
        <Link href="/" className="lp-brand">
          <Logomark size={18} />
          SENTIA
        </Link>
        <Link href="/onboarding" className="lp-btn lp-btn--ghost lp-btn--sm">
          Recruter
        </Link>
      </div>
    </nav>
  );
}
