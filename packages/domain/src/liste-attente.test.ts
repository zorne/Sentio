import { describe, expect, it } from "vitest";

import {
  preparerUneEntreeDeListeDAttente,
  propositionDeListeDAttente,
} from "./liste-attente.js";

const MAINTENANT = new Date("2026-08-12T10:00:00.000Z");

function preparer(demande: Parameters<typeof preparerUneEntreeDeListeDAttente>[0]) {
  return preparerUneEntreeDeListeDAttente(demande, MAINTENANT);
}

describe("Le besoin est toujours compté", () => {
  it("enregistre le besoin même sans adresse", () => {
    const resultat = preparer({ besoin: "support_client", veutEtrePrevenu: false });

    expect(resultat.statut).toBe("a_enregistrer");
    if (resultat.statut === "a_enregistrer") {
      expect(resultat.entree).toEqual({
        besoin: "support_client",
        secteur: null,
        email: null,
        consentiLe: null,
      });
    }
  });

  it("garde le métier déclaré, débarrassé de ses espaces", () => {
    const resultat = preparer({
      besoin: "juridique",
      secteur: "  boulangerie  ",
      veutEtrePrevenu: false,
    });

    if (resultat.statut === "a_enregistrer") {
      expect(resultat.entree.secteur).toBe("boulangerie");
    }
  });

  it("refuse une demande sans besoin", () => {
    expect(preparer({ besoin: "   ", veutEtrePrevenu: false }).statut).toBe("refusee");
  });
});

describe("Une adresse sans demande d'être prévenu n'est pas gardée", () => {
  it("écarte l'adresse au lieu de la conserver, et le dit", () => {
    const resultat = preparer({
      besoin: "comptabilite",
      email: "dirigeant@entreprise.fr",
      veutEtrePrevenu: false,
    });

    expect(resultat.statut).toBe("a_enregistrer");
    if (resultat.statut === "a_enregistrer") {
      expect(resultat.entree.email).toBeNull();
      expect(resultat.entree.consentiLe).toBeNull();
      expect(resultat.ecarte).toHaveLength(1);
      expect(resultat.ecarte[0]).toContain("pas enregistrée");
    }
  });

  it("ne déduit jamais le consentement de la présence d'une adresse", () => {
    const resultat = preparer({
      besoin: "recrutement",
      email: "a@b.fr",
      veutEtrePrevenu: false,
    });

    if (resultat.statut === "a_enregistrer") {
      expect(resultat.entree.consentiLe).toBeNull();
    }
  });
});

describe("Quand le visiteur demande à être prévenu", () => {
  it("garde l'adresse avec un consentement daté", () => {
    const resultat = preparer({
      besoin: "support_client",
      email: "  Dirigeant@Entreprise.fr  ",
      veutEtrePrevenu: true,
    });

    expect(resultat.statut).toBe("a_enregistrer");
    if (resultat.statut === "a_enregistrer") {
      expect(resultat.entree.email).toBe("Dirigeant@Entreprise.fr");
      expect(resultat.entree.consentiLe).toEqual(MAINTENANT);
    }
  });

  it("refuse s'il n'y a pas d'adresse : on ne pourrait pas le joindre", () => {
    const resultat = preparer({ besoin: "support_client", veutEtrePrevenu: true });

    expect(resultat.statut).toBe("refusee");
    if (resultat.statut === "refusee") {
      expect(resultat.raison).toContain("joindre");
    }
  });

  it("refuse une adresse manifestement fautive, sans perdre la demande", () => {
    const resultat = preparer({
      besoin: "support_client",
      email: "dirigeant.entreprise.fr",
      veutEtrePrevenu: true,
    });

    expect(resultat.statut).toBe("refusee");
    if (resultat.statut === "refusee") {
      // Le message doit dire comment continuer sans adresse, pas seulement constater l'échec.
      expect(resultat.raison).toContain("laissez-la vide");
    }
  });

  it("accepte les adresses valides que des contrôles trop stricts rejettent", () => {
    for (const adresse of ["a+b@c.fr", "pre.nom@sous.domaine.co.uk", "n0m-1@d-e.fr"]) {
      const resultat = preparer({ besoin: "juridique", email: adresse, veutEtrePrevenu: true });
      expect(resultat.statut).toBe("a_enregistrer");
    }
  });
});

describe("Ce qu'on propose au visiteur", () => {
  it("ne promet aucune date et n'emploie aucun mot interdit", () => {
    const texte = propositionDeListeDAttente("le suivi de vos clients existants");

    for (const promesse of ["bientôt", "prochainement", "dès que possible", "en cours de dévelop"]) {
      expect(texte.toLowerCase()).not.toContain(promesse);
    }
    for (const interdit of ["ia", "agent", "assistant", "modèle", "bot", "automatisation"]) {
      expect(texte.toLowerCase()).not.toMatch(
        new RegExp(`(^|[^\\p{L}])${interdit}($|[^\\p{L}])`, "u"),
      );
    }
  });

  it("dit que la demande compte même sans adresse", () => {
    expect(propositionDeListeDAttente("vos sujets juridiques")).toContain("Sans adresse");
  });
});
