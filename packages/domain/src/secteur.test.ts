import { describe, expect, it } from "vitest";

import {
  normaliserUnSecteur,
  selectionnerUnProfilSectoriel,
  type ProfilSectorielDisponible,
} from "./secteur.js";

const publies: ProfilSectorielDisponible[] = [
  { sector: "boulangerie", alias: ["boulangerie-pâtisserie", "boulanger"] },
  { sector: "menuiserie" },
];

describe("Normalisation", () => {
  it("neutralise casse, accents, tirets et ponctuation", () => {
    expect(normaliserUnSecteur("  Boulangerie-Pâtisserie !  ")).toBe("boulangerie patisserie");
  });

  it("ne touche ni au pluriel ni à la racine", () => {
    expect(normaliserUnSecteur("menuiseries")).not.toBe(normaliserUnSecteur("menuiserie"));
    expect(normaliserUnSecteur("menuisier")).not.toBe(normaliserUnSecteur("menuiserie"));
  });
});

describe("Ce qui est reconnu", () => {
  it("retient un profil dont le nom correspond, à la typographie près", () => {
    expect(selectionnerUnProfilSectoriel("  BOULANGERIE ", publies)).toEqual({
      statut: "retenu",
      sector: "boulangerie",
    });
  });

  it("retient un profil par un alias déclaré", () => {
    expect(selectionnerUnProfilSectoriel("Boulangerie-Pâtisserie", publies)).toEqual({
      statut: "retenu",
      sector: "boulangerie",
    });
  });
});

describe("Ce qui n'est pas reconnu est dit, jamais deviné", () => {
  it("ne rapproche pas un métier voisin", () => {
    const selection = selectionnerUnProfilSectoriel("restauration", publies);

    expect(selection.statut).toBe("secteur_inconnu");
  });

  it("ne se rabat pas sur un profil qui contient le mot", () => {
    // « boulange » est un préfixe de « boulangerie » : un « contient » l'accepterait.
    expect(selectionnerUnProfilSectoriel("boulange", publies).statut).toBe("secteur_inconnu");
    // Et l'inverse : un nom plus long qui englobe un profil connu.
    expect(selectionnerUnProfilSectoriel("boulangerie industrielle", publies).statut).toBe(
      "secteur_inconnu",
    );
  });

  it("dit ce qu'il ne sait pas sans employer de mot interdit par le lexique", () => {
    const selection = selectionnerUnProfilSectoriel("restauration", publies);
    const message = "message" in selection ? selection.message : "";

    // Sur des MOTS ENTIERS, comme le vérificateur de lexique lui-même : « agent » est interdit,
    // « agenda » ne l'est pas. Chercher la sous-chaîne rejetterait « commercial », qui contient
    // « ia » — et un test plus sévère que la règle finit par faire réécrire du texte correct.
    for (const interdit of ["ia", "intelligence artificielle", "agent", "assistant", "modèle", "bot"]) {
      expect(message.toLowerCase()).not.toMatch(
        new RegExp(`(^|[^\\p{L}])${interdit}($|[^\\p{L}])`, "u"),
      );
    }
    expect(message).toContain("restauration");
  });

  it("traite une déclaration vide ou purement ponctuelle comme une absence", () => {
    expect(selectionnerUnProfilSectoriel("", publies).statut).toBe("secteur_non_dit");
    expect(selectionnerUnProfilSectoriel("   ", publies).statut).toBe("secteur_non_dit");
    expect(selectionnerUnProfilSectoriel("!!! ---", publies).statut).toBe("secteur_non_dit");
    expect(selectionnerUnProfilSectoriel(null, publies).statut).toBe("secteur_non_dit");
    expect(selectionnerUnProfilSectoriel(undefined, publies).statut).toBe("secteur_non_dit");
  });

  it("ne retient rien quand aucun profil n'est publié", () => {
    expect(selectionnerUnProfilSectoriel("boulangerie", []).statut).toBe("secteur_inconnu");
  });
});

describe("Deux profils pour un même nom", () => {
  it("refuse d'arbitrer et rend les deux candidats", () => {
    const ambigus: ProfilSectorielDisponible[] = [
      { sector: "boulangerie" },
      { sector: "artisanat alimentaire", alias: ["boulangerie"] },
    ];

    const selection = selectionnerUnProfilSectoriel("boulangerie", ambigus);

    expect(selection.statut).toBe("profils_ambigus");
    if (selection.statut === "profils_ambigus") {
      expect(selection.candidats).toEqual(["artisanat alimentaire", "boulangerie"]);
    }
  });
});
