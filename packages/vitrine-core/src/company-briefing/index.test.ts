import { describe, expect, it } from "vitest";

import { stepBriefing, type BriefingConverseOutcome, type BriefingMessage } from "./index.js";

const HISTORY: BriefingMessage[] = [{ role: "user", content: "Nous vendons du mobilier sur mesure." }];

function scripted(...outcomes: BriefingConverseOutcome[]) {
  const calls: Array<{ history: readonly BriefingMessage[]; hint?: readonly string[] }> = [];
  let i = 0;
  return {
    calls,
    converse: async (input: { history: readonly BriefingMessage[]; hint?: readonly string[] }) => {
      calls.push(input);
      const outcome = outcomes[i];
      i += 1;
      if (!outcome) throw new Error("scripted() appelé plus de fois que prévu");
      return outcome;
    },
  };
}

describe("stepBriefing — ce qu'un pas de briefing produit", () => {
  it("continue la conversation quand le modèle répond en prose", async () => {
    const { converse, calls } = scripted({ reply: "Et à quoi ressemble un bon client pour vous ?" });
    const result = await stepBriefing(HISTORY, { converse });
    expect(result).toEqual({ stage: "conversation", reply: "Et à quoi ressemble un bon client pour vous ?" });
    expect(calls).toHaveLength(1);
  });

  it("enregistre la configuration quand les deux champs sont fournis", async () => {
    const { converse } = scripted({
      candidate: { cible: "Architectes et maîtres d'œuvre en Bretagne", offre: "Devis gratuit sous 48h" },
    });
    const result = await stepBriefing(HISTORY, { converse });
    expect(result).toEqual({
      stage: "configured",
      profile: { cible: "Architectes et maîtres d'œuvre en Bretagne", offre: "Devis gratuit sous 48h" },
    });
  });

  it("recadre les espaces superflus des deux champs", async () => {
    const { converse } = scripted({ candidate: { cible: "  archi  ", offre: "  devis  " } });
    const result = await stepBriefing(HISTORY, { converse });
    if (result.stage !== "configured") throw new Error("attendu configured");
    expect(result.profile).toEqual({ cible: "archi", offre: "devis" });
  });

  it("retente une fois avec un indice si un seul champ est fourni, puis continue en prose", async () => {
    const { converse, calls } = scripted(
      { candidate: { cible: "Architectes" } },
      { reply: "Et quelle offre mettre en avant ?" },
    );
    const result = await stepBriefing(HISTORY, { converse });
    expect(result).toEqual({ stage: "conversation", reply: "Et quelle offre mettre en avant ?" });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.hint).toContain("l'offre à mettre en avant");
  });

  it("retente une fois, et enregistre si le second candidat est complet", async () => {
    const { converse, calls } = scripted(
      { candidate: { cible: "Architectes" } },
      { candidate: { cible: "Architectes", offre: "Devis gratuit" } },
    );
    const result = await stepBriefing(HISTORY, { converse });
    expect(result.stage).toBe("configured");
    expect(calls).toHaveLength(2);
  });

  it("ne boucle jamais indéfiniment : deux candidats incomplets d'affilée retombent sur une relance sobre", async () => {
    const { converse, calls } = scripted({ candidate: {} }, { candidate: {} });
    const result = await stepBriefing(HISTORY, { converse });
    expect(result.stage).toBe("conversation");
    expect(calls).toHaveLength(2);
  });
});
