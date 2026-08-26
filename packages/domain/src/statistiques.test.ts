/**
 * LADY-Y — ce que les chiffres refusent de dire.
 *
 * Un tableau de bord ment rarement en inventant un nombre. Il ment en **divisant trop tôt** : le
 * premier jour, une réponse sur deux envois affiche 50 %, et la semaine suivante 8 % — le
 * dirigeant croit alors que son employée s'est effondrée alors qu'elle vient seulement de sortir
 * du bruit statistique.
 */

import { describe, expect, it } from "vitest";

import {
  courbe,
  ENVOIS_MINIMAUX_POUR_UN_TAUX,
  evolutionDuTauxDeReponse,
  tauxDeReponse,
  type JourDeTravail,
} from "./statistiques.js";

const jour = (contactes: number, reponses: number, n = 1): JourDeTravail[] =>
  Array.from({ length: n }, (_, i) => ({
    jour: `2026-08-${String(i + 1).padStart(2, "0")}`,
    contactes,
    reponses,
    rendezVous: 0,
    ventes: 0,
  }));

describe("Un taux ne s'affiche pas avant de vouloir dire quelque chose", () => {
  it("⭐⭐ refuse de diviser sur trop peu d'envois", () => {
    // C'est LE mensonge classique du tableau de bord : 50 % le premier jour, 8 % la semaine
    // suivante, et un dirigeant persuadé que tout s'écroule.
    const t = tauxDeReponse({ contactes: 2, reponses: 1 });

    expect(t.statut).toBe("trop_tot");
    if (t.statut !== "trop_tot") return;
    // Et il dit ce qu'il manque : un refus muet ressemble à une panne d'affichage.
    expect(t.manque).toBe(ENVOIS_MINIMAUX_POUR_UN_TAUX - 2);
  });

  it("⭐ le rend dès que le dénominateur porte", () => {
    const t = tauxDeReponse({ contactes: 40, reponses: 6 });
    expect(t.statut).toBe("mesure");
    if (t.statut !== "mesure") return;
    expect(t.valeur).toBe(15);
    // Le dénominateur voyage avec le taux : « 15 % » seul n'est pas vérifiable.
    expect(t.sur).toBe(40);
  });

  it("zéro réponse sur assez d'envois EST un résultat", () => {
    const t = tauxDeReponse({ contactes: 60, reponses: 0 });
    expect(t.statut).toBe("mesure");
    if (t.statut !== "mesure") return;
    expect(t.valeur).toBe(0);
  });
});

describe("« Est-ce que ça progresse ? » se refuse plus souvent qu'il ne se répond", () => {
  it("⭐⭐ ne compare pas deux moitiés dont une seule est mesurable", () => {
    // Une semaine à 40 envois contre une semaine à 3 : le calcul passe, et il ne compare rien.
    const serie = [...jour(0, 0, 7), ...jour(20, 4, 7)];
    const e = evolutionDuTauxDeReponse(serie);
    expect(e.statut).toBe("trop_tot");
  });

  it("⭐⭐ un écart d'un point est STABLE, pas une progression", () => {
    // Sans ce plancher, le produit annonce une évolution tous les jours — et n'en annonce donc
    // plus aucune.
    const serie = [...jour(10, 1, 7), ...jour(10, 1, 7)];
    expect(evolutionDuTauxDeReponse(serie).statut).toBe("stable");
  });

  it("⭐ dit la hausse quand elle est nette, avec son ampleur", () => {
    const serie = [...jour(10, 1, 7), ...jour(10, 3, 7)];
    const e = evolutionDuTauxDeReponse(serie);

    expect(e.statut).toBe("bouge");
    if (e.statut !== "bouge") return;
    expect(e.sens).toBe("hausse");
    expect(e.points).toBe(20);
  });

  it("dit aussi la baisse : un produit qui ne sait annoncer que les bonnes nouvelles n'informe pas", () => {
    const serie = [...jour(10, 4, 7), ...jour(10, 1, 7)];
    const e = evolutionDuTauxDeReponse(serie);
    expect(e.statut).toBe("bouge");
    if (e.statut !== "bouge") return;
    expect(e.sens).toBe("baisse");
  });

  it("se tait sur une période trop courte", () => {
    expect(evolutionDuTauxDeReponse(jour(50, 10, 3)).statut).toBe("trop_tot");
  });
});

describe("La courbe garde la forme, pas l'échelle", () => {
  it("⭐ une série tout à zéro ne devient pas une ligne à mi-hauteur", () => {
    // Une division par zéro déguisée dessinerait une courbe plate au milieu du cadre : à l'écran,
    // ça se lit comme « moyen », pas comme « rien ».
    expect(courbe(jour(0, 0, 5), (j) => j.contactes)).toEqual([0, 0, 0, 0, 0]);
  });

  it("⭐ deux séries de même forme donnent la même courbe, quelle que soit l'échelle", () => {
    const petite: JourDeTravail[] = [
      ...jour(1, 0),
      ...jour(2, 0),
      ...jour(4, 0),
    ];
    const grande: JourDeTravail[] = [
      ...jour(30, 0),
      ...jour(60, 0),
      ...jour(120, 0),
    ];
    expect(courbe(petite, (j) => j.contactes)).toEqual(courbe(grande, (j) => j.contactes));
  });
});
