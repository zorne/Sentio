"use client";

// ════════════════════════════════════════════════════════════════════
// AgentSkillCards — les compétences qui "s'équipent" autour de
// l'hologramme. Chaque compétence a un emplacement fixe (pas de
// réorganisation qui ferait sauter la mise en page) : elle s'allume ou
// s'éteint selon `active`, en fondu — jamais un montage/démontage brutal.
// ════════════════════════════════════════════════════════════════════

import { SKILL_CATALOG, type SkillId } from "@/lib/agent-skills";

// Emplacements en pourcentage autour du centre (l'hologramme). L'ordre
// suit celui du catalogue : une compétence occupe toujours la même case.
type Slot = { top: string; left: string; transform?: string };

const SLOTS: Slot[] = [
  { top: "4%", left: "0%" },
  { top: "2%", left: "100%", transform: "translateX(-100%)" },
  { top: "40%", left: "-4%" },
  { top: "40%", left: "104%", transform: "translateX(-100%)" },
  { top: "80%", left: "2%" },
  { top: "80%", left: "98%", transform: "translateX(-100%)" },
];

export function AgentSkillCards({ active }: { active: SkillId[] }) {
  const ids = Object.keys(SKILL_CATALOG) as SkillId[];
  const activeSet = new Set(active);

  return (
    <div className="skc-field" aria-live="polite">
      {ids.map((id, i) => {
        const slot = SLOTS[i % SLOTS.length]!;
        const isOn = activeSet.has(id);
        const skill = SKILL_CATALOG[id];
        return (
          <div
            key={id}
            className={`skc-card${isOn ? " is-on" : ""}`}
            style={{ top: slot.top, left: slot.left, transform: slot.transform }}
          >
            <span className="skc-label">{skill.label}</span>
            <span className="skc-desc">{skill.desc}</span>
          </div>
        );
      })}
    </div>
  );
}
