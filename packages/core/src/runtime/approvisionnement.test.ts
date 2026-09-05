import { REGLAGES_RUNTIME_PAR_DEFAUT, type ReglagesRuntime } from "@sentio/config";
import { describe, expect, it } from "vitest";

import {
  motifDuLot,
  planifierLApprovisionnement,
  type EntreeApprovisionnement,
  type PlanDApprovisionnement,
  type SujetDeMission,
} from "./approvisionnement.js";

function sujets(combien: number, nature = "lead"): SujetDeMission[] {
  return Array.from({ length: combien }, (_, index) => ({
    kind: nature,
    id: `sujet-${String(index).padStart(3, "0")}`,
  }));
}

function plan(entree: Partial<EntreeApprovisionnement> = {}): PlanDApprovisionnement {
  return planifierLApprovisionnement({
    verdict: "ok",
    sujetsEligibles: sujets(50),
    restantDePeriode: null,
    // Par défaut, aucun rythme imposé : la plupart des cas de ce fichier éprouvent les autres
    // bornes, et un rythme non nul les masquerait.
    rythmeVoulu: null,
    reglages: REGLAGES_RUNTIME_PAR_DEFAUT,
    ...entree,
  });
}

describe("combien de missions ouvrir", () => {
  it("s'arrête au plafond du jour — dix, décision du fondateur", () => {
    const resultat = plan();
    expect(resultat.kind).toBe("ouvrir");
    if (resultat.kind !== "ouvrir") return;
    expect(resultat.sujets).toHaveLength(10);
    expect(resultat.borne).toBe("plafond_du_jour");
  });

  it("prend le plafond dans la configuration, jamais dans une constante", () => {
    const trois: ReglagesRuntime = { ...REGLAGES_RUNTIME_PAR_DEFAUT, missionsMaxParJour: 3 };
    const resultat = plan({ reglages: trois });
    if (resultat.kind !== "ouvrir") throw new Error("attendu une ouverture");
    expect(resultat.sujets).toHaveLength(3);
  });

  it("n'ouvre que ce qui existe : c'est un plafond, pas une cible", () => {
    // Ouvrir dix missions quand trois prospects sont éligibles voudrait dire en inventer sept.
    const resultat = plan({ sujetsEligibles: sujets(3) });
    if (resultat.kind !== "ouvrir") throw new Error("attendu une ouverture");
    expect(resultat.sujets).toHaveLength(3);
    expect(resultat.borne).toBe("sujets_disponibles");
  });

  it("respecte le quota de la formule quand il est plus bas que le plafond du jour", () => {
    const resultat = plan({ restantDePeriode: 4 });
    if (resultat.kind !== "ouvrir") throw new Error("attendu une ouverture");
    expect(resultat.sujets).toHaveLength(4);
    expect(resultat.borne).toBe("quota_de_periode");
  });

  it("distingue « aucun plafond défini » de « plus rien » — les confondre arrêterait un client", () => {
    // `null` = la formule n'a pas cette métrique. Zéro = elle l'a, et il est épuisé.
    const sansPlafond = plan({ restantDePeriode: null });
    expect(sansPlafond.kind).toBe("ouvrir");

    const epuise = plan({ restantDePeriode: 0 });
    expect(epuise.kind).toBe("rien");
    if (epuise.kind !== "rien") return;
    expect(epuise.raison).toBe("quota_de_periode_atteint");
  });

  it("prend les sujets dans l'ordre rendu, sans jamais les réordonner", () => {
    // Le gisement ordonne (le plus ancien d'abord) ; réordonner ici rendrait deux battements
    // successifs non reproductibles, et « le même travail » cesserait d'être décidable.
    const liste = sujets(20);
    const resultat = plan({ sujetsEligibles: liste });
    if (resultat.kind !== "ouvrir") throw new Error("attendu une ouverture");
    expect(resultat.sujets).toEqual(liste.slice(0, 10));
  });
});

describe("quand rien n'est ouvert, la raison est nommée", () => {
  it("relaie chaque verdict de la base sans le réinterpréter", () => {
    for (const verdict of [
      "employe_inconnu",
      "pas_d_abonnement_actif",
      "aucun_objectif",
      "objectif_atteint",
      "objectif_retire",
      "deja_approvisionne_aujourdhui",
      "quota_de_periode_atteint",
    ] as const) {
      const resultat = plan({ verdict });
      expect(resultat.kind).toBe("rien");
      if (resultat.kind !== "rien") continue;
      expect(resultat.raison).toBe(verdict);
      expect(resultat.detail.length).toBeGreaterThan(10);
    }
  });

  it("refuse un verdict qu'elle ne connaît pas au lieu de le lire comme une autorisation", () => {
    // Même règle que le vocabulaire fermé du journal : ce qui n'est pas connu n'est pas ignoré.
    const resultat = plan({ verdict: "peut_etre_bien_que_oui" });
    expect(resultat.kind).toBe("rien");
    if (resultat.kind !== "rien") return;
    expect(resultat.raison).toBe("verdict_inconnu");
    expect(resultat.detail).toContain("peut_etre_bien_que_oui");
  });

  it("dit qu'il n'y a rien de neuf plutôt que d'ouvrir une mission vide", () => {
    const resultat = plan({ sujetsEligibles: [] });
    expect(resultat.kind).toBe("rien");
    if (resultat.kind !== "rien") return;
    expect(resultat.raison).toBe("aucun_sujet_eligible");
  });

  it("règle la journée sur un refus métier, jamais sur une anomalie", () => {
    // Inscrire une anomalie comme « lot du jour » la tairait pendant 24 h — c'est-à-dire
    // exactement le temps qu'il faut pour ne pas la voir.
    const metier = plan({ verdict: "objectif_atteint" });
    if (metier.kind !== "rien") throw new Error("attendu un refus");
    expect(metier.bloqueLaJournee).toBe(true);

    for (const anomalie of ["employe_inconnu", "verdict_bizarre"]) {
      const resultat = plan({ verdict: anomalie });
      if (resultat.kind !== "rien") throw new Error("attendu un refus");
      expect(resultat.bloqueLaJournee).toBe(false);
    }

    // Le lot existe déjà : il n'y a rien à réécrire.
    const deja = plan({ verdict: "deja_approvisionne_aujourdhui" });
    if (deja.kind !== "rien") throw new Error("attendu un refus");
    expect(deja.bloqueLaJournee).toBe(false);
  });
});

describe("le modèle ne décide rien ici", () => {
  it("reste généraliste : aucune nature de sujet n'est privilégiée", () => {
    // Rien dans ce module ne connaît le mot « prospect ». Un métier futur passera ses propres
    // sujets sans qu'une ligne d'ici ne change.
    const resultat = plan({ sujetsEligibles: sujets(4, "dossier_de_recrutement") });
    if (resultat.kind !== "ouvrir") throw new Error("attendu une ouverture");
    expect(resultat.sujets.every((sujet) => sujet.kind === "dossier_de_recrutement")).toBe(true);
  });

  it("est pure : deux appels sur la même entrée rendent exactement la même chose", () => {
    const entree: EntreeApprovisionnement = {
      verdict: "ok",
      sujetsEligibles: sujets(25),
      restantDePeriode: 7,
      rythmeVoulu: null,
      reglages: REGLAGES_RUNTIME_PAR_DEFAUT,
    };
    expect(planifierLApprovisionnement(entree)).toEqual(planifierLApprovisionnement(entree));
  });
});

describe("le motif du lot", () => {
  it("dit combien, et ce qui a borné", () => {
    expect(motifDuLot(plan())).toContain("plafond du jour");
    expect(motifDuLot(plan({ sujetsEligibles: sujets(2) }))).toContain("2 mission(s)");
    expect(motifDuLot(plan({ restantDePeriode: 1 }))).toContain("quota de la formule");
  });

  it("reprend la raison quand rien n'est ouvert", () => {
    expect(motifDuLot(plan({ verdict: "objectif_atteint" }))).toContain("objectif est atteint");
  });
});

describe("Le rythme voulu par l'objectif borne le travail du jour", () => {
  it("⭐ ouvre ce que la cible demande, et pas le plafond du jour", () => {
    // Sans cette borne, un client visant 2 000 € et un client visant 20 000 € recevaient
    // exactement le même travail : leur objectif ne pilotait rien.
    const resultat = plan({ rythmeVoulu: 5 });

    expect(resultat.kind).toBe("ouvrir");
    if (resultat.kind !== "ouvrir") return;
    expect(resultat.sujets).toHaveLength(5);
    expect(resultat.borne).toBe("rythme_de_l_objectif");
  });

  it("ne permet JAMAIS de dépasser ce que le client a acheté", () => {
    // Un objectif ambitieux ne donne pas le droit d'ouvrir plus que la formule, ni de brûler la
    // réputation du client en un après-midi.
    const resultat = plan({ rythmeVoulu: 10_000, restantDePeriode: 3 });

    expect(resultat.kind).toBe("ouvrir");
    if (resultat.kind !== "ouvrir") return;
    expect(resultat.sujets).toHaveLength(3);
    expect(resultat.borne).toBe("quota_de_periode");
  });

  it("s'efface quand la cible n'est pas calculable — on ne devine pas un rythme", () => {
    const sansRythme = plan({ rythmeVoulu: null });
    expect(sansRythme.kind).toBe("ouvrir");
    if (sansRythme.kind !== "ouvrir") return;
    expect(sansRythme.borne).not.toBe("rythme_de_l_objectif");
  });

  it("dit pourquoi il s'est arrêté là, en français", () => {
    expect(motifDuLot(plan({ rythmeVoulu: 5 }))).toContain("rythme demandé par l'objectif");
  });
});
