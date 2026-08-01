"use client";

// ════════════════════════════════════════════════════════════════════
// Le Noyau — la marque en mouvement, pas un objet décoratif.
//
// C'est le logomark (un cœur qui orchestre des satellites) rendu vivant :
// une coque de points en rotation lente, trois orbites inclinées, et des
// satellites dont UN SEUL est actif (mint). C'est littéralement le modèle
// de la plateforme : un socle commun, des employés en orbite, un qui
// travaille.
//
// Choix de performance — tout est pensé pour ne jamais coûter :
//   · nuage de points (pas de maillage) : quelques milliers de sommets
//   · aucun post-processing, aucune ombre, aucune lumière dynamique
//   · densité de pixels plafonnée à 1.5 (le prop `dpr` avait dérivé à
//     [1, 2] sans que ce commentaire ne bouge ; sur un écran Retina, un
//     satellite de plus payé pour rien pendant tout le scroll)
//   · la parallaxe curseur est lissée dans useFrame, sans re-rendu React
//   · `active` (passé par CoreStage, via IntersectionObserver) coupe la
//     boucle de rendu dès que le hero sort de l'écran — sans ça, la scène
//     continue de tourner à plein régime pendant tout le reste du scroll,
//     et dispute le budget d'image à chaque section suivante
// ════════════════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const MINT = new THREE.Color("#2ee6f5");
const PALE = new THREE.Color("#c8d2dc");

/** Texture de point douce, générée une fois — évite un aller-retour réseau
 *  et donne un rendu lumineux sans blending coûteux. */
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

/** Texture de halo — chute plus large et plus douce que le point, pour
 *  faire de la lumière plutôt que des grains. */
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

/**
 * Le cœur — la source de lumière qui manquait. Trois halos additifs
 * superposés à des échelles et des teintes différentes : le plus serré
 * donne le point blanc incandescent, les plus larges la diffusion.
 *
 * C'est la manière la moins chère d'obtenir un rendu de bloom : un vrai
 * post-processing coûterait plusieurs passes de rendu plein écran pour un
 * résultat à peine différent à cette échelle.
 */
function Nucleus() {
  const glow = useGlowTexture();
  const pulse = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    // Respiration très lente : le noyau doit sembler vivant, pas clignoter.
    const s = 1 + Math.sin(clock.elapsedTime * 0.55) * 0.045;
    pulse.current.scale.setScalar(s);
  });

  const layers: Array<{ scale: number; color: string; opacity: number }> = [
    { scale: 3.9, color: "#1f8a95", opacity: 0.5 },
    { scale: 2.1, color: "#2ee6f5", opacity: 0.62 },
    { scale: 1.05, color: "#eafeff", opacity: 0.95 },
    { scale: 0.42, color: "#ffffff", opacity: 1 },
  ];

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

/** Coque de points répartis en spirale de Fibonacci — distribution
 *  régulière sans amas, contrairement à un tirage aléatoire naïf. */
function CoreShell({ count = 3400, radius = 1.05 }: { count?: number; radius?: number }) {
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
      // Légère irrégularité radiale : une sphère parfaite paraît synthétique.
      const jitter = radius * (0.94 + Math.random() * 0.1);
      pos[i * 3] = Math.cos(theta) * r * jitter;
      pos[i * 3 + 1] = y * jitter;
      pos[i * 3 + 2] = Math.sin(theta) * r * jitter;

      // Dégradé du pôle vers l'équateur, une pointe de mint sur la frange.
      tmp.copy(PALE).lerp(MINT, Math.pow(Math.abs(y), 3) * 0.55);
      // Plancher relevé : à 0.42, la moitié des points étaient quasi
      // éteints et la coque se lisait comme du bruit plutôt que de la
      // matière lumineuse.
      const fade = 0.85 + Math.random() * 0.15;
      col[i * 3] = tmp.r * fade;
      col[i * 3 + 1] = tmp.g * fade;
      col[i * 3 + 2] = tmp.b * fade;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count, radius]);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.16;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.026}
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

/** Une orbite : anneau très fin + un satellite qui la parcourt. */
function Orbit({
  radius,
  tilt,
  speed,
  active = false,
  offset = 0,
}: {
  radius: number;
  tilt: [number, number, number];
  speed: number;
  active?: boolean;
  offset?: number;
}) {
  const sat = useRef<THREE.Mesh>(null);
  const dot = useDotTexture();

  const ringGeo = useMemo(() => {
    const pts: number[] = [];
    const seg = 160;
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
    const a = clock.elapsedTime * speed + offset;
    sat.current.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  });

  return (
    <group rotation={tilt}>
      <primitive object={new THREE.Line(ringGeo, new THREE.LineBasicMaterial({
        color: active ? "#2ee6f5" : "#ffffff",
        transparent: true,
        opacity: active ? 0.2 : 0.07,
      }))} />
      <mesh ref={sat}>
        <sphereGeometry args={[active ? 0.028 : 0.016, 12, 12]} />
        <meshBasicMaterial
          color={active ? "#2ee6f5" : "#9aa6b2"}
          transparent
          opacity={active ? 1 : 0.62}
        />
        {/* Halo enfant du satellite : il le suit sur son orbite. */}
        {active && (
          <sprite scale={[0.34, 0.34, 0.34]}>
            <spriteMaterial
              map={dot}
              color="#2ee6f5"
              transparent
              opacity={0.55}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        )}
      </mesh>
    </group>
  );
}

/** Parallaxe curseur, lissée. Aucun état React : on écrit directement sur
 *  la transformation du groupe à chaque frame. */
function Parallax({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  useFrame(({ pointer }) => {
    if (!g.current) return;
    const tx = pointer.y * 0.18;
    const ty = pointer.x * 0.26;
    g.current.rotation.x += (tx - g.current.rotation.x) * 0.045;
    g.current.rotation.y += (ty - g.current.rotation.y) * 0.045;
    // Recadrage doux sur petits viewports pour que le noyau reste entier.
    const s = Math.min(1, viewport.width / 6.2);
    g.current.scale.setScalar(0.78 + s * 0.22);
  });

  return <group ref={g}>{children}</group>;
}

export default function Core3D({ active = true }: { active?: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.6], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      frameloop={active ? "always" : "never"}
    >
      {/* Le noyau couronne le titre plutôt que de le traverser. À 0.42 le
          cœur incandescent tombait au milieu du mot « travaille » et
          mangeait les jambages ; remonté, il occupe le vide au-dessus et
          la typographie pose sur un fond net. */}
      <group position={[0, 1.22, 0]}>
        <Parallax>
          <Nucleus />
          <CoreShell />
          {/* Rayons contenus dans la demi-largeur visible (~2.8 unités à
              cette focale) : au-delà, les satellites sortent du cadre et
              se lisent comme des taches sur les bords. */}
          <Orbit radius={1.62} tilt={[0.42, 0, 0.18]} speed={0.33} offset={0.4} />
          <Orbit radius={2.06} tilt={[-0.55, 0.3, -0.2]} speed={0.22} active offset={2.1} />
          <Orbit radius={2.48} tilt={[0.2, -0.4, 0.5]} speed={0.16} offset={4.2} />
        </Parallax>
      </group>
    </Canvas>
  );
}
