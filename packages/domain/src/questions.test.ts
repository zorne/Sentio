/**
 * LADY-X — ce qu'elle répond, et surtout ce qu'elle refuse de répondre.
 *
 * Le risque de ce module n'est pas de mal comprendre une question : c'est de répondre **quand
 * même**. Un chiffre juste à la question d'à côté est la pire réponse fausse qui soit — elle est
 * vraie ailleurs, donc rien ne la démasque.
 */

import { describe, expect, it } from "vitest";

import {
  CE_QU_ELLE_SAIT_DIRE,
  demander,
  lireLaQuestion,
  type ContexteDeReponse,
  type TravailMesure,
} from "./questions.js";

const TRAVAIL: TravailMesure = {
  missionsOuvertes: 12,
  missionsAgies: 9,
  messagesEnvoyes: 9,
  reponses: 3,
  rendezVous: 1,
  ventes: 0,
  chiffreAffaires: 0,
};

const ctx = (over: Partial<ContexteDeReponse> = {}): ContexteDeReponse => ({
  prenom: "Julie",
  travail: TRAVAIL,
  avancement: {
    metrique: "€ de chiffre d'affaires",
    cible: 10000,
    realise: 2000,
    joursEcoules: 10,
    horizonJours: 30,
  },
  role: "ne retenir que les bonnes entreprises",
  arretee: false,
  ...over,
});

describe("Elle comprend la question, ou elle le dit", () => {
  it("⭐⭐ ne répond pas à une question qu'elle n'a pas comprise", () => {
    // Deviner produirait un chiffre juste à la question d'à côté. On préfère refuser en disant
    // ce qu'on sait dire.
    const r = demander("est-ce que le marché va bien en ce moment ?", ctx());

    expect(r.statut).toBe("ne_sait_pas");
    if (r.statut !== "ne_sait_pas") return;
    expect(r.suggestions).toEqual(CE_QU_ELLE_SAIT_DIRE);
  });

  it("⭐ « combien m'ont répondu » parle de réponses, pas de prospection", () => {
    // Les deux mots sont présents ; c'est « répondu » qui porte la question. Sans pondération, le
    // premier indice trouvé gagnerait — et la réponse serait juste, mais à une autre question.
    expect(lireLaQuestion("combien de prospects m'ont répondu ?")?.intention).toBe("reponses");
  });

  it("comprend la même question écrite autrement", () => {
    for (const dit of [
      "Qu'est-ce que tu as fait aujourd'hui ?",
      "qu as tu fait aujourd hui",
      "raconte ta journée",
    ]) {
      expect(lireLaQuestion(dit)?.intention).toBe("journee");
    }
  });

  it("⭐ « et hier ? » est une vraie question — la relance la plus naturelle qui soit", () => {
    // Elle ne contient aucun mot d'intention. Sans règle, la façon la plus courante de relancer
    // une conversation était la seule à ne pas être comprise.
    expect(lireLaQuestion("et hier ?")).toEqual({ intention: "journee", fenetre: "hier" });
  });

  it("entend la fenêtre de temps quand elle est dite", () => {
    expect(lireLaQuestion("combien d'entreprises cette semaine ?")?.fenetre).toBe("semaine");
    // Par défaut, aujourd'hui : c'est ce qu'on demande à quelqu'un dont on prend des nouvelles.
    expect(lireLaQuestion("combien de réponses ?")?.fenetre).toBe("aujourdhui");
  });
});

describe("Aucun chiffre n'est inventé", () => {
  it("⭐⭐ rend exactement les comptes reçus", () => {
    const r = demander("combien m'ont répondu ?", ctx());
    expect(r.phrase).toContain("3");
    // Et rien d'autre : pas de taux, pas de projection, pas de « soit 33 % ».
    expect(r.phrase).not.toMatch(/%/);
  });

  it("⭐ zéro est une réponse, pas un vide à meubler", () => {
    const r = demander("combien de ventes ?", ctx());
    expect(r.phrase).toContain("Aucune vente");
    // Et elle rappelle d'où vient le chiffre : c'est le client qui déclare ses ventes.
    expect(r.phrase).toContain("déclarez");
  });

  it("⭐ une journée sans travail se dit, elle ne se maquille pas", () => {
    const r = demander("qu'as-tu fait aujourd'hui ?", ctx({
      travail: { ...TRAVAIL, missionsAgies: 0, messagesEnvoyes: 0, reponses: 0, rendezVous: 0 },
    }));
    expect(r.phrase).toContain("Rien");
  });

  it("accorde le pluriel — « 1 message », pas « 1 messages »", () => {
    const r = demander("combien d'entreprises approchées ?", ctx({
      travail: { ...TRAVAIL, messagesEnvoyes: 1 },
    }));
    expect(r.phrase).toContain("1 entreprise ");
    expect(r.phrase).not.toContain("1 entreprises");
  });
});

describe("Le contexte prime sur le compte", () => {
  it("⭐⭐ à l'arrêt, elle le dit AVANT de donner un chiffre", () => {
    // « 0 message envoyé » est exact, et parfaitement trompeur, pour un dirigeant qui a lui-même
    // mis son employée en pause et l'a peut-être oublié.
    const r = demander("combien de messages aujourd'hui ?", ctx({
      arretee: true,
      travail: { ...TRAVAIL, messagesEnvoyes: 0 },
    }));

    expect(r.phrase).toContain("à l'arrêt");
    expect(r.phrase).toContain("vous m'avez mise en pause");
  });

  it("⭐ sans objectif, elle explique au lieu d'afficher zéro", () => {
    const r = demander("où en est mon objectif ?", ctx({ avancement: null }));
    expect(r.phrase).toContain("pas encore donné d'objectif");
  });

  it("dit où en est l'objectif avec les deux nombres et le temps restant", () => {
    const r = demander("où en est mon objectif ?", ctx());
    // ⚠️ On compare avec le MÊME formatage : `toLocaleString("fr-FR")` sépare les milliers par
    // une espace insécable étroite (U+202F), pas une espace ordinaire. Une assertion écrite à la
    // main échoue sur un caractère invisible — et fait perdre une demi-heure.
    expect(r.phrase).toContain((2000).toLocaleString("fr-FR"));
    expect(r.phrase).toContain((10000).toLocaleString("fr-FR"));
    expect(r.phrase).toContain("20 jours");
  });
});
