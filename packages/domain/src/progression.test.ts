/**
 * EVOL-04 — ce que le départage refuse de conclure.
 *
 * Le risque de ce module n'est pas de mal choisir : c'est de choisir **trop tôt**, sur du bruit,
 * et de produire un employé qui change de façon de travailler chaque semaine sans jamais rien
 * mener à terme. La moitié de ces tests portent là-dessus.
 */

import { describe, expect, it } from "vitest";

import {
  departagerLesVariantes,
  PART_D_EXPLORATION,
  SIGNAL_MINIMAL_DE_PROGRESSION,
  type ResultatDeVariante,
} from "./progression.js";

const variante = (over: Partial<ResultatDeVariante> & { key: string }): ResultatDeVariante => ({
  variantId: `id-${over.key}`,
  kind: "registre",
  missions: 40,
  reponses: 0,
  rendezVous: 0,
  ventes: 0,
  ...over,
});

describe("Ce qui n'est pas mesuré ne se départage pas", () => {
  it("⭐⭐ se tait quand une seule façon de faire a été assez jouée", () => {
    // Le cas réel des premières semaines : la variante par défaut porte tout le volume. Conclure
    // qu'elle « gagne » reviendrait à se donner raison sans avoir rien comparé.
    const verdict = departagerLesVariantes([
      variante({ key: "professionnel", missions: 100, ventes: 9 }),
      variante({ key: "technique", missions: 4, ventes: 1 }),
    ]);

    expect(verdict.statut).toBe("trop_tot");
  });

  it("⭐ se tait quand rien n'a produit de résultat", () => {
    const verdict = departagerLesVariantes([
      variante({ key: "professionnel" }),
      variante({ key: "courant" }),
    ]);
    expect(verdict.statut).toBe("sans_ecart");
  });

  it("⭐⭐ refuse un écart trop faible : 11 % contre 10 %, c'est du bruit", () => {
    // Sans ce refus, le produit changerait d'avis à chaque mesure — et présenterait chaque
    // oscillation au client comme une progression.
    const verdict = departagerLesVariantes([
      variante({ key: "professionnel", missions: 100, reponses: 11 }),
      variante({ key: "courant", missions: 100, reponses: 10 }),
    ]);

    expect(verdict.statut).toBe("sans_ecart");
  });
});

describe("Ce qui est mesuré et net se départage", () => {
  it("⭐ fait monter la façon de faire qui vend", () => {
    const verdict = departagerLesVariantes([
      variante({ key: "specialise", missions: 40, ventes: 8 }),
      variante({ key: "courant", missions: 40, ventes: 2 }),
    ]);

    expect(verdict.statut).toBe("gagnante");
    if (verdict.statut !== "gagnante") return;
    expect(verdict.key).toBe("specialise");
    expect(verdict.missionsComparees).toBe(80);
    // La raison est lisible par un dirigeant, et dit sur quoi elle porte.
    expect(verdict.raison).toContain("80 missions");
  });

  it("⭐⭐ une vente pèse plus qu'une réponse", () => {
    // Sans cet ordre, la façon de faire qui fait beaucoup répondre et ne vend rien gagnerait —
    // c'est-à-dire qu'on optimiserait le bruit contre le chiffre d'affaires du client.
    const verdict = departagerLesVariantes([
      variante({ key: "bavard", missions: 40, reponses: 30, ventes: 0 }),
      variante({ key: "direct", missions: 40, reponses: 6, ventes: 5 }),
    ]);

    expect(verdict.statut).toBe("gagnante");
    if (verdict.statut !== "gagnante") return;
    expect(verdict.key).toBe("direct");
  });

  it("départage de façon stable quand deux taux sont identiques", () => {
    // Deux mesures du même jour ne doivent pas rendre deux gagnantes différentes : sinon la
    // préférence oscillerait sans qu'aucune donnée n'ait changé.
    const resultats = [
      variante({ key: "b", missions: 40, ventes: 4 }),
      variante({ key: "a", missions: 40, ventes: 4 }),
    ];
    expect(departagerLesVariantes(resultats)).toEqual(departagerLesVariantes([...resultats].reverse()));
  });
});

describe("Les garde-fous restent des nombres, pas des opinions", () => {
  it("⭐ garde une part de missions pour continuer de mesurer", () => {
    // Une préférence sans exploration ne peut plus jamais être démentie : le jour où le marché
    // change, personne ne le voit.
    expect(PART_D_EXPLORATION).toBeGreaterThan(0);
    expect(PART_D_EXPLORATION).toBeLessThan(0.5);
  });

  it("les seuils sont réglables sans toucher à la règle", () => {
    const serres = departagerLesVariantes(
      [
        variante({ key: "a", missions: 5, ventes: 3 }),
        variante({ key: "b", missions: 5, ventes: 0 }),
      ],
      { missionsParVariante: 5, ecartRelatifMinimal: 0.2 },
    );
    expect(serres.statut).toBe("gagnante");
    expect(SIGNAL_MINIMAL_DE_PROGRESSION.missionsParVariante).toBeGreaterThan(5);
  });
});
