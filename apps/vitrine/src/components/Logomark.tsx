// ════════════════════════════════════════════════════════════════════
// Logomark — cœur + orbites : UN Platform Core qui orchestre plusieurs
// agents autonomes (nœuds en orbite), l'un d'eux actif (mint, en travail).
// Fidèle à l'architecture réelle (le Model Gateway/runtime orchestre les
// agent_instance) plutôt qu'un symbole arbitraire — voir docs/DECISIONS.md.
// Codé en SVG, aucune dépendance à un générateur d'image externe.
// ════════════════════════════════════════════════════════════════════

export function Logomark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="var(--text-primary)" />
      <circle cx="12" cy="12" r="9.5" stroke="var(--border-strong)" strokeWidth="1" fill="none" />
      <circle cx="20.5" cy="12" r="1.4" fill="var(--text-tertiary)" />
      <circle cx="6.2" cy="6.5" r="1.4" fill="var(--text-tertiary)" />
      <circle cx="6.2" cy="17.5" r="1.6" fill="var(--green)" />
    </svg>
  );
}
