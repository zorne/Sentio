"use client";

// Bouton plein écran, présent sur toute l'application (monté dans le layout
// racine). Utilise la Fullscreen API du navigateur — pas un habillage CSS
// qui cache la nav : la barre d'adresse et les onglets disparaissent
// vraiment, comme sur YouTube ou Netflix.
//
// Safari garde encore ses noms préfixés sur certaines versions ; iOS Safari
// ne l'expose tout simplement pas sur iPhone (seulement iPad). On détecte
// le support réel avant d'afficher le bouton plutôt que de proposer un
// geste qui échouerait silencieusement.

import { useEffect, useState } from "react";

interface FullscreenDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

export function FullscreenToggle() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    setSupported(Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled));

    const onChange = () => {
      setActive(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  if (!supported) return null;

  async function toggle() {
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else {
        if (root.requestFullscreen) await root.requestFullscreen();
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      }
    } catch {
      // Refusé par le navigateur (hors d'un geste utilisateur direct,
      // permission bloquée) — l'état reste simplement inchangé.
    }
  }

  return (
    <button
      type="button"
      className="fs-toggle"
      onClick={toggle}
      aria-label={active ? "Quitter le plein écran" : "Passer en plein écran"}
      title={active ? "Quitter le plein écran" : "Passer en plein écran"}
    >
      {active ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}
    </button>
  );
}
