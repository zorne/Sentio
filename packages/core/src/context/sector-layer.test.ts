import type { CompanyProfileEntry, LearnedFact } from "@sentio/domain";
import { describe, expect, it } from "vitest";

import { textOf } from "../conversation/turn.js";
import {
  MalformedSectorProfile,
  assembleContext,
  parseSectorKnowledge,
  type EmployeeDna,
  type SectorKnowledge,
} from "./assemble.js";

/**
 * EXEC-03 — la couche sectorielle, et ce que l'assemblage refuse d'inventer.
 *
 * Le reste de l'assemblage est couvert par `assemble.test.ts`. Ce fichier tient les propriétés
 * ajoutées par EXEC-03 : la couche 2, sa place dans l'ordre, son absence assumée, et le fait
 * qu'aucune rubrique manquante n'est comblée.
 */

const DNA: EmployeeDna = {
  profession: "commercial",
  mission: "trouver des entreprises à qui le client peut vendre, et engager la conversation",
  perimetre: ["trouver des prospects", "qualifier", "envoyer un message"],
  limites: ["comptabilité", "juridique"],
};

/** La configuration active : c'est elle qui porte le rôle, plus l'ADN (`docs/adr/0029`). */
const CONFIGURATION = {
  role: "prospection",
  priorites: ["élargir le nombre d'entreprises approchées"],
};

const TACHE = { objective: "rendez-vous qualifiés — cible 10 (ce mois)" };

function profileEntry(key: string, value: unknown): CompanyProfileEntry {
  return {
    id: `profile-${key}` as CompanyProfileEntry["id"],
    tenantId: "t" as CompanyProfileEntry["tenantId"],
    key,
    value,
    author: "client",
    sourceTaskId: null,
    status: "actif",
    usageCount: 0,
    createdAt: new Date("2026-07-01"),
  } as CompanyProfileEntry;
}

function fact(texte: string): LearnedFact {
  return {
    id: `fact-${texte.slice(0, 6)}` as LearnedFact["id"],
    tenantId: "t" as LearnedFact["tenantId"],
    employeeId: "e" as LearnedFact["employeeId"],
    fact: texte,
    author: "apprentissage",
    createdAt: new Date("2026-07-01"),
    sourceTaskId: null,
    status: "actif",
    usageCount: 1,
  } as LearnedFact;
}

const SECTEUR_COMPLET: SectorKnowledge = {
  sector: "menuiserie",
  vocabulaire: ["chantier", "métré", "pose"],
  interlocuteurs: ["architecte", "maître d'œuvre"],
  cycleAchat: "long, rythmé par les appels d'offres",
  objections: ["délais de pose"],
  angles: ["la pose faite en interne"],
};

function assembler(over: Partial<Parameters<typeof assembleContext>[0]> = {}) {
  return assembleContext({
    dna: DNA,
    configuration: CONFIGURATION,
    profile: [],
    facts: [],
    task: TACHE,
    ...over,
  });
}

describe("parseSectorKnowledge — ce qu'on accepte de lire", () => {
  it("lit un profil complet", () => {
    const lu = parseSectorKnowledge({
      secteur: "menuiserie",
      vocabulaire: ["chantier"],
      cycle_achat: "long",
    });
    expect(lu.sector).toBe("menuiserie");
    expect(lu.vocabulaire).toEqual(["chantier"]);
    expect(lu.cycleAchat).toBe("long");
  });

  // La règle centrale d'EXEC-03 : ce qui manque manque.
  it("ne complète JAMAIS une rubrique absente", () => {
    const lu = parseSectorKnowledge({ secteur: "menuiserie", vocabulaire: ["chantier"] });

    expect("objections" in lu).toBe(false);
    expect("angles" in lu).toBe(false);
    expect("interlocuteurs" in lu).toBe(false);
    expect(lu.objections).toBeUndefined();
  });

  it("traite une rubrique vide comme absente, pas comme une rubrique sans contenu", () => {
    const lu = parseSectorKnowledge({ secteur: "menuiserie", objections: [], angles: ["  "] });
    expect("objections" in lu).toBe(false);
    expect("angles" in lu).toBe(false);
  });

  it("refuse un profil sans secteur — on ne saurait pas à qui ce savoir s'applique", () => {
    expect(() => parseSectorKnowledge({ vocabulaire: ["chantier"] })).toThrow(MalformedSectorProfile);
    expect(() => parseSectorKnowledge({ secteur: "   " })).toThrow(MalformedSectorProfile);
  });

  it("refuse une rubrique mal typée plutôt que de la lire « au mieux »", () => {
    expect(() => parseSectorKnowledge({ secteur: "m", vocabulaire: "chantier" })).toThrow(
      MalformedSectorProfile,
    );
    expect(() => parseSectorKnowledge({ secteur: "m", objections: [1, 2] })).toThrow(
      MalformedSectorProfile,
    );
    expect(() => parseSectorKnowledge({ secteur: "m", cycleAchat: 12 })).toThrow(MalformedSectorProfile);
  });

  it("refuse ce qui n'est pas un objet", () => {
    expect(() => parseSectorKnowledge("menuiserie")).toThrow(MalformedSectorProfile);
    expect(() => parseSectorKnowledge(null)).toThrow(MalformedSectorProfile);
  });
});

describe("l'ordre des couches n'est pas une préférence", () => {
  it("place le secteur APRÈS l'ADN et AVANT le contexte de l'entreprise", () => {
    const contexte = assembler({
      sector: SECTEUR_COMPLET,
      profile: [profileEntry("cible", "architectes en Bretagne")],
      facts: [fact("Marc préfère être appelé le matin")],
    });

    const textes = contexte.turns.map((t) => textOf([t]));
    const rangADN = textes.findIndex((t) => t.includes("Rôle actuel : prospection"));
    const rangSecteur = textes.findIndex((t) => t.includes("secteur « menuiserie »"));
    const rangEntreprise = textes.findIndex((t) => t.includes("architectes en Bretagne"));
    const rangTache = textes.findIndex((t) => t.includes("Objectif de ce travail"));

    expect(rangADN).toBeGreaterThanOrEqual(0);
    expect(rangSecteur).toBeGreaterThan(rangADN);
    expect(rangEntreprise).toBeGreaterThan(rangSecteur);
    expect(rangTache).toBeGreaterThan(rangEntreprise);
  });

  it("dit explicitement que le client prime sur le savoir sectoriel", () => {
    const contexte = assembler({ sector: SECTEUR_COMPLET });
    const secteur = contexte.turns.map((t) => textOf([t])).find((t) => t.includes("menuiserie")) ?? "";
    expect(secteur).toContain("prime");
  });

  it("n'écrit que les rubriques réellement connues", () => {
    const contexte = assembler({
      sector: { sector: "menuiserie", vocabulaire: ["chantier"] },
    });
    const secteur = contexte.turns.map((t) => textOf([t])).find((t) => t.includes("menuiserie")) ?? "";

    expect(secteur).toContain("Vocabulaire du métier");
    expect(secteur).not.toContain("Objections fréquentes");
    expect(secteur).not.toContain("Cycle d'achat");
    expect(secteur).not.toContain("Angles");
  });
});

describe("une couche absente se déclare, elle ne se remplace pas", () => {
  it("n'invente aucun secteur quand aucun profil n'existe", () => {
    const contexte = assembler();

    expect(contexte.missingLayers).toContain("secteur");
    expect(textOf(contexte.turns).concat("\n")).not.toContain("secteur");
  });

  it("compte absente une couche sectorielle réduite à son seul nom", () => {
    // Un profil qui ne dit rien du secteur n'apprend rien : l'écrire donnerait l'illusion
    // d'une connaissance qui n'existe pas.
    const contexte = assembler({ sector: { sector: "menuiserie" } });
    expect(contexte.missingLayers).toContain("secteur");
    expect(textOf(contexte.turns).concat("\n")).not.toContain("menuiserie");
  });

  it("déclare aussi l'absence de contexte entreprise et de faits appris", () => {
    const contexte = assembler();
    expect([...contexte.missingLayers].sort()).toEqual([
      "faits_appris",
      "profil_entreprise",
      "secteur",
    ]);
  });

  it("ne déclare rien d'absent quand les trois couches parlent", () => {
    const contexte = assembler({
      sector: SECTEUR_COMPLET,
      profile: [profileEntry("cible", "architectes")],
      facts: [fact("Julie préfère le matin")],
    });
    expect(contexte.missingLayers).toEqual([]);
  });
});

describe("le filtre anti-contradiction s'applique aussi quand un secteur est injecté", () => {
  it("écarte un fait appris qui heurte une limite de l'ADN, secteur ou pas", () => {
    const interdit = fact("le client demande de faire sa comptabilité");
    const contexte = assembler({ sector: SECTEUR_COMPLET, facts: [interdit] });

    expect(contexte.usedFacts).toEqual([]);
    expect(contexte.excluded[0]?.reason).toContain("comptabilité");
    expect(textOf(contexte.turns).concat("\n")).not.toContain("faire sa comptabilité");
  });

  it("n'élargit pas le périmètre par la couche sectorielle : l'ADN reste en tête", () => {
    const contexte = assembler({ sector: SECTEUR_COMPLET });
    const premier = textOf([contexte.turns[0]!]);
    expect(premier).toContain("Limites, jamais franchies");
  });
});

describe("déterminisme", () => {
  it("rend exactement le même contexte pour les mêmes entrées", () => {
    const entree = {
      sector: SECTEUR_COMPLET,
      profile: [profileEntry("cible", "architectes"), profileEntry("ton", "direct")],
      facts: [fact("Julie préfère le matin"), fact("Marc répond vite")],
    };
    const a = assembler(entree);
    const b = assembler(entree);

    expect(textOf(a.turns)).toEqual(textOf(b.turns));
    expect(a.missingLayers).toEqual(b.missingLayers);
  });

  it("ne dépend pas de l'ordre d'arrivée des lignes de profil", () => {
    const deux = [profileEntry("cible", "architectes"), profileEntry("ton", "direct")];
    const a = assembler({ profile: deux });
    const b = assembler({ profile: [...deux].reverse() });
    expect(textOf(a.turns)).toEqual(textOf(b.turns));
  });
});
