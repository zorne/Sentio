import { BORNES_DE_PRIORISATION_PAR_DEFAUT, type BornesDePriorisation } from "@sentio/config";
import { describe, expect, it } from "vitest";

import {
  prioriserLesTravaux,
  raconterLaPriorisation,
  type EntreeDePriorisation,
  type TravailCandidat,
} from "./priorisation.js";

/**
 * Le choix du travail — ce qui remplace « le premier arrivé gagne toujours ».
 *
 * ══ CE QUE CETTE SUITE GARDE, ET POURQUOI CHAQUE CAS EXISTE ══
 *
 * Une formule à quatre facteurs multiplicatifs est facile à écrire et difficile à garder juste :
 * chaque facteur peut, seul, écraser les trois autres. Les cas ci-dessous ne vérifient donc pas
 * « ça marche » — ils vérifient que **chaque borne tient**, séparément, et qu'aucun facteur ne
 * peut prendre le pas sur la décision que le dirigeant a approuvée au-delà de ce qui est permis.
 *
 * ⚠️ Deux natures de travail seulement (`lead`, `recherche`), et c'est délibéré : ce sont les deux
 * seules réellement ouvrables aujourd'hui. Éprouver la mécanique sur des couples hypothétiques
 * ferait passer pour prouvé un comportement que rien n'exerce.
 */

/** Les phrases de priorité, telles qu'elles sont réellement écrites en configuration. */
const PHRASE_RECHERCHE = "élargir le nombre d'entreprises approchées";
const PHRASE_EVALUATION = "n'engager la conversation qu'avec les entreprises qui correspondent";

const DOMAINE_PAR_PHRASE: Record<string, string> = {
  [PHRASE_RECHERCHE]: "recherche_selection",
  [PHRASE_EVALUATION]: "evaluation",
};

function sujets(kind: string, combien: number) {
  return Array.from({ length: combien }, (_, index) => ({ kind, id: `${kind}-${index}` }));
}

function lead(options: Partial<TravailCandidat> = {}): TravailCandidat {
  return {
    kind: "lead",
    couples: [
      { domaine: "evaluation", objet: "prospect" },
      { domaine: "communication_sortante", objet: "prospect" },
      { domaine: "donnees_fiches", objet: "prospect" },
    ],
    sujets: sujets("lead", 20),
    joursSansTravail: 0,
    ...options,
  };
}

function recherche(options: Partial<TravailCandidat> = {}): TravailCandidat {
  return {
    kind: "recherche",
    couples: [{ domaine: "recherche_selection", objet: "prospect" }],
    sujets: sujets("recherche", 1),
    joursSansTravail: 0,
    ...options,
  };
}

function entree(options: Partial<EntreeDePriorisation> = {}): EntreeDePriorisation {
  return {
    candidats: [lead(), recherche()],
    ecartes: [],
    priorites: [],
    domainePourPriorite: (phrase) => DOMAINE_PAR_PHRASE[phrase] ?? null,
    domainesEnRetard: [],
    budget: 10,
    bornes: BORNES_DE_PRIORISATION_PAR_DEFAUT,
    ...options,
  };
}

function creneaux(resultat: ReturnType<typeof prioriserLesTravaux>, kind: string): number {
  return resultat.justification.parts.find((part) => part.kind === kind)?.creneaux ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Déterminisme — la garantie dont toutes les autres dépendent
// ═══════════════════════════════════════════════════════════════════════════════

describe("le choix est reproductible", () => {
  it("⭐ rend exactement le même ordre et la même justification à chaque appel", () => {
    const donnees = entree({ priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE] });

    const premier = prioriserLesTravaux(donnees);
    for (let i = 0; i < 25; i += 1) {
      expect(prioriserLesTravaux(donnees)).toEqual(premier);
    }
  });

  it("⭐ ne dépend pas de l'ordre d'arrivée des candidats", () => {
    // Sans départage total, l'ordre des lignes rendues par la base déciderait — et changerait le
    // jour où un index change, sans qu'aucun test n'échoue.
    const a = prioriserLesTravaux(entree({ candidats: [lead(), recherche()] }));
    const b = prioriserLesTravaux(entree({ candidats: [recherche(), lead()] }));

    expect(b.sujets).toEqual(a.sujets);
  });

  it("⭐ départage deux travaux de score égal par le domaine, jamais par l'ordre d'arrivée", () => {
    // Aucune priorité déclarée : les deux tombent au poids plancher, donc à score strictement
    // égal. C'est le cas qui rendrait le résultat aléatoire sans règle de départage explicite.
    const resultat = prioriserLesTravaux(entree({ priorites: [], budget: 4 }));
    const ordre = resultat.justification.parts.map((part) => part.kind);

    // « evaluation » (lead) précède « recherche_selection » (recherche) dans l'ordre alphabétique.
    expect(ordre).toEqual(["lead", "recherche"]);
    expect(resultat.justification.parts[0]?.score).toBe(resultat.justification.parts[1]?.score);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. La configuration décide — c'est elle que le dirigeant a approuvée
// ═══════════════════════════════════════════════════════════════════════════════

describe("les priorités approuvées commandent", () => {
  it("⭐ le travail cité en premier reçoit la plus grande part", () => {
    const resultat = prioriserLesTravaux(
      entree({ priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE] }),
    );

    expect(creneaux(resultat, "lead")).toBeGreaterThan(creneaux(resultat, "recherche"));
    expect(resultat.justification.parts[0]?.rang).toBe(0);
  });

  it("⭐ inverser les priorités inverse l'ordre du travail — la configuration change le comportement", () => {
    // ⚠️ LE TEST QUI DIT SI LE CHANTIER A ATTEINT SON BUT. Avant, ces deux configurations
    // produisaient rigoureusement le même travail : la configuration ne pilotait rien.
    const commeAvant = prioriserLesTravaux(
      entree({ priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE] }),
    );
    const inversee = prioriserLesTravaux(
      entree({ priorites: [PHRASE_RECHERCHE, PHRASE_EVALUATION] }),
    );

    expect(commeAvant.justification.parts[0]?.kind).toBe("lead");
    expect(inversee.justification.parts[0]?.kind).toBe("recherche");
  });

  it("un travail absent des priorités garde un poids NON NUL", () => {
    // ⚠️ Zéro le rendrait invisible au vieillissement — un score nul reste nul quel que soit le
    // facteur qui le multiplie —, et il ne serait donc jamais repris. C'est exactement la famine
    // que le vieillissement existe pour empêcher.
    const resultat = prioriserLesTravaux(entree({ priorites: [PHRASE_EVALUATION] }));
    const part = resultat.justification.parts.find((p) => p.kind === "recherche");

    expect(part?.rang).toBeNull();
    expect(part?.poidsConfiguration).toBeGreaterThan(0);
    expect(part?.poidsConfiguration).toBe(
      BORNES_DE_PRIORISATION_PAR_DEFAUT.poidsSansPrioritePourcent / 100,
    );
  });

  it("prend le MEILLEUR rang parmi les domaines qu'un travail sert", () => {
    // Une mission « lead » qualifie, consigne ou écrit selon le pas. Retenir le pire ferait
    // dépendre sa priorité de ce qu'elle fait accessoirement.
    const resultat = prioriserLesTravaux(
      entree({
        priorites: [PHRASE_RECHERCHE, "tenir les fiches à jour après chaque échange", PHRASE_EVALUATION],
        domainePourPriorite: (phrase) =>
          phrase === "tenir les fiches à jour après chaque échange"
            ? "donnees_fiches"
            : (DOMAINE_PAR_PHRASE[phrase] ?? null),
      }),
    );

    // `lead` sert `donnees_fiches` (rang 1) et `evaluation` (rang 2) : c'est 1 qui compte.
    expect(resultat.justification.parts.find((p) => p.kind === "lead")?.rang).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Le retard mesuré l'emporte sur une priorité déclarée faible — mais borné
// ═══════════════════════════════════════════════════════════════════════════════

describe("ce qu'on observe l'emporte sur ce qu'on croyait", () => {
  it("⭐ un retard sur l'objectif fait passer devant un travail moins bien classé", () => {
    const sansRetard = prioriserLesTravaux(
      entree({ priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE] }),
    );
    const avecRetard = prioriserLesTravaux(
      entree({
        priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE],
        domainesEnRetard: ["recherche_selection"],
      }),
    );

    expect(sansRetard.justification.parts[0]?.kind).toBe("lead");
    expect(avecRetard.justification.parts[0]?.kind).toBe("recherche");
  });

  it("⭐ l'amplification du retard est PLAFONNÉE par la borne configurée", () => {
    // Sans plafond, ce facteur finirait par écraser les trois autres — non parce qu'il compte
    // davantage, mais parce que rien ne l'arrête.
    for (const ecartMaximumPourcent of [0, 50, 100, 400]) {
      const bornes: BornesDePriorisation = {
        ...BORNES_DE_PRIORISATION_PAR_DEFAUT,
        ecartMaximumPourcent,
      };
      const resultat = prioriserLesTravaux(
        entree({ bornes, domainesEnRetard: ["recherche_selection"] }),
      );
      const part = resultat.justification.parts.find((p) => p.kind === "recherche");

      expect(part?.multiplicateurEcart).toBe(1 + ecartMaximumPourcent / 100);
    }
  });

  it("⭐ un retard fait remonter de plus d'un rang, JAMAIS de deux", () => {
    // ⚠️ CE TEST GARDE UNE CALIBRATION, PAS UN COMPORTEMENT ACCESSOIRE. Les rangs pèsent
    // 1, 1/2, 1/3… : un rang vaut exactement ×2. Une borne d'écart à 100 % ferait donc
    // ÉGALISER le rang suivant au lieu de le dépasser, et le départage alphabétique trancherait
    // — un ordre de travail décidé par ordre de nom, inexplicable au dirigeant. Si quelqu'un
    // ramène la borne à 100 un jour, c'est ici que ça doit se voir.
    const priorites = [PHRASE_EVALUATION, PHRASE_RECHERCHE];

    // Un rang d'écart : le retard l'emporte.
    const unRang = prioriserLesTravaux(
      entree({ priorites, domainesEnRetard: ["recherche_selection"] }),
    );
    expect(unRang.justification.parts[0]?.kind).toBe("recherche");

    // Deux rangs d'écart : le retard ne suffit plus, la configuration reprend la main.
    const deuxRangs = prioriserLesTravaux(
      entree({
        priorites: [PHRASE_EVALUATION, "tenir les fiches à jour après chaque échange", PHRASE_RECHERCHE],
        domainePourPriorite: (phrase) =>
          phrase === "tenir les fiches à jour après chaque échange"
            ? "temps_echeances" // un domaine qu'aucun de nos deux travaux ne sert
            : (DOMAINE_PAR_PHRASE[phrase] ?? null),
        domainesEnRetard: ["recherche_selection"],
      }),
    );
    expect(deuxRangs.justification.parts[0]?.kind).toBe("lead");
  });

  it("un domaine qui va bien n'est jamais amplifié", () => {
    const resultat = prioriserLesTravaux(entree({ domainesEnRetard: [] }));
    for (const part of resultat.justification.parts) {
      expect(part.multiplicateurEcart).toBe(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. La mémoire nuance, elle ne tranche jamais
// ═══════════════════════════════════════════════════════════════════════════════

describe("l'historique est borné dans les deux sens", () => {
  it("⭐ un historique désastreux NE PEUT PAS faire perdre au travail prioritaire son rang", () => {
    // ⚠️ C'EST LA GARANTIE DE GOUVERNANCE DE L'APPRENTISSAGE. Une mémoire apprise peut nuancer
    // l'ordre approuvé par le dirigeant ; elle ne peut pas le renverser. Sans cette borne,
    // quelques mauvais résultats suffiraient à défaire une décision humaine, en silence.
    const resultat = prioriserLesTravaux(
      entree({
        priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE],
        candidats: [
          lead({ ajustementHistorique: -1 }), // le pire possible
          recherche({ ajustementHistorique: 1 }), // le meilleur possible
        ],
      }),
    );

    expect(resultat.justification.parts[0]?.kind).toBe("lead");
  });

  it("écrête un ajustement hors bornes au lieu de le suivre", () => {
    const resultat = prioriserLesTravaux(
      entree({ candidats: [lead({ ajustementHistorique: 5 }), recherche({ ajustementHistorique: -5 })] }),
    );
    const max = BORNES_DE_PRIORISATION_PAR_DEFAUT.historiqueMaximumPourcent / 100;

    expect(resultat.justification.parts.find((p) => p.kind === "lead")?.ajustementHistorique).toBe(max);
    expect(resultat.justification.parts.find((p) => p.kind === "recherche")?.ajustementHistorique).toBe(
      -max,
    );
  });

  it("vaut zéro quand rien n'a été appris — le cas d'aujourd'hui", () => {
    const resultat = prioriserLesTravaux(entree());
    for (const part of resultat.justification.parts) {
      expect(part.ajustementHistorique).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Personne n'est oublié — l'anti-famine, prouvé sur un horizon
// ═══════════════════════════════════════════════════════════════════════════════

describe("aucun travail légitime n'est délaissé indéfiniment", () => {
  it("⭐ le travail le moins bien classé finit par obtenir un créneau", () => {
    // ⚠️ LE DÉFAUT QUE CE MODULE CORRIGE. Avec « le plus fort prend tout », `recherche` n'était
    // jamais ouverte tant qu'il restait un seul prospect — donc jamais, puisque chercher est ce
    // qui produit les prospects. On simule les jours qui passent : l'attente doit finir par payer.
    let jourDuDernierTravail = 0;
    let servi = false;

    for (let jour = 1; jour <= 30 && !servi; jour += 1) {
      const resultat = prioriserLesTravaux(
        entree({
          priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE],
          budget: 3,
          candidats: [lead(), recherche({ joursSansTravail: jour - jourDuDernierTravail })],
        }),
      );
      if (creneaux(resultat, "recherche") > 0) servi = true;
    }

    expect(servi).toBe(true);
  });

  it("⭐ la croissance de l'attente est PLAFONNÉE — un travail oublié ne rafle pas tout d'un coup", () => {
    const bornes = BORNES_DE_PRIORISATION_PAR_DEFAUT;
    const plafond = 1 + bornes.vieillissementMaximumPourcent / 100;

    for (const jours of [0, 4, 8, 100, 10_000]) {
      const resultat = prioriserLesTravaux(
        entree({ candidats: [lead(), recherche({ joursSansTravail: jours })] }),
      );
      const part = resultat.justification.parts.find((p) => p.kind === "recherche");

      expect(part?.facteurVieillissement).toBeLessThanOrEqual(plafond);
      expect(part?.facteurVieillissement).toBe(
        Math.min(1 + jours * (bornes.vieillissementParJourPourcent / 100), plafond),
      );
    }
  });

  it("répartit le budget entre les travaux au lieu de tout donner au premier", () => {
    // Deux responsabilités menées de front, pas une servie jusqu'à épuisement.
    const resultat = prioriserLesTravaux(
      entree({
        priorites: [PHRASE_EVALUATION, PHRASE_RECHERCHE],
        budget: 10,
        candidats: [lead({ sujets: sujets("lead", 20) }), recherche({ sujets: sujets("recherche", 5) })],
      }),
    );

    expect(creneaux(resultat, "lead")).toBeGreaterThan(0);
    expect(creneaux(resultat, "recherche")).toBeGreaterThan(0);
    expect(creneaux(resultat, "lead") + creneaux(resultat, "recherche")).toBe(10);
  });

  it("ne promet jamais plus de sujets qu'il n'en existe", () => {
    const resultat = prioriserLesTravaux(
      entree({
        budget: 10,
        candidats: [lead({ sujets: sujets("lead", 3) }), recherche({ sujets: sujets("recherche", 1) })],
      }),
    );

    expect(resultat.sujets).toHaveLength(4);
  });

  it("rend le budget non consommé aux travaux qui ont encore des sujets", () => {
    // `recherche` n'a qu'un sujet : ses créneaux excédentaires doivent revenir à `lead`, jamais
    // se perdre — sinon un budget de dix ouvrirait six missions alors que dix étaient possibles.
    const resultat = prioriserLesTravaux(
      entree({
        priorites: [PHRASE_RECHERCHE, PHRASE_EVALUATION],
        budget: 10,
        candidats: [lead({ sujets: sujets("lead", 20) }), recherche({ sujets: sujets("recherche", 1) })],
      }),
    );

    expect(creneaux(resultat, "recherche")).toBe(1);
    expect(creneaux(resultat, "lead")).toBe(9);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. La justification — auditable, et complète jusqu'aux travaux écartés
// ═══════════════════════════════════════════════════════════════════════════════

describe("le choix s'explique", () => {
  it("⭐ garde chaque facteur lisible SÉPARÉMENT", () => {
    // Un score agrégé dirait « lead a gagné » sans dire pourquoi. La séparation est ce qui permet
    // de répondre à « est-ce le dirigeant qui l'a voulu, ou le retard qui l'a imposé ? ».
    const resultat = prioriserLesTravaux(
      entree({ priorites: [PHRASE_EVALUATION], domainesEnRetard: ["evaluation"] }),
    );
    const part = resultat.justification.parts.find((p) => p.kind === "lead");

    expect(part).toMatchObject({
      rang: 0,
      couple: { domaine: "evaluation", objet: "prospect" },
      poidsConfiguration: 1,
      multiplicateurEcart: 1 + BORNES_DE_PRIORISATION_PAR_DEFAUT.ecartMaximumPourcent / 100,
      ajustementHistorique: 0,
      facteurVieillissement: 1,
    });
    expect(part?.score).toBe(1 + BORNES_DE_PRIORISATION_PAR_DEFAUT.ecartMaximumPourcent / 100);
  });

  it("⭐ journalise les travaux écartés faute de capacité active", () => {
    // ⚠️ Aucun mécanisme ne s'en saisit encore, et c'est voulu : c'est la matière première de
    // « Lady signale qu'il lui manque un outil », qui est un autre chantier. L'écrire coûte une
    // ligne aujourd'hui ; le reconstituer après coup coûterait l'historique.
    const resultat = prioriserLesTravaux(
      entree({
        candidats: [lead()],
        ecartes: [
          {
            kind: "recherche",
            couples: [{ domaine: "recherche_selection", objet: "prospect" }],
            raison: "aucune_capacite_active",
          },
        ],
      }),
    );

    expect(resultat.justification.ecartes).toEqual([
      {
        kind: "recherche",
        couples: [{ domaine: "recherche_selection", objet: "prospect" }],
        raison: "aucune_capacite_active",
      },
    ]);
    // Écarté veut dire écarté : aucun sujet de cette nature n'est ouvert.
    expect(resultat.sujets.every((sujet) => sujet.kind === "lead")).toBe(true);
  });

  it("la phrase se déduit de la structure, et dit le rang comme le retard", () => {
    const resultat = prioriserLesTravaux(
      entree({ priorites: [PHRASE_EVALUATION], domainesEnRetard: ["evaluation"], budget: 2 }),
    );

    const phrase = raconterLaPriorisation(resultat.justification);
    expect(phrase).toContain("lead");
    expect(phrase).toContain("priorité n°1");
    expect(phrase).toContain("en retard");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Les cas limites — une fonction totale ne lève jamais
// ═══════════════════════════════════════════════════════════════════════════════

describe("aucune entrée ne fait échouer la décision", () => {
  it("rend une liste vide, jamais une erreur, quand il n'y a rien à faire", () => {
    for (const cas of [
      entree({ candidats: [] }),
      entree({ budget: 0 }),
      entree({ candidats: [lead({ sujets: [] }), recherche({ sujets: [] })] }),
    ]) {
      const resultat = prioriserLesTravaux(cas);
      expect(resultat.sujets).toEqual([]);
      expect(raconterLaPriorisation(resultat.justification)).toBe("Aucun travail ouvert.");
    }
  });

  it("ignore une phrase de priorité qu'il ne sait pas relire, sans rien casser", () => {
    // Une configuration ancienne peut porter une formulation reformulée depuis. Le travail
    // retombe au poids plancher — il ne disparaît pas, et rien ne lève.
    const resultat = prioriserLesTravaux(
      entree({ priorites: ["une phrase que personne ne reconnaît"] }),
    );

    expect(resultat.sujets.length).toBeGreaterThan(0);
    for (const part of resultat.justification.parts) {
      expect(part.rang).toBeNull();
    }
  });

  it("conserve l'ordre interne du gisement à l'intérieur d'une même nature", () => {
    // Le classement intra-travail reste celui du gisement (le plus ancien d'abord) : ce module
    // décide entre les natures, jamais entre deux prospects.
    const resultat = prioriserLesTravaux(
      entree({ priorites: [PHRASE_EVALUATION], budget: 3, candidats: [lead()] }),
    );

    expect(resultat.sujets.map((s) => s.id)).toEqual(["lead-0", "lead-1", "lead-2"]);
  });
});
