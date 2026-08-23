import { describe, expect, it } from "vitest";
import { recommend, HANDLED_FRICTIONS, type RecommendationDecision } from "@sentio/domain";

import { presentEmployee, type PresentEmployeeDeps } from "./presentation.js";

const DECISION = recommend({
  sector: "menuiserie",
  headcount: 8,
  friction: HANDLED_FRICTIONS.tooFewProspects,
  objective: { metric: "€ de chiffre d'affaires", target: 5000, horizon: "mois" },
  targetCustomers: "architectes et maîtres d'œuvre",
  hasProspectList: true,
}) as Extract<RecommendationDecision, { status: "recommande" }>;

const VALID_PRESENTATION = {
  firstName: "Léa",
  title: "chargée de développement commercial",
  mission: "Relancer vos prospects et libérer votre temps pour le chantier.",
  whatTheyDo: ["Repère les entreprises à approcher", "Écrit un premier message", "Relance sans en oublier"],
  whyRecommended: "Vous avez trop peu d'entreprises approchées aujourd'hui.",
  expectedOutcome: "Vos prospects reçoivent une relance systématique, sans y penser vous-même.",
};

describe("presentEmployee — ce qui se passe une fois la décision prise", () => {
  it("rend la présentation du modèle quand elle est complète", async () => {
    const deps: PresentEmployeeDeps = { present: async () => VALID_PRESENTATION };
    const result = await presentEmployee(DECISION, deps);
    expect(result).toEqual(VALID_PRESENTATION);
  });

  it("recadre les espaces superflus des champs texte", async () => {
    const deps: PresentEmployeeDeps = {
      present: async () => ({ ...VALID_PRESENTATION, firstName: "  Léa  " }),
    };
    const result = await presentEmployee(DECISION, deps);
    expect(result.firstName).toBe("Léa");
  });

  it("se replie sur une présentation dérivée du calibrage si un champ manque", async () => {
    const { title, ...incomplet } = VALID_PRESENTATION;
    void title;
    const deps: PresentEmployeeDeps = { present: async () => incomplet };
    const result = await presentEmployee(DECISION, deps);
    expect(result.title).toBe("chargé de développement commercial");
    expect(result.whatTheyDo.length).toBeGreaterThan(0);
  });

  it("se replie si whatTheyDo est vide", async () => {
    const deps: PresentEmployeeDeps = { present: async () => ({ ...VALID_PRESENTATION, whatTheyDo: [] }) };
    const result = await presentEmployee(DECISION, deps);
    // Depuis que la configuration est COMPOSÉE plutôt que fixe, elle ne contient plus que ce
    // que les constats appellent. Ce dossier — « pas assez d'entreprises approchées », avec une
    // liste déjà en main — n'appelle pas de relance : il appelle de la recherche, et l'ouverture
    // de la conversation. `qualifier` s'y ajoute parce qu'on n'écrit jamais sans avoir qualifié.
    expect(result.whatTheyDo).toEqual([
      "engager la conversation avec un premier message",
      "vérifier qu'un contact correspond vraiment à ce que vous vendez",
      "repérer les entreprises à approcher",
    ]);
  });

  it("se replie proprement si le modèle échoue (réseau, panne)", async () => {
    const deps: PresentEmployeeDeps = {
      present: async () => {
        throw new Error("panne réseau simulée");
      },
    };
    const result = await presentEmployee(DECISION, deps);
    expect(result.firstName.length).toBeGreaterThan(0);
    expect(result.whyRecommended).toBe(DECISION.grounds.join(". "));
  });

  it("le repli n'invente jamais de chiffre : l'issue attendue reste le premier pas du calibrage", async () => {
    const deps: PresentEmployeeDeps = { present: async () => null };
    const result = await presentEmployee(DECISION, deps);
    expect(result.expectedOutcome).toContain(DECISION.calibration.firstStep);
    expect(result.expectedOutcome).not.toMatch(/%|€\s*\d|\d+\s*€/);
  });

  it("le prénom de repli est stable pour une même décision (pas un tirage aléatoire à chaque appel)", async () => {
    const deps: PresentEmployeeDeps = { present: async () => null };
    const first = await presentEmployee(DECISION, deps);
    const second = await presentEmployee(DECISION, deps);
    expect(first.firstName).toBe(second.firstName);
  });
});
