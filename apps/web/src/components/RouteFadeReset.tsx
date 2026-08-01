"use client";

// RecruitLink pose `rt-leaving` sur le body pour faire un fondu de sortie, et
// c'est /onboarding qui le retirait à son montage. Depuis que « Recruter »
// mène à /plans, la page d'arrivée n'est plus la même — et une classe oubliée
// laisse `opacity: 0` sur tout le document. On l'annule ici, à chaque
// changement de route, pour que la destination n'ait plus rien à savoir de la
// transition qui l'a amenée.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function RouteFadeReset() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.classList.remove("rt-leaving");
  }, [pathname]);

  return null;
}
