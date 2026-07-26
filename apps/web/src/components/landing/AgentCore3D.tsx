"use client";

// ════════════════════════════════════════════════════════════════════
// AgentCore3D — révélation de l'agent au terme de l'onboarding.
//
// Reprend exactement le langage visuel de Core3D.tsx (le logomark de
// la marque) : nuage de points en coque, halo additif au centre, une
// seule orbite avec un satellite actif. Volontairement plus simple que
// Core3D (moins de points, une seule orbite) — ici l'objet doit se lire
// comme "un" employé, pas comme le système entier.
// ════════════════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const MINT = new THREE.Color("#6ee7a8");
const PALE = new THREE.Color("#c8d2dc");

function useGlowTexture() {
  return useMemo(() => {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.12, "rgba(255,255,255,0.62)");
    g.addColorStop(0.32, "rgba(255,255,255,0.2)");
    g.addColorStop(0.62, "rgba(255,255,255,0.05)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, []);
}

function useDotTexture() {
  return useMemo(() => {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, []);
}

/** Cœur lumineux — respiration lente, comme Core3D. */
function Nucleus({ color }: { color: THREE.Color }) {
  const glow = useGlowTexture();
  const pulse = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 0.55) * 0.05;
    pulse.current.scale.setScalar(s);
  });

  const layers = [
    { scale: 2.6, opacity: 0.5 },
    { scale: 1.5, opacity: 0.62 },
    { scale: 0.75, opacity: 0.95 },
    { scale: 0.3, opacity: 1 },
  ];

  return (
    <group ref={pulse}>
      {layers.map((l) => (
        <sprite key={l.scale} scale={[l.scale, l.scale, l.scale]}>
          <spriteMaterial
            map={glow}
            color={l.scale > 1 ? color : "#ffffff"}
            transparent
            opacity={l.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/** Coque de points, en spirale de Fibonacci comme Core3D — mais plus
 *  clairsemée : un seul agent, pas le système entier. */
function AgentShell({ color, count = 900, radius = 0.82 }: { color: THREE.Color; count?: number; radius?: number }) {
  const dot = useDotTexture();
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const jitter = radius * (0.94 + Math.random() * 0.1);
      pos[i * 3] = Math.cos(theta) * r * jitter;
      pos[i * 3 + 1] = y * jitter;
      pos[i * 3 + 2] = Math.sin(theta) * r * jitter;

      tmp.copy(PALE).lerp(color, Math.pow(Math.abs(y), 3) * 0.55);
      const fade = 0.72 + Math.random() * 0.28;
      col[i * 3] = tmp.r * fade;
      col[i * 3 + 1] = tmp.g * fade;
      col[i * 3 + 2] = tmp.b * fade;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count, radius, color]);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.09;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.018}
        map={dot}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/** Une seule orbite, un seul satellite actif : "il travaille, seul". */
function SingleOrbit({ radius, color }: { radius: number; color: THREE.Color }) {
  const sat = useRef<THREE.Mesh>(null);
  const dot = useDotTexture();

  const ringGeo = useMemo(() => {
    const pts: number[] = [];
    const seg = 128;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [radius]);

  useFrame(({ clock }) => {
    if (!sat.current) return;
    const a = clock.elapsedTime * 0.3;
    sat.current.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  });

  return (
    <group rotation={[0.45, 0.2, -0.15]}>
      <primitive
        object={
          new THREE.Line(
            ringGeo,
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 })
          )
        }
      />
      <mesh ref={sat}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshBasicMaterial color={color} />
        <sprite scale={[0.36, 0.36, 0.36]}>
          <spriteMaterial
            map={dot}
            color={color}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      </mesh>
    </group>
  );
}

export type AgentRole = "commercial" | "support" | "comptabilite" | "marketing" | "rh" | "developpement";

const ROLE_COLOR: Record<AgentRole, string> = {
  commercial: "#6ee7a8", // couleur de marque par défaut — seul métier "en service" pour l'instant
  support: "#7dd3fc",
  comptabilite: "#fbbf24",
  marketing: "#f472b6",
  rh: "#a78bfa",
  developpement: "#60a5fa",
};

export default function AgentCore3D({ role = "commercial" }: { role?: AgentRole }) {
  const color = useMemo(() => new THREE.Color(ROLE_COLOR[role]), [role]);

  return (
    <Canvas
      camera={{ position: [0, 0, 3.4], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%" }}
    >
      <Nucleus color={color} />
      <AgentShell color={color} />
      <SingleOrbit radius={1.35} color={color} />
    </Canvas>
  );
}
