import { describe, expect, it } from "vitest";

import { jugerLeBattement, type EntreeDuVerdict } from "./verdict.js";

/**
 * La règle qui distingue un silence légitime d'une panne.
 *
 * ══ POURQUOI CES CAS SONT LE CŒUR DU LOT ══
 *
 * Deux erreurs symétriques, et la seconde est la plus grave :
 *
 *   · **trop bavard** — signaler une période creuse légitime apprend au dirigeant à ignorer le
 *     canal. C'est la leçon écrite dans `prospect-cron.yml` : « le vrai coût n'était pas le bruit,
 *     c'était l'accoutumance » ;
 *   · **trop muet** — laisser passer un battement où rien n'aboutit, c'est produire un rapport
 *     rassurant et faux toutes les dix minutes.
 *
 * Chaque cas ci-dessous garde l'un ou l'autre bord.
 */

function battement(modifications: Partial<EntreeDuVerdict> = {}): EntreeDuVerdict {
  return {
    approvisionnement: { ouvertes: 0, refus: {} },
    reprise: { reprises: 0 },
    travaux: { traites: 0, echoues: 0, motifs: {}, sansAction: 0 },
    capacitesEcartees: [],
    compteur: { aNotreCharge: 0 },
    ...modifications,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ce qui est NORMAL — et doit le rester, sous peine d'accoutumance
// ═══════════════════════════════════════════════════════════════════════════════

describe("les silences légitimes ne déclenchent rien", () => {
  it("⭐ un battement où il n'y avait rien à faire est NORMAL", () => {
    // Le cas le plus fréquent de tous : 143 des 144 battements quotidiens.
    const jugement = jugerLeBattement(battement());
    expect(jugement.verdict).toBe("normal");
    expect(jugement.duTravailEtaitDu).toBe(false);
  });

  it("⭐ aucun refus METIER ne rend un battement anormal", () => {
    // ⚠️ Ce sont des silences que le produit PRODUIT. Une entreprise sans abonnement, un objectif
    // atteint, un quota consommé : le signaler serait dire « panne » là où le système fait
    // exactement ce qu'on lui demande.
    for (const raison of [
      "pas_d_abonnement_actif",
      "aucun_objectif",
      "objectif_atteint",
      "objectif_retire",
      "quota_de_periode_atteint",
      "aucun_sujet_eligible",
      "deja_approvisionne_aujourdhui",
    ]) {
      const jugement = jugerLeBattement(
        battement({ approvisionnement: { ouvertes: 0, refus: { [raison]: 3 } } }),
      );
      expect(jugement.verdict, `« ${raison} » ne doit pas alerter`).toBe("normal");
    }
  });

  it("du travail qui aboutit est normal, quel que soit le motif d'aboutissement", () => {
    for (const motif of ["pas_suivant", "travail_acheve", "budget_epuise", "accord_attendu"]) {
      const jugement = jugerLeBattement(
        battement({
          approvisionnement: { ouvertes: 2, refus: {} },
          travaux: { traites: 2, echoues: 0, motifs: { [motif]: 2 }, sansAction: 0 },
        }),
      );
      expect(jugement.verdict, `« ${motif} » est un aboutissement`).toBe("normal");
    }
  });

  it("une demande d'accord n'est PAS une panne — la mission a avancé jusqu'au client", () => {
    const jugement = jugerLeBattement(
      battement({
        approvisionnement: { ouvertes: 1, refus: {} },
        travaux: { traites: 1, echoues: 0, motifs: { accord_attendu: 1 }, sansAction: 0 },
      }),
    );
    expect(jugement.verdict).toBe("normal");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Ce qui est ANORMAL — le cas 6 en tête
// ═══════════════════════════════════════════════════════════════════════════════

describe("ce qui ne peut pas passer pour un succès", () => {
  it("⭐⭐ dix missions traitées mais toutes REPORTÉES est anormal", () => {
    // ⚠️ LE CAS QUI MOTIVE TOUT CE MODULE, ET L'ÉTAT EXACT DE LA PRODUCTION AUJOURD'HUI.
    //
    // Tant que l'opt-out d'entraînement n'est pas prouvé, le Gateway refuse tout fournisseur pour
    // une donnée réelle : chaque run atteint le modèle, est reporté, et `traites` s'incrémente —
    // il ne comptait que « aucune exception n'a été levée ». Le compte rendu aurait annoncé
    // `{traites:10, echoues:0}` toutes les dix minutes pendant que rien ne se faisait.
    const jugement = jugerLeBattement(
      battement({
        approvisionnement: { ouvertes: 10, refus: {} },
        travaux: { traites: 10, echoues: 0, motifs: { report_de_quota: 10 }, sansAction: 0 },
      }),
    );

    expect(jugement.verdict).toBe("anormal");
    expect(jugement.anomalies).toContain("rien_n_a_abouti");
  });

  it("⭐ des missions toutes arrêtées faute d'outil est anormal", () => {
    const jugement = jugerLeBattement(
      battement({
        approvisionnement: { ouvertes: 4, refus: {} },
        travaux: { traites: 4, echoues: 0, motifs: { capacite_absente: 4 }, sansAction: 0 },
      }),
    );
    expect(jugement.verdict).toBe("anormal");
    expect(jugement.anomalies).toContain("rien_n_a_abouti");
  });

  it("un travail échoué est anormal", () => {
    const jugement = jugerLeBattement(
      battement({ travaux: { traites: 0, echoues: 1, motifs: {}, sansAction: 0 } }),
    );
    expect(jugement.verdict).toBe("anormal");
    expect(jugement.anomalies).toContain("travaux_echoues");
  });

  it("⭐ les refus d'approvisionnement ANORMAUX alertent, eux", () => {
    // ⚠️ Le miroir exact de ce que `planifierLApprovisionnement` refuse d'inscrire comme lot du
    // jour : les inscrire « les tairait jusqu'au lendemain, c'est-à-dire exactement le temps qu'il
    // faut pour ne pas les voir ». Même raisonnement, appliqué à l'alerte.
    for (const raison of ["employe_inconnu", "verdict_inconnu", "gisement_inconnu", "erreur"]) {
      const jugement = jugerLeBattement(
        battement({ approvisionnement: { ouvertes: 0, refus: { [raison]: 1 } } }),
      );
      expect(jugement.verdict, `« ${raison} » doit alerter`).toBe("anormal");
      expect(jugement.anomalies).toContain(`approvisionnement_${raison}`);
    }
  });

  it("un contrat de capacité illisible en base est anormal", () => {
    const jugement = jugerLeBattement(battement({ capacitesEcartees: ["envoyer.prospect"] }));
    expect(jugement.verdict).toBe("anormal");
    expect(jugement.anomalies).toContain("contrat_de_capacite_illisible");
  });

  it("nomme TOUTES les anomalies, pas seulement la première", () => {
    // Corriger une panne, redéployer, et découvrir la suivante : c'est ce que ce module évite,
    // exactement comme `lireLaConfiguration` rend tous les manquements d'un coup.
    const jugement = jugerLeBattement(
      battement({
        approvisionnement: { ouvertes: 1, refus: { employe_inconnu: 1 } },
        travaux: { traites: 0, echoues: 2, motifs: {}, sansAction: 0 },
        capacitesEcartees: ["x"],
      }),
    );
    expect(jugement.anomalies).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// La règle du compteur — « du travail était-il dû ? »
// ═══════════════════════════════════════════════════════════════════════════════

describe("une entreprise bloquée au milieu de dix qui travaillent", () => {
  it("⭐ un blocage de NOTRE ressort rend le battement anormal, même si d'autres ont abouti", () => {
    // ⚠️ LE CAS QUE LES COMPTEURS DU BATTEMENT NE PEUVENT PAS VOIR. Dix entreprises travaillent,
    // la onzième est arrêtée parce qu'un moteur n'est pas monté chez nous : « quelque chose a
    // abouti » est vrai, donc `rien_n_a_abouti` se tait. Sans ce contrôle, ce client attendrait
    // sans que rien ne le signale.
    const jugement = jugerLeBattement(
      battement({
        travaux: { traites: 11, echoues: 0, motifs: { travail_acheve: 10, capacite_absente: 1 }, sansAction: 0 },
        compteur: { aNotreCharge: 1 },
      }),
    );

    expect(jugement.verdict).toBe("anormal");
    expect(jugement.anomalies).toContain("travail_bloque_chez_nous");
  });

  it("un blocage que le DIRIGEANT peut lever ne nous alerte pas : il a été prévenu", () => {
    // La notification est partie chez lui. La compter aussi comme notre anomalie ferait sonner
    // notre propre canal pour un outil que nous n'avons pas à activer à sa place.
    const jugement = jugerLeBattement(
      battement({
        travaux: { traites: 11, echoues: 0, motifs: { travail_acheve: 10, capacite_absente: 1 }, sansAction: 0 },
        compteur: { aNotreCharge: 0 },
      }),
    );

    expect(jugement.verdict).toBe("normal");
  });
});

describe("un run qui a payé sans rien produire", () => {
  it("⭐ dix pas, aucune action : ANORMAL, quels que soient les motifs", () => {
    // ⚠️ LE CAS 4b DE LA RÉPÉTITION GÉNÉRALE. Un fournisseur qui répond 200 avec un contenu vide
    // fait tourner l'employée sur tout son budget : `{pas_suivant: 9, budget_epuise: 1}`. Les deux
    // motifs veulent dire « le travail avance », et ils ne mentent pas — des pas ont bien eu lieu.
    // C'est le RÉSULTAT qui manque, et aucun motif ne le dit.
    const jugement = jugerLeBattement(
      battement({
        travaux: {
          traites: 1,
          echoues: 0,
          motifs: { pas_suivant: 9, budget_epuise: 1 },
          sansAction: 1,
        },
      }),
    );

    expect(jugement.verdict).toBe("anormal");
    expect(jugement.anomalies).toContain("run_sans_action");
  });

  it("un budget épuisé APRÈS avoir agi reste normal", () => {
    // Un run qui a fait dix vraies actions et manque de budget n'est pas en panne : il a travaillé
    // et il reprendra demain. Le signaler apprendrait à ignorer le canal.
    const jugement = jugerLeBattement(
      battement({
        travaux: { traites: 1, echoues: 0, motifs: { budget_epuise: 1 }, sansAction: 0 },
      }),
    );

    expect(jugement.verdict).toBe("normal");
  });
});

describe("du travail était-il réellement dû", () => {
  it("⭐ non quand rien n'a été ouvert, repris, ni pris", () => {
    // C'est la condition qui empêche une période creuse d'alimenter le compteur de silence. Sans
    // elle, un client sans abonnement ferait sonner l'alerte tous les jours.
    expect(jugerLeBattement(battement()).duTravailEtaitDu).toBe(false);
    expect(
      jugerLeBattement(battement({ approvisionnement: { ouvertes: 0, refus: { objectif_atteint: 1 } } }))
        .duTravailEtaitDu,
    ).toBe(false);
  });

  it("oui dès qu'une mission est ouverte, reprise, ou prise dans la file", () => {
    expect(
      jugerLeBattement(battement({ approvisionnement: { ouvertes: 1, refus: {} } })).duTravailEtaitDu,
    ).toBe(true);
    expect(jugerLeBattement(battement({ reprise: { reprises: 1 } })).duTravailEtaitDu).toBe(true);
    expect(
      jugerLeBattement(battement({ travaux: { traites: 1, echoues: 0, motifs: { pas_suivant: 1 }, sansAction: 0 } }))
        .duTravailEtaitDu,
    ).toBe(true);
  });
});

describe("le jugement est reproductible", () => {
  it("mêmes chiffres, même verdict — à chaque appel", () => {
    const entree = battement({
      approvisionnement: { ouvertes: 3, refus: { aucun_sujet_eligible: 1 } },
      travaux: { traites: 3, echoues: 0, motifs: { report_de_quota: 3 }, sansAction: 0 },
    });
    const premier = jugerLeBattement(entree);
    for (let i = 0; i < 20; i += 1) expect(jugerLeBattement(entree)).toEqual(premier);
  });
});
