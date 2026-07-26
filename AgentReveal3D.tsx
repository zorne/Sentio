"use client";

/**
 * AgentReveal3D
 * ------------------------------------------------------------------
 * Scène 3D minimaliste : un seul orbe métallique qui respire et se
 * déforme lentement (liquide/organique), teinté par la couleur du
 * métier recruté. Volontairement épuré — l'effet hypnotique vient du
 * mouvement lent, pas de la quantité d'éléments à l'écran.
 *
 * Dépendances à installer dans apps/web :
 *   npm install three @react-three/fiber @react-three/drei
 *
 * Aucune ressource externe chargée (pas de HDRI) : le rendu est
 * autonome, pas de dépendance réseau au runtime.
 * ------------------------------------------------------------------
 */

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Float } from "@react-three/drei";
import * as THREE from "three";

export type AgentRole =
  | "commercial"
  | "support"
  | "comptabilite"
  | "marketing"
  | "rh"
  | "developpement";

const ROLE_COLORS: Record<AgentRole, string> = {
  commercial: "#7dd3fc",
  support: "#6ee7a8",
  comptabilite: "#fbbf24",
  marketing: "#f472b6",
  rh: "#a78bfa",
  developpement: "#60a5fa",
};

const ROLE_LABELS: Record<AgentRole, string> = {
  commercial: "Prospection & qualification",
  support: "Support technique niveau 2",
  comptabilite: "Facturation & suivi",
  marketing: "Contenu & campagnes",
  rh: "Recrutement & onboarding",
  developpement: "Support technique produit",
};

function BreathingLight({ color }: { color: string }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      // Respiration lente et régulière — le cœur de l'effet "envoûtant".
      const t = clock.getElapsedTime();
      ref.current.intensity = 1.1 + Math.sin(t * 0.6) * 0.35;
    }
  });
  return <pointLight ref={ref} position={[2.5, 2, 3]} color={color} intensity={1.1} />;
}

function AgentOrb({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const tint = useMemo(() => new THREE.Color(color), [color]);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.1;
  });

  return (
    <Float speed={1} rotationIntensity={0.15} floatIntensity={0.7}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.3, 128, 128]} />
        <MeshDistortMaterial
          color="#eef1f4"
          emissive={tint}
          emissiveIntensity={0.16}
          metalness={0.55}
          roughness={0.22}
          distort={0.34}
          speed={1.1}
        />
      </mesh>
      {/* halo doux, une seule couche */}
      <mesh scale={1.5}>
        <sphereGeometry args={[1.3, 32, 32]} />
        <meshBasicMaterial color={tint} transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>
    </Float>
  );
}

export function AgentReveal3D({
  role,
  name,
  onRecruter,
  onTester,
}: {
  role: AgentRole;
  name: string;
  onRecruter: () => void;
  onTester: () => void;
}) {
  const color = ROLE_COLORS[role] ?? "#ffffff";
  const label = ROLE_LABELS[role] ?? "";

  return (
    <div className="agent-reveal">
      <div className="agent-reveal__canvas">
        <Canvas camera={{ position: [0, 0, 4.4], fov: 40 }} dpr={[1, 2]}>
          <ambientLight intensity={0.45} />
          <BreathingLight color={color} />
          <pointLight position={[-3, -2, -3]} intensity={0.3} color="#ffffff" />
          <AgentOrb color={color} />
        </Canvas>
      </div>

      <div className="agent-reveal__info">
        <span className="agent-reveal__eyebrow">Votre employé IA est prêt</span>
        <h3 className="agent-reveal__name">{name}</h3>
        <p className="agent-reveal__role">{label}</p>

        <div className="agent-reveal__actions">
          <button type="button" className="agent-reveal__btn-primary" onClick={onRecruter}>
            Recruter cet agent
          </button>
          <button type="button" className="agent-reveal__btn-secondary" onClick={onTester}>
            Tester avant de recruter
          </button>
        </div>
      </div>

      <style jsx>{`
        .agent-reveal {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          padding: 32px 24px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          animation: agentRevealIn 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .agent-reveal__canvas {
          width: 100%;
          max-width: 320px;
          aspect-ratio: 1 / 1;
        }
        .agent-reveal__info {
          text-align: center;
          max-width: 360px;
        }
        .agent-reveal__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11.5px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.46);
        }
        .agent-reveal__eyebrow::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #6ee7a8;
          box-shadow: 0 0 8px rgba(110, 231, 168, 0.6);
        }
        .agent-reveal__name {
          font-size: 22px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.01em;
          margin: 10px 0 4px;
        }
        .agent-reveal__role {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.56);
          margin-bottom: 22px;
        }
        .agent-reveal__actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .agent-reveal__btn-primary {
          background: #fff;
          color: #0a0a0b;
          font-size: 13.5px;
          font-weight: 600;
          padding: 12px 24px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .agent-reveal__btn-primary:hover {
          transform: scale(1.03);
          box-shadow: 0 0 30px rgba(255, 255, 255, 0.2);
        }
        .agent-reveal__btn-secondary {
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          font-size: 13.5px;
          font-weight: 500;
          padding: 12px 24px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .agent-reveal__btn-secondary:hover {
          border-color: rgba(255, 255, 255, 0.4);
          color: #fff;
          background: rgba(255, 255, 255, 0.04);
        }
        @keyframes agentRevealIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .agent-reveal {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
