/**
 * Le test le plus important du projet.
 *
 * Tout Sentio repose sur une promesse : **la décision est prise par des règles, pas générée**.
 * Si la composition n'est pas déterministe, cette promesse est vide — on ne peut plus tester une
 * configuration avant de l'avoir vue tourner, ni comparer deux clients, ni détecter une
 * régression autrement qu'en production.
 *
 * Réalise : LADY-E
 */

import { describe, expect, it } from "vitest";

import {
  type Confiance,
  type Constat,
  type Domaine,
  type GenreDeConstat,
  type SourceDeConstat,
  CONFIANCE_PAR_SOURCE,
} from "./audit.js";
import {
  ACTES_PAR_DOMAINE,
  composer,
  diagnostiquer,
  EXIGENCES_PAR_ACTE,
  ROLE_PAR_DOMAINE,
} from "./composition.js";

const c = (
  genre: GenreDeConstat,
  domaine: Domaine,
  source: SourceDeConstat,
  libelle = "peu importe",
  confiance?: Confiance,
): Constat => ({
  genre,
  domaine,
  source,
  confiance: confiance ?? CONFIANCE_PAR_SOURCE[source],
  libelle,
});

/** Cinq dossiers volontairement contrastés — pas cinq variantes du même. */
const DOSSIERS: Record<string, readonly Constat[]> = {
  "prospection à sec": [
    c("goulot", "recherche_selection", "declare", "trop peu d'entreprises approchées"),
    c("opportunite", "communication_sortante", "deduit", "engager dès que la liste s'élargit"),
  ],
  "du volume, mal ciblé": [
    c("faiblesse", "evaluation", "declare", "du volume, mais mal ciblé"),
    c("force", "recherche_selection", "deduit", "le volume ne manque pas"),
    c("opportunite", "communication_sortante", "deduit", "n'écrire qu'aux retenues"),
  ],
  "conversations abandonnées": [
    c("goulot", "communication_sortante", "declare", "jamais reprises"),
    c("faiblesse", "donnees_fiches", "deduit", "aucune trace des échanges"),
  ],
  "tout va bien sauf l'entrant": [
    c("force", "recherche_selection", "mesure", "la prospection produit"),
    c("force", "communication_sortante", "mesure", "les messages partent et obtiennent des réponses"),
    c("goulot", "communication_entrante", "mesure", "les demandes entrantes se perdent"),
  ],
  "rien ne ressort": [c("force", "recherche_selection", "declare", "tout fonctionne")],
};

describe("Déterminisme — mêmes constats, même configuration, toujours", () => {
  for (const [nom, constats] of Object.entries(DOSSIERS)) {
    it(`« ${nom} » compose toujours la même chose`, () => {
      const reference = JSON.stringify(composer(diagnostiquer(constats)));
      for (let i = 0; i < 50; i++) {
        expect(JSON.stringify(composer(diagnostiquer(constats)))).toBe(reference);
      }
    });

    it(`« ${nom} » ne dépend pas de l'ordre d'arrivée des constats`, () => {
      const reference = JSON.stringify(composer(diagnostiquer(constats)));
      // L'ordre d'arrivée est un accident de la conversation. S'il changeait la configuration,
      // deux dirigeants racontant la même chose dans un ordre différent recevraient deux Lady
      // différentes — et personne ne saurait pourquoi.
      const permutations = [
        [...constats].reverse(),
        [...constats].sort((a, b) => a.libelle.localeCompare(b.libelle)),
        [...constats].sort((a, b) => b.libelle.localeCompare(a.libelle)),
      ];
      for (const permutation of permutations) {
        expect(JSON.stringify(composer(diagnostiquer(permutation)))).toBe(reference);
      }
    });
  }
});

describe("Le diagnostic conclut, il n'obéit pas", () => {
  it("une force renverse ce que la déclaration laissait attendre", () => {
    // Le dirigeant se plaint du ciblage. La force déduite — « le volume ne manque pas » — retire
    // à la recherche le besoin qu'on lui aurait prêté. Le rôle bascule vers la qualification.
    const resultat = composer(diagnostiquer(DOSSIERS["du volume, mal ciblé"] as Constat[]));

    expect(resultat.statut).toBe("compose");
    if (resultat.statut !== "compose") return;
    expect(resultat.configuration.role).toBe(ROLE_PAR_DOMAINE.evaluation);
    expect(resultat.configuration.capacites).not.toContain("rechercher.prospect");
  });

  it("dit non quand le vrai besoin sort de la bibliothèque — sans se rabattre sur le suivant", () => {
    const resultat = composer(diagnostiquer(DOSSIERS["tout va bien sauf l'entrant"] as Constat[]));

    // Vendre le deuxième besoin en taisant le premier serait exactement le mensonge que
    // `hors_perimetre` existe pour empêcher.
    expect(resultat.statut).toBe("hors_perimetre");
    if (resultat.statut !== "hors_perimetre") return;
    expect(resultat.domaine).toBe("communication_entrante");
  });

  it("n'invente pas un besoin pour avoir quelque chose à vendre", () => {
    const resultat = composer(diagnostiquer(DOSSIERS["rien ne ressort"] as Constat[]));
    expect(resultat.statut).toBe("aucun_besoin");
  });
});

describe("Le vocabulaire est fermé — rien n'est rédigé, tout est choisi", () => {
  const connues = new Set(Object.values(ACTES_PAR_DOMAINE).flat());

  it("ne produit jamais une capacité qui n'existe pas dans la bibliothèque", () => {
    for (const constats of Object.values(DOSSIERS)) {
      const resultat = composer(diagnostiquer(constats));
      if (resultat.statut !== "compose") continue;
      for (const capacite of resultat.configuration.capacites) {
        expect(connues.has(capacite)).toBe(true);
      }
    }
  });

  it("ne produit jamais un rôle hors du vocabulaire", () => {
    const roles = new Set(Object.values(ROLE_PAR_DOMAINE));
    for (const constats of Object.values(DOSSIERS)) {
      const resultat = composer(diagnostiquer(constats));
      if (resultat.statut !== "compose") continue;
      expect(roles.has(resultat.configuration.role)).toBe(true);
    }
  });

  it("une opportunité seule n'ouvre que l'acte d'entrée du domaine", () => {
    // Le domaine fonctionne : on y donne accès, on ne déverse pas toute la famille.
    const resultat = composer(diagnostiquer(DOSSIERS["prospection à sec"] as Constat[]));
    expect(resultat.statut).toBe("compose");
    if (resultat.statut !== "compose") return;
    expect(resultat.configuration.capacites).toContain("envoyer.prospect");
    expect(resultat.configuration.capacites).not.toContain("relancer.prospect");
  });

  it("un domaine cassé ouvre toute sa famille", () => {
    const resultat = composer(diagnostiquer(DOSSIERS["conversations abandonnées"] as Constat[]));
    expect(resultat.statut).toBe("compose");
    if (resultat.statut !== "compose") return;
    expect(resultat.configuration.capacites).toContain("envoyer.prospect");
    expect(resultat.configuration.capacites).toContain("relancer.prospect");
  });
});

describe("Aucune capacité n'est activée sans ce qu'elle exige", () => {
  it("n'écrit jamais à une entreprise sans pouvoir la qualifier d'abord", () => {
    // C'est une règle de produit, pas une dépendance technique : écrire à une entreprise non
    // qualifiée brûle la réputation du client. La composition ne peut pas l'oublier.
    for (const constats of Object.values(DOSSIERS)) {
      const resultat = composer(diagnostiquer(constats));
      if (resultat.statut !== "compose") continue;
      const actives = new Set(resultat.configuration.capacites);
      if (actives.has("envoyer.prospect")) {
        expect(actives.has("qualifier.prospect")).toBe(true);
      }
    }
  });

  it("ferme toujours l'ensemble sur les exigences, quel que soit le dossier", () => {
    for (const constats of Object.values(DOSSIERS)) {
      const resultat = composer(diagnostiquer(constats));
      if (resultat.statut !== "compose") continue;
      const actives = new Set(resultat.configuration.capacites);
      for (const capacite of actives) {
        for (const exigee of EXIGENCES_PAR_ACTE[capacite] ?? []) {
          expect(actives.has(exigee)).toBe(true);
        }
      }
    }
  });
});
