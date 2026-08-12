import { describe, expect, it } from "vitest";

import {
  choisirLesVariantes,
  choisirUneVariante,
  empreinteStable,
  type VarianteDeStrategie,
} from "./variantes.js";

function angle(key: string, options: Partial<VarianteDeStrategie> = {}): VarianteDeStrategie {
  return { id: `id-${key}`, kind: "angle", key, actif: true, parDefaut: false, ...options };
}

function moment(key: string, options: Partial<VarianteDeStrategie> = {}): VarianteDeStrategie {
  return {
    id: `id-${key}`,
    kind: "moment_de_relance",
    key,
    actif: true,
    parDefaut: false,
    ...options,
  };
}

const troisAngles = [angle("a_probleme"), angle("b_question"), angle("c_secteur")];

describe("Le choix est reproductible", () => {
  it("rend toujours la même variante pour la même mission", () => {
    const premier = choisirUneVariante(troisAngles, "mission-42");
    for (let essai = 0; essai < 50; essai += 1) {
      expect(choisirUneVariante(troisAngles, "mission-42")?.key).toBe(premier?.key);
    }
  });

  it("ne dépend pas de l'ordre dans lequel la base rend les lignes", () => {
    const ordreA = choisirUneVariante(troisAngles, "mission-7")?.key;
    const ordreB = choisirUneVariante([...troisAngles].reverse(), "mission-7")?.key;

    expect(ordreA).toBe(ordreB);
  });

  it("donne la même empreinte pour la même chaîne, et une valeur bornée", () => {
    expect(empreinteStable("mission-42")).toBe(empreinteStable("mission-42"));
    expect(empreinteStable("mission-42")).not.toBe(empreinteStable("mission-43"));
    expect(empreinteStable("mission-42")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(empreinteStable(""))).toBe(true);
  });
});

describe("Le choix répartit", () => {
  it("n'enferme pas toutes les missions sur une seule variante", () => {
    const vues = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const choisie = choisirUneVariante(troisAngles, `mission-${index}`);
      if (choisie !== null) vues.add(choisie.key);
    }

    expect(vues.size).toBe(3);
  });
});

describe("Ce que le choix refuse", () => {
  it("ignore les variantes désactivées", () => {
    const variantes = [angle("a", { actif: false }), angle("b"), angle("c", { actif: false })];

    for (let index = 0; index < 30; index += 1) {
      expect(choisirUneVariante(variantes, `mission-${index}`)?.key).toBe("b");
    }
  });

  it("rend null quand tout est désactivé, plutôt que de jouer une variante éteinte", () => {
    const variantes = [angle("a", { actif: false }), angle("b", { actif: false })];

    expect(choisirUneVariante(variantes, "mission-1")).toBeNull();
  });

  it("rend null sur une liste vide", () => {
    expect(choisirUneVariante([], "mission-1")).toBeNull();
  });
});

describe("Sans mission à laquelle s'adosser", () => {
  it("retombe sur la variante par défaut, jamais sur un tirage", () => {
    const variantes = [angle("a"), angle("b", { parDefaut: true }), angle("c")];

    expect(choisirUneVariante(variantes, "")?.key).toBe("b");
    expect(choisirUneVariante(variantes, "   ")?.key).toBe("b");
  });

  it("prend la première par ordre de clé si aucune n'est déclarée par défaut", () => {
    expect(choisirUneVariante(troisAngles, "")?.key).toBe("a_probleme");
  });
});

describe("Un jeu de variantes pour une mission", () => {
  it("rend au plus une variante par genre", () => {
    const choisies = choisirLesVariantes(
      [...troisAngles, moment("espace_3_10"), moment("espace_4_7")],
      "mission-9",
    );

    expect(choisies).toHaveLength(2);
    expect(new Set(choisies.map((v) => v.kind))).toEqual(new Set(["angle", "moment_de_relance"]));
  });

  it("ne corrèle pas les genres entre eux", () => {
    // Avec deux genres de même cardinalité et une clé commune, un choix naïf donnerait toujours
    // le même RANG dans les deux — les variantes seraient appariées au lieu d'être croisées.
    const paires = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const choisies = choisirLesVariantes(
        [angle("a1"), angle("a2"), moment("m1"), moment("m2")],
        `mission-${index}`,
      );
      paires.add(choisies.map((v) => v.key).join("+"));
    }

    expect(paires.size).toBe(4);
  });

  it("omet un genre entièrement désactivé sans faire tomber les autres", () => {
    const choisies = choisirLesVariantes(
      [angle("a1"), moment("m1", { actif: false })],
      "mission-3",
    );

    expect(choisies.map((v) => v.kind)).toEqual(["angle"]);
  });
});
