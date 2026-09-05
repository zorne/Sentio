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
  type Objet,
  type SourceDeConstat,
  CONFIANCE_PAR_SOURCE,
  DOMAINES,
} from "./audit.js";
import {
  ACTES_PAR_DOMAINE,
  composer,
  diagnostiquer,
  domainePourPriorite,
  EXIGENCES_PAR_ACTE,
  PRIORITE_PAR_DOMAINE,
  ROLE_PAR_DOMAINE,
} from "./composition.js";

const c = (
  genre: GenreDeConstat,
  domaine: Domaine,
  source: SourceDeConstat,
  libelle = "peu importe",
  objet: Objet = "prospect",
  confiance?: Confiance,
): Constat => ({
  genre,
  domaine,
  objet,
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
    c("goulot", "communication_entrante", "mesure", "les demandes entrantes se perdent", "demande"),
  ],
  "les impayés ne sont jamais relancés": [
    // Même domaine et même acte que la relance de prospects — un AUTRE objet. La bibliothèque
    // sait relancer, et pourtant elle ne sait pas relancer une facture : aucun moteur ne le sert.
    c("goulot", "communication_sortante", "declare", "les impayés dorment", "facture"),
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
  const connues = new Set(
    Object.values(ACTES_PAR_DOMAINE).flatMap((parObjet) => Object.values(parObjet ?? {}).flat()),
  );

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

describe("L'axe « objet » est réel — un acte connu ne suffit pas", () => {
  it("ne confond pas relancer un prospect et relancer une facture", () => {
    // `relancer` existe. `facture` existe. Et pourtant `relancer × facture` n'est servi par aucun
    // moteur : le besoin sort du périmètre, et Sentio le dit au lieu de promettre un geste que
    // rien n'exécute. C'est la séparation de l'étape 2, devenue effective dans le moteur.
    const resultat = composer(diagnostiquer(DOSSIERS["les impayés ne sont jamais relancés"] as Constat[]));

    expect(resultat.statut).toBe("hors_perimetre");
    if (resultat.statut !== "hors_perimetre") return;
    expect(resultat.domaine).toBe("communication_sortante");
    expect(resultat.objet).toBe("facture");
  });

  it("un besoin sur un objet servi passe, sur le même domaine", () => {
    const resultat = composer(
      diagnostiquer([c("goulot", "communication_sortante", "declare", "jamais repris", "prospect")]),
    );
    expect(resultat.statut).toBe("compose");
  });

  it("deux entreprises aux constats opposés reçoivent deux configurations différentes", () => {
    // ⭐ Le critère de l'étape 8. La différence doit s'expliquer par les constats, pas par un
    // réglage : ce sont les mêmes règles, appliquées à des observations opposées.
    const aSec = composer(diagnostiquer(DOSSIERS["prospection à sec"] as Constat[]));
    const malCible = composer(diagnostiquer(DOSSIERS["du volume, mal ciblé"] as Constat[]));

    expect(aSec.statut).toBe("compose");
    expect(malCible.statut).toBe("compose");
    if (aSec.statut !== "compose" || malCible.statut !== "compose") return;

    expect(aSec.configuration.role).not.toBe(malCible.configuration.role);
    expect(aSec.configuration.capacites).not.toEqual(malCible.configuration.capacites);

    // Et la différence se relit : chaque configuration porte les constats qui l'expliquent.
    expect(aSec.configuration.motifs.join(" ")).toContain("trop peu d'entreprises approchées");
    expect(malCible.configuration.motifs.join(" ")).toContain("mal ciblé");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Les priorités écrites portent un COMPORTEMENT, pas seulement un affichage
// ═══════════════════════════════════════════════════════════════════════════════

describe("les phrases de priorité restent réversibles", () => {
  /**
   * ⚠️ POURQUOI CE TEST EXISTE, ET CE QU'IL EMPÊCHE EXACTEMENT.
   *
   * `composer()` écrit ces phrases dans `lady_configuration.priorites`, et le moteur de
   * priorisation (`@sentio/core`) les relit **à l'envers** pour retrouver le domaine et son rang
   * — c'est ce rang qui décide quel travail Lady ouvre en premier.
   *
   * Sans ces trois cas, une reformulation purement cosmétique — corriger une tournure, ajouter
   * un mot — changerait silencieusement l'ordre de travail de Lady chez tous les clients, sans
   * qu'aucun test n'échoue et sans que rien ne soit visible à l'écran : la phrase resterait
   * lisible, et l'affichage correct. C'est exactement le genre de couplage qui se paie six mois
   * plus tard, quand plus personne ne se souvient qu'il existait.
   */

  it("⭐ chaque domaine a une priorité, et elle se relit — les HUIT, pas seulement ceux servis", () => {
    // ⚠️ Les huit, y compris les quatre que la bibliothèque ne sert pas encore
    // (`ACTES_PAR_DOMAINE`). Ne garder que les couverts laisserait un piège tendu pour le jour
    // où l'un d'eux sera ouvert : sa phrase pourrait être non réversible depuis longtemps.
    expect(DOMAINES).toHaveLength(8);

    for (const domaine of DOMAINES) {
      const phrase = PRIORITE_PAR_DOMAINE[domaine];
      expect(phrase.trim()).not.toBe("");
      expect(domainePourPriorite(phrase)).toBe(domaine);
    }
  });

  it("⭐ aucune phrase n'est partagée par deux domaines", () => {
    // Deux domaines derrière la même phrase rendraient le rang indécidable : la relecture
    // rendrait le premier trouvé, c'est-à-dire l'ordre de déclaration — un comportement décidé
    // par l'ordre des lignes d'un objet littéral.
    const phrases = DOMAINES.map((domaine) => PRIORITE_PAR_DOMAINE[domaine]);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it("une phrase inconnue rend null, jamais un domaine approximatif", () => {
    // Une configuration ancienne peut porter une formulation reformulée depuis. Le travail
    // concerné retombe au poids plancher — il ne disparaît pas, et rien ne devine à sa place.
    expect(domainePourPriorite("une phrase que personne n'a jamais écrite")).toBeNull();
    expect(domainePourPriorite("")).toBeNull();
    // Un préfixe n'est pas une correspondance : on compare la phrase entière.
    expect(domainePourPriorite("élargir le nombre")).toBeNull();
  });
});
