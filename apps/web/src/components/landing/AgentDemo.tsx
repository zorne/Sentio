"use client";

// ════════════════════════════════════════════════════════════════════
// Démo du hero — rejoue la trace RÉELLE d'une mission (celle observée en
// production le 25/07 : lecture des leads → arbitrage → mise à jour de
// fiche → email préparé → arrêt pour validation).
//
// Décision produit : on ne montre pas une illustration ni un mockup
// inventé. On montre ce que le produit fait vraiment, dans la forme
// exacte où le client le verra dans son tableau de bord. La cohérence
// promesse/produit est l'argument de conversion le plus fort qu'on ait.
//
// Le déroulé s'arrête volontairement sur la carte de validation : c'est
// LE différenciateur (autonome, mais pas hors de contrôle). Terminer sur
// « tâche réussie » diluerait le message (Peak-End Rule).
// ════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from "react";

interface DemoStep {
  title: string;
  detail?: string;
  acting?: boolean;
}

const STEPS: DemoStep[] = [
  { title: "A consulté la liste de vos prospects", detail: "2 prospects trouvés." },
  {
    title: "A comparé et choisi qui relancer",
    detail: "Marc Dubois — dernier contact il y a 40 jours, devis de 10 postes resté sans réponse.",
  },
  {
    title: "A mis à jour la fiche de marc.dubois@zenith.com",
    detail: "Relance engagée le 25/07. Intérêt confirmé pour une démonstration.",
    acting: true,
  },
  { title: "A rédigé un email de relance", detail: "Prêt à partir — en attente de votre accord.", acting: true },
];

const STEP_MS = 950;

export function AgentDemo() {
  const [shown, setShown] = useState(0);
  const [gate, setGate] = useState(false);

  const play = useCallback(() => {
    setShown(0);
    setGate(false);
  }, []);

  useEffect(() => {
    // Accessibilité : sans animation, tout est affiché d'emblée.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(STEPS.length);
      setGate(true);
      return;
    }
    if (shown >= STEPS.length) {
      if (!gate) {
        const t = setTimeout(() => setGate(true), 520);
        return () => clearTimeout(t);
      }
      return;
    }
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 420 : STEP_MS);
    return () => clearTimeout(t);
  }, [shown, gate]);

  return (
    <div className="lp-demo">
      <div className="lp-demo-bar">
        <span className="lp-demo-dot" />
        <span className="lp-demo-dot" />
        <span className="lp-demo-dot" />
        <span className="lp-demo-title">Employé IA · Commercial — mission en cours</span>
        <span className="lp-demo-live">en direct</span>
      </div>

      <div className="lp-demo-body">
        {STEPS.slice(0, shown).map((s, i) => (
          <div
            key={s.title}
            className={`lp-step${s.acting ? " lp-step--act" : ""}`}
            style={{ animationDelay: `${i === shown - 1 ? 0 : 0}ms` }}
          >
            <span className="lp-step-mark">
              <i />
            </span>
            <div>
              <div className="lp-step-t">{s.title}</div>
              {s.detail && <div className="lp-step-d">{s.detail}</div>}
            </div>
          </div>
        ))}

        {gate && (
          <div className="lp-gate">
            <div className="lp-gate-q">Envoyer cet email à marc.dubois@zenith.com ?</div>
            <div className="lp-gate-mail">
              {`Objet : Votre démonstration personnalisée

Bonjour Marc,

Je reviens vers vous concernant votre demande de devis pour 10 postes.
Seriez-vous disponible cette semaine pour une démonstration ?

Cordialement,`}
            </div>
            <div className="lp-gate-row">
              <span className="lp-pill lp-pill--yes">Approuver et reprendre</span>
              <span className="lp-pill lp-pill--no">Refuser</span>
              <span className="lp-gate-hint">ou : ne plus me demander pour les emails</span>
            </div>
          </div>
        )}
      </div>

      <div className="lp-demo-foot">
        <span>lecture et écriture : automatiques · envoi : votre accord</span>
        <button className="lp-replay" onClick={play}>
          rejouer
        </button>
      </div>
    </div>
  );
}
