"use client";

// Un fondu avant de quitter la page, plutôt qu'un saut brutal vers
// /onboarding — le même principe que la transition chat→hologramme dans
// OnboardingChat, appliqué à l'entrée du parcours. La page d'arrivée
// (.rec-page) fait le fondu inverse à son montage.

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function RecruitLink({
  href = "/onboarding",
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd/molette doivent garder le comportement natif (nouvel onglet).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    document.body.classList.add("rt-leaving");
    setTimeout(() => router.push(href), 380);
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
