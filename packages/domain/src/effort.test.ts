/**
 * Le dimensionnement de l'effort — et ce qu'il refuse de faire.
 *
 * Ce calcul décide combien Lady travaille pour un client donné. Trop bas, le client n'atteint
 * rien ; trop haut, on brûle sa réputation. Les deux se paient à la fin du mois.
 *
 * Réalise : LADY-S
 */

import { describe, expect, it } from "vitest";

import { JOURS_OUVRES_PAR_MOIS, effortRequis, tenabilite } from "./effort.js";

describe("De la cible au volume de travail", () => {
  it("dimensionne un objectif en euros à partir des chiffres du client", () => {
    // 10 000 € visés, 2 000 € la vente, 5 % de conversion :
    //   5 ventes → 100 entreprises à approcher → 5 par jour ouvré.
    const effort = effortRequis({
      metrique: "mrr",
      cible: 10_000,
      hypotheses: { panierMoyen: 2000, tauxDeConversion: 0.05 },
    });

    expect(effort.statut).toBe("calcule");
    if (effort.statut !== "calcule") return;
    expect(effort.unitesRequises).toBe(5);
    expect(effort.prospectsRequis).toBe(100);
    expect(effort.parJourOuvre).toBe(5);
  });

  it("compte directement un objectif qui n'est pas en euros", () => {
    // Un panier moyen n'a aucun sens ici : 10 rendez-vous sont 10 rendez-vous.
    const effort = effortRequis({
      metrique: "rendez_vous_qualifies",
      cible: 10,
      hypotheses: { panierMoyen: null, tauxDeConversion: 0.1 },
    });

    expect(effort.statut).toBe("calcule");
    if (effort.statut !== "calcule") return;
    expect(effort.unitesRequises).toBe(10);
    expect(effort.prospectsRequis).toBe(100);
  });

  it("⭐ arrondit AU-DESSUS — viser 9,4 ventes en en produisant 9 rate la cible par construction", () => {
    const effort = effortRequis({
      metrique: "chiffre_affaires",
      cible: 9400,
      hypotheses: { panierMoyen: 1000, tauxDeConversion: 0.5 },
    });

    expect(effort.statut).toBe("calcule");
    if (effort.statut !== "calcule") return;
    expect(effort.unitesRequises).toBe(10); // 9,4 → 10
    expect(effort.prospectsRequis).toBe(19); // 18,8 → 19
  });

  it("rend les nombres qui ont servi, pour qu'ils soient contestables", () => {
    const effort = effortRequis({
      metrique: "mrr",
      cible: 10_000,
      hypotheses: { panierMoyen: 2000, tauxDeConversion: 0.05 },
    });

    expect(effort.statut).toBe("calcule");
    if (effort.statut !== "calcule") return;
    expect(effort.fondements.join(" ")).toContain("2000");
    expect(effort.fondements.join(" ")).toContain("5 %");
    expect(effort.fondements.join(" ")).toContain(String(JOURS_OUVRES_PAR_MOIS));
  });
});

describe("Ce qui manque se dit, jamais ne se comble", () => {
  it("refuse de dimensionner un objectif en euros sans panier moyen", () => {
    // Supposer « 1 000 € la vente » produirait un employé calibré sur une entreprise imaginaire.
    const effort = effortRequis({
      metrique: "mrr",
      cible: 10_000,
      hypotheses: { panierMoyen: null, tauxDeConversion: 0.05 },
    });

    expect(effort.statut).toBe("incalculable");
    if (effort.statut !== "incalculable") return;
    expect(effort.manque.join(" ")).toContain("rapporte une vente");
  });

  it("refuse sans taux de conversion, quelle que soit la métrique", () => {
    const effort = effortRequis({
      metrique: "rendez_vous_qualifies",
      cible: 10,
      hypotheses: { panierMoyen: null, tauxDeConversion: null },
    });
    expect(effort.statut).toBe("incalculable");
  });

  it("refuse un taux impossible plutôt que de le corriger en silence", () => {
    for (const taux of [0, -0.1, 1.5]) {
      const effort = effortRequis({
        metrique: "rendez_vous_qualifies",
        cible: 10,
        hypotheses: { panierMoyen: null, tauxDeConversion: taux },
      });
      expect(effort.statut).toBe("incalculable");
    }
  });

  it("nomme TOUT ce qui manque, pas seulement le premier trou", () => {
    const effort = effortRequis({
      metrique: "mrr",
      cible: 10_000,
      hypotheses: { panierMoyen: null, tauxDeConversion: null },
    });
    expect(effort.statut).toBe("incalculable");
    if (effort.statut !== "incalculable") return;
    expect(effort.manque).toHaveLength(2);
  });
});

describe("Une cible hors de portée se dit AVANT la vente", () => {
  it("⭐ refuse une formule qui ne peut pas porter l'objectif annoncé", () => {
    // Vendre ici, c'est vendre un échec avec un mois de délai.
    const effort = effortRequis({
      metrique: "mrr",
      cible: 100_000,
      hypotheses: { panierMoyen: 2000, tauxDeConversion: 0.05 },
    });
    const verdict = tenabilite(effort, 10);

    expect(verdict?.statut).toBe("hors_de_portee");
    if (verdict?.statut !== "hors_de_portee") return;
    expect(verdict.parJourOuvre).toBe(48);
    expect(verdict.plafondParJour).toBe(10);
    // Et le message dit que ce n'est pas l'employé qui sera en cause.
    expect(verdict.message).toContain("ce n'est pas votre employé");
  });

  it("laisse passer une cible que la formule porte", () => {
    const effort = effortRequis({
      metrique: "mrr",
      cible: 10_000,
      hypotheses: { panierMoyen: 2000, tauxDeConversion: 0.05 },
    });
    expect(tenabilite(effort, 10)?.statut).toBe("tenable");
  });

  it("ne juge rien quand le calcul lui-même est impossible", () => {
    const effort = effortRequis({
      metrique: "mrr",
      cible: 10_000,
      hypotheses: { panierMoyen: null, tauxDeConversion: null },
    });
    expect(tenabilite(effort, 10)).toBeNull();
  });
});
