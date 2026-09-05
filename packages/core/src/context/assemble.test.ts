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

/** La configuration active : c'est elle qui porte le rôle, plus l'ADN (`docs/adr/0029`). */
const CONFIGURATION = {
  role: "prospection",
  priorites: ["élargir le nombre d'entreprises approchées"],
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
      configuration: CONFIGURATION,
      profile: [profileEntry("secteur", "menuiserie")],
      facts: [fact({ fact: "Les relances du mardi marchent mieux." })],
      task: { objective: "contacter cinq entreprises" },
    });

    const first = context.turns[0];
    expect(first?.role).toBe("system");
    expect(first?.type === "text" && first.text).toMatch(/Rôle actuel : prospection/);
    // La tâche vient en dernier : elle précise, elle ne redéfinit pas.
    expect(context.turns[context.turns.length - 1]?.role).toBe("user");
  });

  it("n'injecte que la mémoire active", () => {
    const context = assembleContext({
      dna: DNA,
      configuration: CONFIGURATION,
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
  it("⭐⭐ garde les plus RÉCENTS — et `usageCount` n'y change rien", () => {
    // Le tri a reposé sur `usageCount`, un compteur que rien n'incrémente en production : le
    // classement était donc chronologique en le disant autrement. Le rétablir aurait été pire —
    // un compteur nourri par la sélection qu'il alimente fige la mémoire sur les premiers faits
    // appris, et un fait neuf, parti à zéro, ne serait jamais choisi donc jamais compté.
    const context = assembleContext({
      dna: DNA,
      configuration: CONFIGURATION,
      profile: [],
      facts: [
        fact({ id: "vieux" as LearnedFact["id"], fact: "Très utilisé, et vieux.", usageCount: 50, createdAt: new Date("2026-06-01") }),
        fact({ id: "hier" as LearnedFact["id"], fact: "Observé hier.", usageCount: 0, createdAt: new Date("2026-07-20") }),
        fact({ id: "avant-hier" as LearnedFact["id"], fact: "Observé avant-hier.", usageCount: 0, createdAt: new Date("2026-07-19") }),
      ],
      task: { objective: "prospecter" },
      maxLearnedFacts: 2,
    });

    expect(context.usedFacts.map((f) => f.id)).toEqual(["hier", "avant-hier"]);
    expect(context.excluded.map((e) => e.factId)).toEqual(["vieux"]);
  });

  it("départage deux faits du même instant de façon stable", () => {
    // Deux faits écrits par la même réflexion partagent leur horodatage. Sans départage, deux
    // assemblages du même contexte pourraient retenir des faits différents — et le même run
    // deviendrait irreproductible.
    const memeInstant = new Date("2026-07-20");
    const entree = {
      dna: DNA,
      configuration: CONFIGURATION,
      profile: [],
      facts: [
        fact({ id: "b" as LearnedFact["id"], fact: "Fait B.", createdAt: memeInstant }),
        fact({ id: "a" as LearnedFact["id"], fact: "Fait A.", createdAt: memeInstant }),
      ],
      task: { objective: "prospecter" },
      maxLearnedFacts: 1,
    };

    expect(assembleContext(entree).usedFacts.map((f) => f.id)).toEqual(
      assembleContext(entree).usedFacts.map((f) => f.id),
    );
  });

  it("borne le nombre de faits — le coût ne doit pas croître avec l'ancienneté du client", () => {
    const facts = Array.from({ length: 100 }, (_, index) =>
      fact({ id: `f${index}` as LearnedFact["id"], fact: `Fait ${index}.`, usageCount: index }),
    );

    const context = assembleContext({
      dna: DNA,
      configuration: CONFIGURATION,
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
      configuration: CONFIGURATION,
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
