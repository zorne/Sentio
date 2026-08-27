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
  /** Voix humaine — sérif. Ce qui se passe, raconté du point de vue du dirigeant. */
  say: string;
  /** Voix machine — mono. Ce que l'employé produit réellement, ou le vide quand il n'est pas là. */
  out: string;
  tone?: "sans" | "read" | "act" | "halt";
}

/**
 * ══ LA SCÈNE RACONTE AVANT, PENDANT, ET APRÈS ══
 *
 * Demande du fondateur le 2026-08-27 : montrer ce qui se passe avant et après l'arrivée de
 * l'employé, et donner envie.
 *
 * ⚠️ CE QUI PERSUADE ICI N'EST PAS UNE PROMESSE, C'EST UNE RECONNAISSANCE.
 *
 * Un dirigeant a déjà lu trente pages qui lui annoncent « +40 % de chiffre d'affaires ». Il n'y
 * croit plus, et le dépôt s'interdit d'ailleurs tout chiffre qu'aucune ligne en base ne
 * justifie. Ce qui reste, et qui marche mieux : lui montrer SA propre semaine. Le devis parti un
 * mardi soir, les douze jours, les quarante. Il n'a pas besoin qu'on le lui prouve, il l'a vécu.
 *
 * ⚠️ LA BOUCLE EST LE CŒUR DU DISPOSITIF. Le devis du premier temps ressort au dernier. Ce n'est
 * pas un effet de style : c'est la seule façon de faire sentir ce que l'employé change, sans
 * jamais avancer un résultat qu'on ne mesure pas encore.
 *
 * Les trois premiers temps montrent un panneau VIDE. C'est délibéré, et c'est ce que le visiteur
 * regarde en premier : il ne se passe rien, parce qu'il n'y a personne.
 */
const BEATS: Beat[] = [
  {
    time: "Mardi, 18 h 47",
    say: "Un devis part. Vous passez à autre chose, parce qu'il y a toujours autre chose.",
    out: "personne\n\n> ce devis ne remonte nulle part",
    tone: "sans",
  },
  {
    time: "Douze jours après",
    say: "Il faudrait relancer. Vous le savez. La semaine a été prise.",
    out: "personne\n\n> aucune relance prévue\n> aucune alerte",
    tone: "sans",
  },
  {
    time: "Quarante jours après",
    say: "L'affaire est froide. Ce n'est pas de la négligence, c'est une entreprise qui tourne.",
    out: "personne\n\n> l'affaire sort du champ",
    tone: "sans",
  },
  {
    time: "Un soir",
    say: "Vous racontez votre situation à Sentio. Ce que vous vendez, à qui, ce qui coince.",
    out: "écoute\n\n> votre clientèle\n> ce qui bloque : rien n'est relancé\n> l'objectif, dit par vous",
    tone: "read",
  },
  {
    time: "Quelques minutes",
    say: "Votre employé est composé. Pas choisi dans une liste : déduit de vos réponses.",
    out: "composition\n\n> métier · prospection\n> priorité · relancer ce qui est resté sans réponse\n> il vous demande avant chaque envoi",
    tone: "act",
  },
  {
    time: "Le lendemain, 09:04",
    say: "Il ouvre vos données. Personne ne lui a dit où chercher.",
    out: "lecture · prospects\n\nJulie Martin · Acme SAS · contact il y a 12 j\nMarc Dubois · Zenith SARL · contact il y a 40 j",
    tone: "read",
  },
  {
    time: "09:04",
    say: "Il compare, et il choisit. C'est là que ce n'est plus un script.",
    out: "arbitrage\n\n> Marc Dubois\n> 40 jours de silence\n> devis resté sans réponse\n> signal le plus fort",
    tone: "read",
  },
  {
    time: "09:05",
    say: "Il agit seul, parce que c'est réversible.",
    out: "écriture · fiche marc.dubois@zenith.com\n\n« Relance engagée.\n  Intérêt confirmé pour une démonstration. »\n\n✓ enregistré",
    tone: "act",
  },
  {
    time: "09:05",
    say: "Il rédige. Puis il s'arrête, parce que ce message-là sort de chez vous.",
    out: "brouillon prêt · envoi suspendu\n\nen attente de votre accord",
    tone: "halt",
  },
  {
    time: "09:06",
    say: "Vous lisez, et vous décidez. Le devis de mardi vient de ressortir tout seul.",
    out: "en attente de vous\n\n> le texte exact\n> l'entreprise à qui il s'adresse\n> vous autorisez, ou non",
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
                {current.tone === "sans"
                  ? "personne"
                  : current.tone === "halt"
                    ? "en attente de vous"
                    : current.tone === "act"
                      ? "écriture"
                      : "lecture"}
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
