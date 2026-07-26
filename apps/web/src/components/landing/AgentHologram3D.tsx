"use client";

// ════════════════════════════════════════════════════════════════════
// AgentHologram3D — un buste filaire (tête + épaules), dans l'esprit des
// rendus de "scan holographique" : un maillage triangulé (wireframe),
// pas un nuage de points comme Core3D. Toujours pas de maillage PLEIN,
// pas d'ombre — juste des arêtes lumineuses sur fond transparent.
//
// La tête/les épaules sont des primitives déformées (sphère, cylindres),
// pas un visage sculpté : ça donne le motif en losanges d'un vrai scan
// sans prétendre à une anatomie précise (aucun modèle 3D scanné dans le
// projet — voir la conversation pour le choix assumé).
// ════════════════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type HologramPalette = { accent?: string };

const DEFAULT_ACCENT = "#2ee6f5";

// Profil approximatif du buste (hauteur, rayon) — sert uniquement à
// dimensionner le balayage et le socle, pas la géométrie visible.
const PROFILE: Array<[number, number]> = [
  [-1.15, 0.5],
  [-0.6, 0.86],
  [-0.25, 0.28],
  [0.05, 0.17],
  [0.18, 0.36],
  [0.58, 0.46],
  [1.05, 0.06],
  [1.12, 0.0],
];
const BOTTOM = PROFILE[0]![0];
const TOP = PROFILE[PROFILE.length - 1]![0];

function radiusAt(y: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, r0] = PROFILE[i]!;
    const [y1, r1] = PROFILE[i + 1]!;
    if (y >= y0 && y <= y1) {
      const t = (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

function useGlowTexture() {
  return useMemo(() => {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.3, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, []);
}

function ringGeometry(radius: number, y: number, seg = 48, phase = 0) {
  const pos: number[] = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2 + phase;
    pos.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Lueur derrière le buste — statique, jamais animée en opacité (une
 *  lumière qui varie lit comme un défaut, pas comme une présence). */
function BustGlow({ accent }: { accent: THREE.Color }) {
  const glow = useGlowTexture();
  return (
    <sprite position={[0, 0.1, -0.35]} scale={[3.4, 3.4, 1]}>
      <spriteMaterial
        map={glow}
        color={accent}
        transparent
        opacity={0.48}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={false}
      />
    </sprite>
  );
}

/** Le buste : tête + cou + épaules, en maillage filaire (triangles
 *  visibles, pas un nuage de points). Lumière stable et franche —
 *  aucune variation d'intensité : la présence de l'agent ne doit jamais
 *  paraître incertaine ou instable. Une seule rotation lente, continue,
 *  jamais pilotée par le client. */
function WireframeBust({ accent }: { accent: THREE.Color }) {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.elapsedTime * 0.12;
  });

  const matProps = {
    color: accent,
    wireframe: true as const,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  };

  return (
    <group ref={group}>
      {/* Tête — sphère légèrement allongée, pas un visage sculpté. */}
      <mesh position={[0, 0.58, 0]} scale={[0.84, 1.04, 0.9]}>
        <sphereGeometry args={[0.46, 26, 20]} />
        <meshBasicMaterial {...matProps} />
      </mesh>
      {/* Cou. */}
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 0.34, 16, 2, true]} />
        <meshBasicMaterial {...matProps} opacity={0.7} />
      </mesh>
      {/* Épaules — cône tronqué qui s'évase, pas des jambes. */}
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.3, 0.9, 0.86, 24, 5, true]} />
        <meshBasicMaterial {...matProps} opacity={0.82} />
      </mesh>
    </group>
  );
}

/** Le plan de balayage — ce qui distingue une projection d'un objet : la
 *  lumière qui parcourt la forme plutôt que de l'éclairer depuis l'extérieur. */
function ScanBeam({ accent }: { accent: THREE.Color }) {
  const glow = useGlowTexture();
  const mesh = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Line>(null);

  const ringGeo = useMemo(() => ringGeometry(1, 0, 72), []);

  useFrame(({ clock }) => {
    const period = 5.2;
    const t = (clock.elapsedTime % period) / period;
    const y = BOTTOM + (TOP - BOTTOM) * t;
    const r = Math.max(0.05, radiusAt(y));
    // Fondu aux extrémités du parcours : le balayage nait et meurt dans la
    // silhouette plutôt que de sembler couper à travers.
    const edge = Math.min(1, t / 0.08, (1 - t) / 0.08);

    if (mesh.current) {
      mesh.current.position.y = y;
      mesh.current.scale.setScalar(r * 2.6);
      (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * edge;
    }
    if (ring.current) {
      ring.current.position.y = y;
      ring.current.scale.set(r, 1, r);
      (ring.current.material as THREE.LineBasicMaterial).opacity = 0.85 * edge;
    }
  });

  return (
    <group>
      <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glow}
          color={accent}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <primitive
        ref={ring}
        object={
          new THREE.LineLoop(
            ringGeo,
            new THREE.LineBasicMaterial({
              color: accent,
              transparent: true,
              opacity: 0,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          )
        }
      />
    </group>
  );
}

/** Le socle : là d'où la lumière part. Un anneau au sol, quelques rayons
 *  qui montent vers la silhouette et se resserrent — un cône de
 *  projection, pas des jambes. */
function ProjectorBase({ accent }: { accent: THREE.Color }) {
  const baseRadius = 0.56;
  const baseY = BOTTOM - 0.08;

  const baseRingGeo = useMemo(() => ringGeometry(baseRadius, baseY, 64), []);
  const beams = useMemo(() => {
    const n = 7;
    const arr: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const topR = radiusAt(BOTTOM + 0.5) * 0.6;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array([
        Math.cos(a) * baseRadius,
        baseY,
        Math.sin(a) * baseRadius,
        Math.cos(a) * topR,
        BOTTOM + 0.5,
        Math.sin(a) * topR,
      ]);
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      arr.push(g);
    }
    return arr;
  }, []);

  return (
    <group>
      <primitive
        object={
          new THREE.LineLoop(
            baseRingGeo,
            new THREE.LineBasicMaterial({
              color: accent,
              transparent: true,
              opacity: 0.7,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          )
        }
      />
      {beams.map((g, i) => (
        <primitive
          key={i}
          object={
            new THREE.Line(
              g,
              new THREE.LineBasicMaterial({
                color: accent,
                transparent: true,
                opacity: 0.18,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              })
            )
          }
        />
      ))}
    </group>
  );
}

type StarSpec = {
  radius: number;
  tilt: [number, number, number];
  speed: number;
  phase: number;
  size: number;
  warm: boolean;
};

/** Un champ d'étoiles en orbite — pas des satellites de marketplace comme
 *  dans Core3D, juste de la lumière qui circule autour de la présence.
 *  Chaque étoile est un point fixe sur une orbite inclinée qui tourne à
 *  sa propre vitesse : le mélange d'inclinaisons évite l'effet "anneau
 *  plat" et lit comme un vrai nuage plutôt qu'un carrousel. */
function Stars({ accent, count = 18 }: { accent: THREE.Color; count?: number }) {
  const specs = useMemo<StarSpec[]>(() => {
    const arr: StarSpec[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        radius: 1.15 + (((i * 37) % 100) / 100) * 0.55,
        tilt: [
          (((i * 53) % 100) / 100 - 0.5) * 1.3,
          ((i * 71) % 100) / 100,
          (((i * 29) % 100) / 100 - 0.5) * 1.1,
        ],
        speed: 0.05 + ((i * 13) % 100) / 100 * 0.09,
        phase: i * 0.83,
        size: 0.015 + ((i * 7) % 100) / 100 * 0.018,
        warm: i % 4 === 0,
      });
    }
    return arr;
  }, [count]);

  const refs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    specs.forEach((s, i) => {
      const m = refs.current[i];
      if (!m) return;
      const a = t * s.speed + s.phase;
      m.position.set(Math.cos(a) * s.radius, 0, Math.sin(a) * s.radius);
    });
  });

  return (
    <>
      {specs.map((s, i) => (
        <group key={i} rotation={s.tilt}>
          <mesh
            ref={(o) => {
              refs.current[i] = o;
            }}
          >
            <sphereGeometry args={[s.size, 6, 6]} />
            <meshBasicMaterial color={s.warm ? accent : "#ffffff"} transparent opacity={0.85} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export default function AgentHologram3D({ accent }: HologramPalette = {}) {
  const accentColor = useMemo(() => new THREE.Color(accent ?? DEFAULT_ACCENT), [accent]);

  return (
    <Canvas
      camera={{ position: [0, 0.1, 4.4], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <BustGlow accent={accentColor} />
      <WireframeBust accent={accentColor} />
      <ScanBeam accent={accentColor} />
      <ProjectorBase accent={accentColor} />
      <Stars accent={accentColor} />
    </Canvas>
  );
}
