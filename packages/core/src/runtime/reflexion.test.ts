import { describe, expect, it } from "vitest";

import type { EmployeeDna } from "../context/assemble.js";
import {
  LONGUEUR_MAXIMALE_D_UN_FAIT,
  LONGUEUR_MINIMALE_D_UN_FAIT,
  trierLesFaitsDUnRun,
} from "./reflexion.js";

/**
 * La réflexion est le seul endroit où l'employé écrit dans sa propre mémoire. Ces tests portent
 * donc sur ce qu'elle refuse d'y écrire — et sur le fait qu'elle explique chaque refus.
 */

const adn: EmployeeDna = {
  profession: "commercial",
  mission: "trouver des clients",
  perimetre: ["qualifier un prospect", "écrire un premier message"],
  limites: ["comptabilité", "juridique", "remise commerciale"],
};

function trier(propositions: readonly string[], options: { maximum?: number; connus?: string[] } = {}) {
  return trierLesFaitsDUnRun({
    propositions,
    dna: adn,
    faitsConnus: options.connus ?? [],
    maximum: options.maximum ?? 3,
  });
}

describe("Ce que la réflexion retient", () => {
  it("retient les faits recevables, débarrassés de leurs espaces", () => {
    const { retenus, ecartes } = trier([
      "  Les artisans répondent plus volontiers en fin de semaine.  ",
    ]);

    expect(retenus).toEqual(["Les artisans répondent plus volontiers en fin de semaine."]);
    expect(ecartes).toHaveLength(0);
  });

  it("ne retient rien quand il n'y a rien à retenir, et ce n'est pas un échec", () => {
    expect(trier([])).toEqual({ retenus: [], ecartes: [] });
  });

  it("s'arrête au plafond et dit pourquoi", () => {
    const { retenus, ecartes } = trier(
      [
        "Les artisans répondent plutôt en fin de semaine.",
        "Le devis est demandé dès le premier échange.",
        "Le prix arrive toujours en deuxième question.",
        "Les relances du lundi restent sans réponse.",
      ],
      { maximum: 3 },
    );

    expect(retenus).toHaveLength(3);
    expect(ecartes).toEqual([
      {
        fait: "Les relances du lundi restent sans réponse.",
        raison: "plafond de 3 fait(s) par run atteint",
      },
    ]);
  });
});

describe("Ce que la réflexion refuse d'écrire", () => {
  it("écarte un fait qui heurte une limite de l'ADN", () => {
    const { retenus, ecartes } = trier(["Le client attend un conseil de comptabilité annuel."]);

    expect(retenus).toHaveLength(0);
    expect(ecartes[0]?.raison).toContain("heurte une limite de l'ADN");
  });

  it("écarte un fait trop court pour en être un", () => {
    const { retenus, ecartes } = trier(["répondu"]);

    expect(retenus).toHaveLength(0);
    expect(ecartes[0]?.raison).toContain(String(LONGUEUR_MINIMALE_D_UN_FAIT));
  });

  it("écarte un compte rendu déguisé en fait", () => {
    const { ecartes } = trier(["a".repeat(LONGUEUR_MAXIMALE_D_UN_FAIT + 1)]);

    expect(ecartes[0]?.raison).toContain("tient dans une ligne");
  });

  it("écarte ce que l'entreprise sait déjà, à la typographie près", () => {
    const { retenus, ecartes } = trier(["Les ARTISANS répondent en fin de semaine."], {
      connus: ["les artisans repondent en fin de semaine."],
    });

    expect(retenus).toHaveLength(0);
    expect(ecartes[0]?.raison).toBe("déjà connu de cette entreprise");
  });

  it("écarte un fait répété deux fois dans le même run", () => {
    const { retenus, ecartes } = trier([
      "Les artisans répondent en fin de semaine.",
      "les artisans repondent en fin de semaine.",
    ]);

    expect(retenus).toHaveLength(1);
    expect(ecartes[0]?.raison).toBe("répété dans le même run");
  });

  it("motive chaque écart, sans exception", () => {
    const { ecartes } = trier(["x", "a".repeat(400), "Une remise commerciale a été demandée ici."]);

    expect(ecartes).toHaveLength(3);
    for (const ecart of ecartes) {
      expect(ecart.raison.trim()).not.toBe("");
    }
  });
});

describe("Le plafond compte des faits retenus, pas des lignes reçues", () => {
  it("ne laisse pas trois propositions irrecevables consommer les trois places", () => {
    const { retenus } = trier(
      ["x", "y", "z", "Les artisans répondent plutôt en fin de semaine."],
      { maximum: 3 },
    );

    expect(retenus).toEqual(["Les artisans répondent plutôt en fin de semaine."]);
  });
});

describe("Un plafond absurde ne fait pas tomber la réflexion", () => {
  it("écarte tout plutôt que de lever quand le plafond est nul ou négatif", () => {
    const { retenus, ecartes } = trier(["Les artisans répondent plutôt en fin de semaine."], {
      maximum: 0,
    });

    expect(retenus).toHaveLength(0);
    expect(ecartes[0]?.raison).toContain("plafond");
  });
});
