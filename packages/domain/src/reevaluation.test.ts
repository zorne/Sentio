/**
 * La réévaluation — et surtout ce qu'elle refuse de conclure.
 *
 * Un moteur qui réagit trop vite déplace Lady au hasard : le client verrait son employé changer
 * de métier toutes les semaines sans jamais rien terminer. C'est le risque principal de ce
 * module, et la moitié de ces tests portent dessus.
 *
 * Réalise : LADY-T
 */

import { describe, expect, it } from "vitest";

import { diagnostiquer, composer } from "./composition.js";
import { SIGNAL_MINIMAL, releverDesResultats, type MesuresDuTravail } from "./reevaluation.js";

const TRAVAIL: MesuresDuTravail = {
  missionsOuvertes: 40,
  missionsAgies: 40,
  reponses: 6,
  rendezVous: 2,
  ventes: 1,
  partEcoulee: 0.5,
  ecartDeRythme: -120,
};

const mesures = (over: Partial<MesuresDuTravail> = {}): MesuresDuTravail => ({ ...TRAVAIL, ...over });

describe("Elle se tait tant que le signal est faible", () => {
  it("⭐ ne conclut rien au début de l'horizon", () => {
    // À 10 % d'un mois, un retard est arithmétiquement normal. Le corriger déplacerait Lady sur
    // du bruit.
    const verdict = releverDesResultats(mesures({ partEcoulee: 0.1 }));
    expect(verdict.statut).toBe("trop_tot");
  });

  it("⭐ ne conclut rien sur trop peu de missions travaillées", () => {
    // « 1 réponse sur 2 envois = 50 % » est un chiffre vrai et une information fausse.
    const verdict = releverDesResultats(mesures({ missionsAgies: 3 }));
    expect(verdict.statut).toBe("trop_tot");
    if (verdict.statut !== "trop_tot") return;
    expect(verdict.motif).toContain(String(SIGNAL_MINIMAL.missionsAgies));
  });

  it("distingue « rien ouvert » de « rien travaillé »", () => {
    // Quarante missions ouvertes dont aucune agie ne prouve rien sur la qualité du travail.
    const verdict = releverDesResultats(mesures({ missionsOuvertes: 40, missionsAgies: 0 }));
    expect(verdict.statut).toBe("trop_tot");
  });
});

describe("Un même retard n'a pas une seule cause", () => {
  it("⭐ silence total : c'est le message, pas le volume", () => {
    // En envoyer davantage multiplierait le silence et abîmerait la réputation du client.
    const verdict = releverDesResultats(mesures({ reponses: 0, ventes: 0 }));

    expect(verdict.statut).toBe("constats");
    if (verdict.statut !== "constats") return;
    const goulot = verdict.constats.find((c) => c.genre === "goulot");
    expect(goulot?.domaine).toBe("communication_sortante");
    // Et le volume est explicitement dédouané, pour que le diagnostic ne s'y trompe pas.
    expect(verdict.constats.some((c) => c.genre === "force" && c.domaine === "recherche_selection")).toBe(true);
  });

  it("⭐ des réponses mais aucune vente : c'est le ciblage, pas le message", () => {
    const verdict = releverDesResultats(mesures({ reponses: 12, ventes: 0 }));

    expect(verdict.statut).toBe("constats");
    if (verdict.statut !== "constats") return;
    const goulot = verdict.constats.find((c) => c.genre === "goulot");
    expect(goulot?.domaine).toBe("evaluation");
    expect(verdict.constats.some((c) => c.genre === "force" && c.domaine === "communication_sortante")).toBe(true);
  });

  it("ça vend mais trop lentement : là, et là seulement, le volume est en cause", () => {
    const verdict = releverDesResultats(mesures({ reponses: 12, ventes: 3 }));

    expect(verdict.statut).toBe("constats");
    if (verdict.statut !== "constats") return;
    const faiblesse = verdict.constats.find((c) => c.genre === "faiblesse");
    expect(faiblesse?.domaine).toBe("recherche_selection");
    expect(verdict.constats.some((c) => c.genre === "force" && c.domaine === "evaluation")).toBe(true);
  });
});

describe("Ce qui marche se constate aussi", () => {
  it("⭐ confirme au lieu de déplacer quand le rythme tient", () => {
    // Sans ce cas, seuls les échecs parleraient : la réévaluation ne saurait que déplacer Lady,
    // jamais confirmer qu'elle est au bon endroit.
    const verdict = releverDesResultats(mesures({ ecartDeRythme: 40, ventes: 5 }));

    expect(verdict.statut).toBe("constats");
    if (verdict.statut !== "constats") return;
    expect(verdict.constats.every((c) => c.genre === "force")).toBe(true);
  });
});

describe("Les constats mesurés pèsent plus lourd que les déclarations", () => {
  it("portent tous la source « mesure » et la confiance la plus forte", () => {
    const verdict = releverDesResultats(mesures());
    expect(verdict.statut).toBe("constats");
    if (verdict.statut !== "constats") return;
    for (const constat of verdict.constats) {
      expect(constat.source).toBe("mesure");
      expect(constat.confiance).toBe("forte");
    }
  });

  it("⭐ alimentent le MÊME moteur que le premier diagnostic", () => {
    // C'est ce qui referme la boucle : une réévaluation n'est pas un mécanisme parallèle, c'est
    // un second diagnostic — avec de meilleures données.
    const verdict = releverDesResultats(mesures({ reponses: 12, ventes: 0 }));
    if (verdict.statut !== "constats") throw new Error("constats attendus");

    const resultat = composer(diagnostiquer(verdict.constats));
    expect(resultat.statut).toBe("compose");
    if (resultat.statut !== "compose") return;
    // Le ciblage devient la priorité, parce que c'est là que la mesure dit que ça bloque.
    expect(resultat.configuration.role).toBe("qualification");
  });
});
