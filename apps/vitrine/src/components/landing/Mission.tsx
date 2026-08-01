"use client";

// ════════════════════════════════════════════════════════════════════
// La Mission — l'acte central. Le scroll devient le temps.
//
// Principe : la page n'explique pas ce que fait l'employé, elle le lui
// fait faire pendant que vous descendez. Vous vivez une délégation
// complète, du briefing jusqu'au moment où il s'arrête pour demander.
//
// AUCUN détournement du scroll (pas de scroll-jacking) : la molette garde
// sa vitesse naturelle, le clavier et le trackpad fonctionnent, la barre
// de défilement dit la vérité. On se contente de LIRE la progression et
// d'en déduire l'étape courante — c'est ce qui distingue une mise en
// scène d'une prise d'otage.
//
// Perf : écouteur passif + requestAnimationFrame, et un setState
// uniquement quand l'indice d'étape change (pas à chaque frame).
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";

interface Beat {
  time: string;
  /** Voix humaine — sérif. Ce que fait l'employé, raconté. */
  say: string;
  /** Voix machine — mono. Ce qu'il produit réellement. */
  out: string;
  tone?: "read" | "act" | "halt";
}

const BEATS: Beat[] = [
  {
    time: "09:04",
    say: "Vous lui confiez une mission.",
    out: "mission reçue\n> relancer le prospect le plus pertinent",
    tone: "read",
  },
  {
    time: "09:04",
    say: "Il ouvre vos données. Personne ne lui a dit où chercher.",
    out: "lecture · prospects\n\nJulie Martin · Acme SAS · contact il y a 12 j\nMarc Dubois · Zenith SARL · contact il y a 40 j",
    tone: "read",
  },
  {
    time: "09:04",
    say: "Il compare, et il choisit. C'est là que ce n'est plus un script.",
    out: "arbitrage\n\n> Marc Dubois\n> 40 jours de silence\n> devis 10 postes resté sans réponse\n> signal le plus fort",
    tone: "read",
  },
  {
    time: "09:05",
    say: "Il agit seul, parce que c'est réversible.",
    out: "écriture · fiche marc.dubois@zenith.com\n\n« Relance engagée le 25/07.\n  Intérêt confirmé pour une démonstration. »\n\n✓ enregistré",
    tone: "act",
  },
  {
    time: "09:05",
    say: "Il rédige. Puis il s'arrête.",
    out: "brouillon prêt · envoi suspendu\n\nen attente d'un accord humain",
    tone: "halt",
  },
];

export function Mission() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      if (total <= 0) return;
      // 0 quand le haut atteint le sommet, 1 quand le bas y arrive.
      const p = Math.min(1, Math.max(0, -r.top / total));
      setProgress(p);
      // On réserve la dernière portion à l'étape finale pour qu'elle
      // reste à l'écran : c'est le moment que le visiteur doit retenir.
      const idx = Math.min(BEATS.length - 1, Math.floor(p * BEATS.length * 0.98));
      setBeat((prev) => (prev === idx ? prev : idx));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const current = BEATS[beat]!;

  return (
    <div className="lp-mission" id="mission" ref={wrapRef}>
      <div className="lp-mission-stage">
        <div className="lp-shell lp-mission-grid">
          {/* Fil de progression — guide, pas décor : il dit où l'on en est */}
          <div className="lp-thread" aria-hidden="true">
            <span className="lp-thread-fill" style={{ transform: `scaleY(${progress})` }} />
            {BEATS.map((_, i) => (
              <span key={i} className={`lp-thread-node${i <= beat ? " is-on" : ""}`} style={{ top: `${(i / (BEATS.length - 1)) * 100}%` }} />
            ))}
          </div>

          <div className="lp-mission-say">
            <span className="lp-clock">{current.time}</span>
            {BEATS.map((b, i) => (
              <p key={i} className={`lp-say${i === beat ? " is-on" : ""}`} aria-hidden={i !== beat}>
                {b.say}
              </p>
            ))}
          </div>

          <div className={`lp-mission-out lp-tone-${current.tone ?? "read"}`}>
            <div className="lp-out-bar">
              <span className="lp-out-name">employé · commercial</span>
              <span className={`lp-out-state lp-state-${current.tone ?? "read"}`}>
                {current.tone === "halt" ? "suspendu" : current.tone === "act" ? "écriture" : "lecture"}
              </span>
            </div>
            <pre className="lp-out-body" key={beat}>
              {current.out}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
