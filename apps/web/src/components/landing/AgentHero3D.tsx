"use client";

// ════════════════════════════════════════════════════════════════════
// AgentHero3D — la présence d'un employé, pas la carte du marché.
//
// Core3D raconte la marketplace : un cœur qui orchestre plusieurs
// satellites, dont un seul est actif. Cet écran-ci arrive après le choix :
// il n'y a plus qu'un employé, déjà recruté, à l'écoute. Le motif change
// donc de sens plutôt que de simplement changer de couleur :
//
//   · un noyau plus dense et plus resserré — "formé", pas "en construction"
//   · une seule ouverture (aperture) tournée vers l'écran, pas une orbite
//     parmi d'autres
//   · des impulsions concentriques qui se propagent vers l'extérieur —
//     la respiration de quelqu'un qui écoute, pas une rotation de marché
//
// Mêmes garde-fous de performance que Core3D :
//   · nuage de points, aucun maillage ni ombre ni lumière dynamique
//   · dpr plafonné à 1.5, aucun post-processing
//   · parallaxe lissée dans useFrame, sans re-rendu React
// ════════════════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type AgentHeroPalette = {
  /** Couleur signature de l'agent (remplace le mint par défaut). */
  accent?: string;
  /** Couleur neutre de la coque, loin du pôle actif. */
  base?: string;
};

const DEFAULT_ACCENT = "#6ee7a8";
const DEFAULT_BASE = "#c8d2dc";

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

function Nucleus({ accent }: { accent: THREE.Color }) {
  const glow = useGlowTexture();
  const pulse = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 0.6) * 0.05;
    pulse.current.scale.setScalar(s);
  });

  const layers = useMemo(
    () => [
      { scale: 3.2, color: accent.clone().multiplyScalar(0.75).getStyle(), opacity: 0.46 },
      { scale: 1.7, color: accent.getStyle(), opacity: 0.66 },
      { scale: 0.86, color: "#eafff4", opacity: 0.96 },
      { scale: 0.34, color: "#ffffff", opacity: 1 },
    ],
    [accent]
  );

  return (
    <group ref={pulse}>
      {layers.map((l) => (
        <sprite key={l.scale} scale={[l.scale, l.scale, l.scale]}>
          <spriteMaterial
            map={glow}
            color={l.color}
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

function AgentShell({
  count = 2600,
  radius = 0.74,
  accent,
  base,
}: {
  count?: number;
  radius?: number;
  accent: THREE.Color;
  base: THREE.Color;
}) {
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
      const jitter = radius * (0.95 + Math.random() * 0.08);
      pos[i * 3] = Math.cos(theta) * r * jitter;
      pos[i * 3 + 1] = y * jitter;
      pos[i * 3 + 2] = Math.sin(theta) * r * jitter;

      tmp.copy(base).lerp(accent, Math.pow(Math.abs(y), 2.4) * 0.72);
      const fade = 0.76 + Math.random() * 0.24;
      col[i * 3] = tmp.r * fade;
      col[i * 3 + 1] = tmp.g * fade;
      col[i * 3 + 2] = tmp.b * fade;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count, radius, accent, base]);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.06;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.022}
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

function Aperture({ radius = 1.5, accent }: { radius?: number; accent: THREE.Color }) {
  const ring = useRef<THREE.Line>(null);

  const geo = useMemo(() => {
    const pts: number[] = [];
    const seg = 200;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(Math.cos(a) * radius, Math.sin(a) * radius * 0.98, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [radius]);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    ring.current.rotation.z = clock.elapsedTime * 0.05;
  });

  return (
    <primitive
      ref={ring}
      object={
        new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({
            color: accent,
            transparent: true,
            opacity: 0.24,
          })
        )
      }
    />
  );
}

function ListeningPulses({ accent }: { accent: THREE.Color }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const COUNT = 3;
  const PERIOD = 3.2;

  const geo = useMemo(() => new THREE.RingGeometry(1, 1.018, 96), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [accent]
  );

  useFrame(({ clock }) => {
    for (let i = 0; i < COUNT; i++) {
      const mesh = rings.current[i];
      if (!mesh) continue;
      const t = ((clock.elapsedTime + (i * PERIOD) / COUNT) % PERIOD) / PERIOD;
      const scale = 0.4 + t * 2.6;
      mesh.scale.setScalar(scale);
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.opacity = t < 0.15 ? (t / 0.15) * 0.5 : 0.5 * (1 - (t - 0.15) / 0.85);
    }
  });

  return (
    <group rotation={[0, 0, 0]}>
      {Array.from({ length: COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m;
          }}
          geometry={geo}
          material={mat.clone()}
        />
      ))}
    </group>
  );
}

function Parallax({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  useFrame(({ pointer }) => {
    if (!g.current) return;
    const tx = pointer.y * 0.1;
    const ty = pointer.x * 0.15;
    g.current.rotation.x += (tx - g.current.rotation.x) * 0.04;
    g.current.rotation.y += (ty - g.current.rotation.y) * 0.04;
    const s = Math.min(1, viewport.width / 6.2);
    g.current.scale.setScalar(0.82 + s * 0.18);
  });

  return <group ref={g}>{children}</group>;
}

export default function AgentHero3D({ accent, base }: AgentHeroPalette = {}) {
  const accentColor = useMemo(() => new THREE.Color(accent ?? DEFAULT_ACCENT), [accent]);
  const baseColor = useMemo(() => new THREE.Color(base ?? DEFAULT_BASE), [base]);

  return (
    <Canvas
      camera={{ position: [0, 0, 4.2], fov: 40 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <group position={[0, 0, 0]}>
        <Parallax>
          <ListeningPulses accent={accentColor} />
          <Nucleus accent={accentColor} />
          <AgentShell accent={accentColor} base={baseColor} />
          <Aperture accent={accentColor} radius={1.5} />
        </Parallax>
      </group>
    </Canvas>
  );
}
