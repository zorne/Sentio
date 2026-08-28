import { describe, expect, it } from "vitest";

import { lireLaReponseDeLAnnuaire } from "./annuaire.js";

/**
 * Les règles d'écartement de l'annuaire public.
 *
 * ⚠️ CHACUNE DE CES RÈGLES EST UNE RÈGLE DE CONFORMITÉ OU DE VALEUR, PAS UN CONFORT. Les tester
 * ici, sans réseau, est le seul moyen de les éprouver : un filtre qu'on ne peut vérifier qu'en
 * appelant l'État n'est pas vérifié — il est espéré.
 *
 * Les charges ci-dessous reprennent la forme réelle de la réponse de
 * `recherche-entreprises.api.gouv.fr`, relevée sur l'API le 2026-08-28.
 */

function entreprise(surcharge: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    siren: "482509999",
    nom_complet: "MENUISERIES DU NORD",
    statut_diffusion: "O",
    etat_administratif: "A",
    nature_juridique: "5710",
    activite_principale: "43.32A",
    dirigeants: [{ nom: "DUPONT", prenoms: "Jean" }],
    matching_etablissements: [
      {
        siret: "48250999900023",
        etat_administratif: "A",
        code_postal: "59000",
        libelle_commune: "LILLE",
      },
    ],
    ...surcharge,
  };
}

describe("l'annuaire public — ce qu'on retient et ce qu'on écarte", () => {
  it("retient une personne morale active et diffusible", () => {
    const trouvees = lireLaReponseDeLAnnuaire({ results: [entreprise()] });

    expect(trouvees).toEqual([
      {
        reference: "48250999900023",
        nom: "MENUISERIES DU NORD",
        secteur: "43.32A",
        commune: "LILLE",
        codePostal: "59000",
      },
    ]);
  });

  it("⭐ n'emporte AUCUN nom de dirigeant", () => {
    // L'API les rend, et ils sont des données personnelles. La seule protection qui vaille est de
    // ne pas avoir de champ où les mettre : ce test constate qu'il n'y en a pas.
    const [trouvee] = lireLaReponseDeLAnnuaire({ results: [entreprise()] });

    expect(JSON.stringify(trouvee)).not.toContain("DUPONT");
    expect(JSON.stringify(trouvee)).not.toContain("Jean");
  });

  it("⭐ écarte une entreprise non diffusible", () => {
    // L'INSEE marque ainsi celles qui ont demandé à ne pas figurer dans les diffusions publiques.
    // Les prospecter serait passer outre une opposition déjà exprimée.
    expect(
      lireLaReponseDeLAnnuaire({ results: [entreprise({ statut_diffusion: "P" })] }),
    ).toEqual([]);
  });

  it("⭐ écarte un entrepreneur individuel", () => {
    // Sa raison sociale EST le nom d'une personne physique : la collecter, c'est collecter une
    // donnée personnelle, avec tout ce que l'article 14 impose. On s'en tient aux personnes
    // morales.
    expect(
      lireLaReponseDeLAnnuaire({
        results: [entreprise({ nature_juridique: "1000", nom_complet: "MARIE DURAND" })],
      }),
    ).toEqual([]);
  });

  it("écarte une entreprise cessée", () => {
    expect(
      lireLaReponseDeLAnnuaire({ results: [entreprise({ etat_administratif: "C" })] }),
    ).toEqual([]);
  });

  it("⭐ écarte une entreprise dont l'établissement TROUVÉ est fermé", () => {
    // ⚠️ LE PIÈGE DES DEUX NIVEAUX, RENCONTRÉ SUR UN CAS RÉEL.
    //
    // Le filtre géographique de l'API porte sur n'importe quel établissement, pas sur le siège.
    // Une recherche sur Lille rend donc des sociétés dont le siège est ailleurs — et dont
    // l'établissement lillois est FERMÉ. L'entreprise est bien active ; l'agence qu'on a trouvée
    // ne l'est pas. La prospecter là-bas n'a aucune valeur.
    const trouvees = lireLaReponseDeLAnnuaire({
      results: [
        entreprise({
          etat_administratif: "A",
          matching_etablissements: [
            { siret: "48250999900099", etat_administratif: "F", code_postal: "59000" },
          ],
        }),
      ],
    });

    expect(trouvees).toEqual([]);
  });

  it("retient l'établissement APPARIÉ, jamais le siège d'un autre département", () => {
    // Le siège est à Sarcelles, l'établissement trouvé est à Lille : c'est Lille qui compte, sinon
    // le dirigeant lillois lirait « Sarcelles » sur un prospect qu'il a demandé près de chez lui.
    const [trouvee] = lireLaReponseDeLAnnuaire({
      results: [
        entreprise({
          siege: { siret: "48250999900001", code_postal: "95200", libelle_commune: "SARCELLES" },
        }),
      ],
    });

    expect(trouvee?.commune).toBe("LILLE");
    expect(trouvee?.reference).toBe("48250999900023");
  });

  it("se rabat sur le siège quand la recherche n'est pas géographique", () => {
    // Sans critère de lieu, l'API ne renvoie pas d'appariement. Le siège fait alors foi — sinon
    // une recherche sur toute la France ne rendrait jamais rien.
    const [trouvee] = lireLaReponseDeLAnnuaire({
      results: [
        entreprise({
          matching_etablissements: [],
          siege: { siret: "48250999900001", code_postal: "95200", libelle_commune: "SARCELLES" },
        }),
      ],
    });

    expect(trouvee?.commune).toBe("SARCELLES");
  });

  it("ne rend rien plutôt que d'échouer sur une réponse inattendue", () => {
    // Une API publique change sans prévenir. Une recherche qui ne trouve rien est un résultat ;
    // une exception ici ferait échouer le pas entier de l'employée.
    expect(lireLaReponseDeLAnnuaire(null)).toEqual([]);
    expect(lireLaReponseDeLAnnuaire({})).toEqual([]);
    expect(lireLaReponseDeLAnnuaire({ results: "surprise" })).toEqual([]);
    expect(lireLaReponseDeLAnnuaire({ results: [{}] })).toEqual([]);
  });

  it("écarte une entreprise sans nom, plutôt que d'inscrire une fiche vide", () => {
    expect(lireLaReponseDeLAnnuaire({ results: [entreprise({ nom_complet: "   " })] })).toEqual([]);
  });
});
