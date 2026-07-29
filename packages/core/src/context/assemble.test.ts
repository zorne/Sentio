import type { CompanyProfileEntry, LearnedFact } from "@sentio/domain";
import { describe, expect, it } from "vitest";

import { textOf } from "../conversation/turn.js";
import {
  MalformedDna,
  assembleContext,
  contradictsDna,
  parseDna,
  type EmployeeDna,
} from "./assemble.js";

const DNA: EmployeeDna = {
  profession: "commercial",
  mission: "trouver des entreprises à qui le client peut vendre, et engager la conversation",
  perimetre: ["trouver des prospects", "qualifier", "envoyer un message", "relancer"],
  limites: ["comptabilité", "juridique", "recrutement de personnes"],
};

function fact(overrides: Partial<LearnedFact> & { fact: string }): LearnedFact {
  return {
    id: (overrides.id ?? `fact-${overrides.fact.slice(0, 8)}`) as LearnedFact["id"],
    tenantId: "t" as LearnedFact["tenantId"],
    employeeId: "e" as LearnedFact["employeeId"],
    author: "apprentissage",
    createdAt: new Date("2026-07-01"),
    sourceTaskId: null,
    status: "actif",
    usageCount: 0,
    ...overrides,
  } as LearnedFact;
}

function profileEntry(key: string, value: unknown, status: "actif" | "retire" = "actif"): CompanyProfileEntry {
  return {
    id: `profile-${key}` as CompanyProfileEntry["id"],
    tenantId: "t" as CompanyProfileEntry["tenantId"],
    key,
    value,
    author: "client",
    createdAt: new Date("2026-07-01"),
    sourceTaskId: null,
    status,
    usageCount: 0,
  };
}

describe("parseDna", () => {
  it("refuse un ADN sans limites", () => {
    expect(() => parseDna({ profession: "commercial", mission: "m", perimetre: ["a"], limites: [] })).toThrow(
      MalformedDna,
    );
  });

  it("refuse un ADN illisible plutôt que de produire un employé sans frontières", () => {
    expect(() => parseDna("commercial")).toThrow(MalformedDna);
    expect(() => parseDna({ profession: "commercial" })).toThrow(MalformedDna);
  });

  it("lit un ADN complet", () => {
    const dna = parseDna({ ...DNA, regles: ["toujours proposer un moyen de refuser"] });
    expect(dna.regles).toHaveLength(1);
  });
});

describe("assemblage — l'ordre des couches", () => {
  it("place l'ADN en premier, toujours", () => {
    const context = assembleContext({
      dna: DNA,
      profile: [profileEntry("secteur", "menuiserie")],
      facts: [fact({ fact: "Les relances du mardi marchent mieux." })],
      task: { objective: "contacter cinq entreprises" },
    });

    const first = context.turns[0];
    expect(first?.role).toBe("system");
    expect(first?.type === "text" && first.text).toMatch(/Métier : commercial/);
    // La tâche vient en dernier : elle précise, elle ne redéfinit pas.
    expect(context.turns[context.turns.length - 1]?.role).toBe("user");
  });

  it("n'injecte que la mémoire active", () => {
    const context = assembleContext({
      dna: DNA,
      profile: [profileEntry("secteur", "menuiserie"), profileEntry("ancien", "obsolète", "retire")],
      facts: [
        fact({ fact: "Fait retiré par le client.", status: "retire", id: "retire" as LearnedFact["id"] }),
        fact({ fact: "Fait valide.", id: "valide" as LearnedFact["id"] }),
      ],
      task: { objective: "prospecter" },
    });

    const texte = textOf(context.turns);
    expect(texte).toContain("Fait valide.");
    expect(texte).not.toContain("Fait retiré");
    expect(texte).not.toContain("obsolète");
  });
});

describe("assemblage — tri et bornage des faits appris", () => {
  it("garde les plus utilisés, puis les plus récents", () => {
    const context = assembleContext({
      dna: DNA,
      profile: [],
      facts: [
        fact({ id: "peu" as LearnedFact["id"], fact: "Peu utilisé.", usageCount: 1 }),
        fact({ id: "beaucoup" as LearnedFact["id"], fact: "Très utilisé.", usageCount: 50 }),
        fact({ id: "recent" as LearnedFact["id"], fact: "Récent.", usageCount: 1, createdAt: new Date("2026-07-20") }),
      ],
      task: { objective: "prospecter" },
      maxLearnedFacts: 2,
    });

    expect(context.usedFacts.map((f) => f.id)).toEqual(["beaucoup", "recent"]);
    expect(context.excluded.map((e) => e.factId)).toEqual(["peu"]);
  });

  it("borne le nombre de faits — le coût ne doit pas croître avec l'ancienneté du client", () => {
    const facts = Array.from({ length: 100 }, (_, index) =>
      fact({ id: `f${index}` as LearnedFact["id"], fact: `Fait ${index}.`, usageCount: index }),
    );

    const context = assembleContext({
      dna: DNA,
      profile: [],
      facts,
      task: { objective: "prospecter" },
      maxLearnedFacts: 5,
    });

    expect(context.usedFacts).toHaveLength(5);
    expect(context.excluded).toHaveLength(95);
  });
});

describe("assemblage — filtre anti-contradiction", () => {
  it("écarte un fait appris qui heurte une limite de l'ADN", () => {
    const context = assembleContext({
      dna: DNA,
      profile: [],
      facts: [
        fact({ id: "hors" as LearnedFact["id"], fact: "Le client veut qu'on prenne en charge sa comptabilité." }),
        fact({ id: "bon" as LearnedFact["id"], fact: "Le client vend aux artisans." }),
      ],
      task: { objective: "prospecter" },
    });

    expect(context.usedFacts.map((f) => f.id)).toEqual(["bon"]);
    expect(context.excluded[0]).toMatchObject({ factId: "hors" });
    expect(context.excluded[0]?.reason).toMatch(/limite de l'ADN/);
    // Et surtout : le fait écarté n'apparaît nulle part dans ce qui est envoyé. Le mot
    // « comptabilité », lui, reste présent — dans les LIMITES de l'ADN, à sa place.
    const texte = textOf(context.turns);
    expect(texte).not.toContain("prenne en charge sa comptabilité");
    expect(texte).toContain("Limites, jamais franchies");
  });

  it("ne se laisse pas contourner par la casse ni les accents", () => {
    expect(contradictsDna("On gère la COMPTABILITE du client.", DNA)).not.toBeNull();
    expect(contradictsDna("Rien à voir avec ces sujets.", DNA)).toBeNull();
  });
});
