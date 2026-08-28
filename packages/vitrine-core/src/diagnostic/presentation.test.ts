import { describe, expect, it } from "vitest";
import { recommend, CAPACITES, HANDLED_FRICTIONS, type RecommendationDecision } from "@sentio/domain";

import {
  CAPACITES_REELLEMENT_EXECUTABLES,
  presentEmployee,
  type PresentEmployeeDeps,
} from "./presentation.js";

const DECISION = recommend({
  sector: "menuiserie",
  headcount: 8,
  friction: HANDLED_FRICTIONS.tooFewProspects,
  objective: { metric: "€ de chiffre d'affaires", target: 5000, horizon: "mois" },
  targetCustomers: "architectes et maîtres d'œuvre",
  hasProspectList: true,
  inboundHandling: null,
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
  /**
   * ⚠️ SPÉCIFICATION CHANGÉE LE 2026-08-28, ET LE TEST AVEC ELLE.
   *
   * Il exigeait que la présentation du modèle soit rendue TELLE QUELLE. Cette règle était fausse
   * sur un point : `whatTheyDo` déclare de quoi le produit est capable, à un visiteur qui n'a pas
   * encore recruté. Rien n'empêchait le modèle d'y promettre l'envoi d'emails — que le runtime
   * refuse (`CapabilityUnavailable`). C'est le constat P0-3 de `docs/35`.
   *
   * La règle est maintenant : le modèle RÉDIGE (prénom, titre, mission, raison, premier pas), il
   * ne DÉCLARE pas. Même famille que l'invariant 4 du dépôt — ce qui engage Sentio se lit dans le
   * système, jamais dans une phrase engendrée.
   */
  it("rend la rédaction du modèle, mais jamais ses promesses de capacités", async () => {
    const deps: PresentEmployeeDeps = { present: async () => VALID_PRESENTATION };
    const result = await presentEmployee(DECISION, deps);

    // Ce que le modèle écrit lui appartient.
    expect(result.firstName).toBe(VALID_PRESENTATION.firstName);
    expect(result.title).toBe(VALID_PRESENTATION.title);
    expect(result.mission).toBe(VALID_PRESENTATION.mission);
    expect(result.whyRecommended).toBe(VALID_PRESENTATION.whyRecommended);

    // Ce qu'elle sait faire ne lui appartient pas : c'est un fait du système.
    expect(result.whatTheyDo).toEqual([
      "vérifier qu'un contact correspond vraiment à ce que vous vendez",
    ]);
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
    // ⚠️ CE QUE CE TEST MONTRAIT AVANT, ET QUI ÉTAIT LE DÉFAUT.
    //
    // La composition de ce dossier appelle trois capacités : ouvrir la conversation, qualifier,
    // et rechercher. On les annonçait toutes les trois. **Deux d'entre elles n'ont aucun moteur
    // monté** — le runtime les refuse. On promettait donc, avant l'achat, ce qu'on refuserait
    // après.
    //
    // Il ne reste que ce qui s'exécute vraiment. La liste s'allongera d'elle-même quand un moteur
    // sera monté : `CAPACITES_REELLEMENT_EXECUTABLES` est gardée par le test juste en dessous, et
    // par le test d'intégration du worker qui la confronte à la base.
    expect(result.whatTheyDo).toEqual([
      "vérifier qu'un contact correspond vraiment à ce que vous vendez",
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

  /**
   * ⚠️ CE QUE CE TEST DÉFEND, ET POURQUOI IL EST ICI PLUTÔT QU'AILLEURS.
   *
   * `CAPACITES_REELLEMENT_EXECUTABLES` est une liste RECOPIÉE : ce module n'a pas de connexion à
   * la base, donc il ne peut pas lire `capability.disponible`. Une liste recopiée finit toujours
   * par mentir — c'est la troisième fois que ce dépôt le paie.
   *
   * Le test d'intégration du worker garde déjà la base synchrone avec les moteurs montés. Celui-ci
   * garde cette liste-ci synchrone avec la même vérité, en la nommant explicitement : le jour où
   * un moteur d'envoi est monté, les deux échouent, et personne ne peut l'oublier.
   *
   * Constat P0-3 de `docs/35-audit-avant-production.md`.
   */
  it("n'annonce que les capacités dont un moteur est réellement monté", () => {
    // Les deux seules montées par défaut dans `packages/runtime/src/composition.ts`
    // (`moteursMontesParDefaut`), et le seul endroit du dépôt où ce fait est écrit en toutes
    // lettres à côté de sa raison.
    expect([...CAPACITES_REELLEMENT_EXECUTABLES].sort()).toEqual([
      CAPACITES.mettreAJourProspect,
      CAPACITES.qualifierProspect,
    ].sort());

    // Et surtout : ce qui écrit à une vraie entreprise n'y est pas.
    expect(CAPACITES_REELLEMENT_EXECUTABLES).not.toContain(CAPACITES.envoyerProspect);
    expect(CAPACITES_REELLEMENT_EXECUTABLES).not.toContain(CAPACITES.relancerProspect);
    expect(CAPACITES_REELLEMENT_EXECUTABLES).not.toContain(CAPACITES.rechercherProspect);
  });

});
