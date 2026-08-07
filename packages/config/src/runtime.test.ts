import { describe, expect, it } from "vitest";

import {
  REGLAGES_RUNTIME_PAR_DEFAUT,
  VARIABLES_RUNTIME,
  lireReglagesRuntime,
} from "./runtime.js";

describe("les réglages du runtime", () => {
  it("rend les valeurs décidées quand rien n'est surchargé", () => {
    expect(lireReglagesRuntime({})).toEqual(REGLAGES_RUNTIME_PAR_DEFAUT);
    expect(lireReglagesRuntime()).toEqual(REGLAGES_RUNTIME_PAR_DEFAUT);
  });

  it("porte la décision produit : dix pas par cycle, un cycle par jour", () => {
    // Ce test n'existe pas pour vérifier deux nombres — il existe pour que changer la promesse
    // commerciale (« votre employé travaille chaque jour ») soit un geste visible, et non un
    // effet de bord d'une modification de code.
    expect(REGLAGES_RUNTIME_PAR_DEFAUT.pasMaximumParRun).toBe(10);
    expect(REGLAGES_RUNTIME_PAR_DEFAUT.cadenceEntreRunsHeures).toBe(24);
  });

  it("accepte une surcharge d'environnement, sans redéploiement", () => {
    const reglages = lireReglagesRuntime({ [VARIABLES_RUNTIME.pasMaximumParRun]: "25" });

    expect(reglages.pasMaximumParRun).toBe(25);
    // Les autres ne bougent pas : une surcharge est ponctuelle, pas un remplacement du tout.
    expect(reglages.cadenceEntreRunsHeures).toBe(REGLAGES_RUNTIME_PAR_DEFAUT.cadenceEntreRunsHeures);
  });

  it("échoue bruyamment sur une valeur inexploitable, au lieu de retomber en silence", () => {
    // Un repli muet ferait croire que le réglage a été pris en compte. Le jour où quelqu'un écrit
    // « SENTIO_PAS_MAX_PAR_RUN=dix », il doit l'apprendre au démarrage, pas six mois plus tard en
    // relisant une facture d'inférence.
    for (const brut of ["dix", "0", "-1", "2.5", "  "]) {
      expect(() => lireReglagesRuntime({ [VARIABLES_RUNTIME.pasMaximumParRun]: brut })).toThrow(
        /SENTIO_PAS_MAX_PAR_RUN/,
      );
    }
  });

  it("traite une variable vide comme une variable absente", () => {
    // Une variable déclarée sans valeur est le cas normal d'un fichier d'environnement en cours
    // d'édition ; la refuser bloquerait un déploiement pour rien.
    expect(lireReglagesRuntime({ [VARIABLES_RUNTIME.cadenceEntreRunsHeures]: "" })).toEqual(
      REGLAGES_RUNTIME_PAR_DEFAUT,
    );
  });
});
