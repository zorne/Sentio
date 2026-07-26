// ════════════════════════════════════════════════════════════════════
// Compétences affichées autour de l'hologramme pendant l'onboarding —
// volontairement découplé du chat : le chat ne fait qu'émettre le texte
// du visiteur, cette fonction pure décide quelles compétences "s'équipent".
// Ajouter une règle ou une compétence ne touche jamais au chat.
// ════════════════════════════════════════════════════════════════════

export type SkillId = "crm-read" | "followups" | "prioritize" | "autonomy" | "journal" | "high-volume";

export const SKILL_CATALOG: Record<SkillId, { label: string; desc: string }> = {
  "crm-read": { label: "Lit vos leads CRM", desc: "Ouvre vos données commerciales sans ressaisie." },
  followups: { label: "Rédige les relances", desc: "Emails de suivi personnalisés par prospect." },
  prioritize: { label: "Priorise les chauds", desc: "Classe les leads selon leur probabilité de closing." },
  autonomy: { label: "Autonomie réglable", desc: "Vous décidez ce qu'il fait seul." },
  journal: { label: "Journal & validations", desc: "Chaque décision est tracée, rien d'irréversible sans vous." },
  "high-volume": { label: "Tient le volume", desc: "Des dizaines de prospects traités en parallèle." },
};

// Toujours équipées : le socle du métier commercial, indépendant de ce
// que le visiteur raconte.
const DEFAULT_SKILLS: SkillId[] = ["crm-read", "autonomy", "journal"];

const RULES: Array<{ pattern: RegExp; skill: SkillId }> = [
  { pattern: /(relance|email|mail|courriel|suivi)/i, skill: "followups" },
  { pattern: /(urgent|priorit|chaud|important|rapide)/i, skill: "prioritize" },
  { pattern: /(beaucoup|volume|centaine|nombreux|masse|nombreuses)/i, skill: "high-volume" },
];

export function matchSkills(userTexts: string[]): SkillId[] {
  const joined = userTexts.join(" \n ");
  const active = new Set<SkillId>(DEFAULT_SKILLS);
  for (const rule of RULES) {
    if (rule.pattern.test(joined)) active.add(rule.skill);
  }
  return Array.from(active);
}
