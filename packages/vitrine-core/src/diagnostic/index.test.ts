import { describe, expect, it } from "vitest";
import { HANDLED_FRICTIONS } from "@sentio/domain";

import { stepDiagnostic, type ConverseOutcome, type DiagnosticMessage } from "./index.js";

const HISTORY: DiagnosticMessage[] = [{ role: "user", content: "On ne prospecte pas assez." }];

const VALID_CANDIDATE = {
  sector: "menuiserie",
  headcount: 8,
  friction: HANDLED_FRICTIONS.tooFewProspects,
  objective: { metric: "€ de chiffre d'affaires", target: 5000, horizon: "mois" },
  targetCustomers: "architectes et maîtres d'œuvre",
  hasProspectList: true,
  inboundHandling: null,
};

/** Un faux `converse` scripté : une réponse par appel, dans l'ordre. */
function scripted(...outcomes: ConverseOutcome[]) {
  const calls: Array<{ history: readonly DiagnosticMessage[]; hint?: readonly string[] }> = [];
  let i = 0;
  return {
    calls,
    converse: async (input: { history: readonly DiagnosticMessage[]; hint?: readonly string[] }) => {
      calls.push(input);
      const outcome = outcomes[i];
      i += 1;
      if (!outcome) throw new Error("scripted() appelé plus de fois que prévu");
      return outcome;
    },
  };
}

describe("stepDiagnostic — ce qu'un pas de diagnostic produit", () => {
  it("continue la conversation quand le modèle répond en prose", async () => {
    const { converse, calls } = scripted({ reply: "Depuis combien de temps ?" });
    const result = await stepDiagnostic(HISTORY, { converse });
    expect(result).toEqual({ stage: "conversation", reply: "Depuis combien de temps ?" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.hint).toBeUndefined();
  });

  it("rend la décision du moteur quand le candidat extrait est valide", async () => {
    const { converse } = scripted({ candidate: VALID_CANDIDATE });
    const result = await stepDiagnostic(HISTORY, { converse });
    expect(result.stage).toBe("decided");
    if (result.stage !== "decided") return;
    expect(result.decision.status).toBe("recommande");
  });

  it("rend hors_perimetre quand le frein extrait n'est pas traité, sans jamais planter", async () => {
    const { converse } = scripted({
      candidate: { ...VALID_CANDIDATE, friction: "comptabilite" },
    });
    const result = await stepDiagnostic(HISTORY, { converse });
    expect(result.stage).toBe("decided");
    if (result.stage !== "decided") return;
    expect(result.decision.status).toBe("hors_perimetre");
  });

  it("retente une fois avec un indice quand le premier candidat est invalide, puis continue en prose", async () => {
    const { converse, calls } = scripted(
      { candidate: { sector: null } }, // profil très incomplet
      { reply: "Et à qui vendez-vous ?" },
    );
    const result = await stepDiagnostic(HISTORY, { converse });
    expect(result).toEqual({ stage: "conversation", reply: "Et à qui vendez-vous ?" });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.hint?.length).toBeGreaterThan(0);
  });

  it("retente une fois, et rend la décision si le second candidat est valide", async () => {
    const { converse, calls } = scripted(
      { candidate: { sector: null } },
      { candidate: VALID_CANDIDATE },
    );
    const result = await stepDiagnostic(HISTORY, { converse });
    expect(result.stage).toBe("decided");
    expect(calls).toHaveLength(2);
  });

  it("ne boucle jamais indéfiniment : deux candidats invalides d'affilée retombent sur une relance sobre", async () => {
    const { converse, calls } = scripted(
      { candidate: { sector: null } },
      { candidate: { sector: null } },
    );
    const result = await stepDiagnostic(HISTORY, { converse });
    expect(result.stage).toBe("conversation");
    expect(calls).toHaveLength(2);
    if (result.stage === "conversation") {
      expect(result.reply.length).toBeGreaterThan(0);
    }
  });

  it("ne montre jamais les champs fautifs bruts au visiteur, même en cas de double échec", async () => {
    const { converse } = scripted(
      { candidate: { sector: null } },
      { candidate: { sector: null } },
    );
    const result = await stepDiagnostic(HISTORY, { converse });
    if (result.stage === "conversation") {
      expect(result.reply).not.toMatch(/sector|friction|objective/);
    }
  });
});
