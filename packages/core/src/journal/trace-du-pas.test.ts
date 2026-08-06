import { describe, expect, it } from "vitest";

import { expliquerLePas, raconterLePas } from "./trace-du-pas.js";
import type { JournalEntry } from "./trace.js";
import {
  ACCORD_ACCORDE,
  ACTION_ECHOUEE,
  ACTION_ENGAGEE,
  ACTION_EXECUTEE,
  CONTEXTE_ASSEMBLE,
} from "./vocabulaire.js";

/**
 * EXEC-07 — « pourquoi mon employé a-t-il fait ça ? »
 *
 * Les identifiants sont volontairement à CONTRE-SENS des rangs, comme ailleurs : un tri qui
 * retomberait sur `id` inverserait la chaîne et raconterait l'histoire à l'envers.
 */

const MEME_INSTANT = new Date("2026-08-06T10:00:00.000Z");

function evenement(seq: number, kind: string, payload: unknown = {}): JournalEntry {
  return {
    id: `evt-${String(1_000_000 - seq).padStart(7, "0")}`,
    seq,
    kind,
    payload,
    idempotencyKey: null,
    createdAt: MEME_INSTANT,
  };
}

const CHAINE_COMPLETE = [
  evenement(10, CONTEXTE_ASSEMBLE, {
    couchesAbsentes: ["secteur"],
    objectif: "rendez_vous_qualifies — cible 10 (ce mois)",
    faitsRetenus: 2,
    faitsEcartes: [{ factId: "f-9", reason: "heurte une limite de l'ADN : « comptabilité »" }],
  }),
  evenement(11, "proposition_recue", {
    fournisseur: "gemini",
    jetons: 340,
    proposition: {
      kind: "action",
      capabilityKey: "envoyer_message",
      rationale: "Julie correspond à la cible déclarée, et n'a jamais été contactée.",
    },
  }),
  evenement(12, "politique_allow", {
    capacite: "envoyer_message",
    classe_effet: "external_irreversible",
    autonomie: "confirm_once",
    fondement: "accord_permanent",
  }),
  evenement(13, ACTION_ENGAGEE, { capacite: "envoyer_message" }),
  evenement(14, ACTION_EXECUTEE, { cle: "envoyer_message:abc", resultat: { messageId: "m-1" } }),
];

describe("la chaîne se reconstitue depuis le journal, jamais après coup", () => {
  it("rend les cinq maillons, dans l'ordre du raisonnement", () => {
    const trace = expliquerLePas(CHAINE_COMPLETE);

    expect(trace.maillons.map((m) => m.etape)).toEqual([
      "contexte",
      "proposition",
      "politique",
      "engagement",
      "resultat",
    ]);
    expect(trace.complete).toBe(true);
    expect(trace.manquants).toEqual([]);
  });

  it("ordonne sur le rang même quand l'identifiant dit l'inverse", () => {
    const ids = CHAINE_COMPLETE.map((e) => e.id);
    expect([...ids].sort()).toEqual([...ids].reverse());

    const desordre = [...CHAINE_COMPLETE].reverse();
    expect(expliquerLePas(desordre).maillons.map((m) => m.etape)).toEqual(
      expliquerLePas(CHAINE_COMPLETE).maillons.map((m) => m.etape),
    );
  });

  it("ignore ce qui n'appartient pas à la chaîne, sans le confondre avec un trou", () => {
    const avecBruit = [...CHAINE_COMPLETE, evenement(15, "routage_refuse", { skipped: [] })];
    expect(expliquerLePas(avecBruit).maillons).toHaveLength(5);
    expect(expliquerLePas(avecBruit).complete).toBe(true);
  });
});

describe("une chaîne incomplète se dit, elle ne se comble pas", () => {
  it("nomme le maillon manquant quand le contexte n'a pas été journalisé", () => {
    const sansContexte = CHAINE_COMPLETE.slice(1);
    const trace = expliquerLePas(sansContexte);

    expect(trace.manquants).toContain("contexte");
    expect(trace.complete).toBe(false);
  });

  it("nomme le maillon manquant quand la politique n'a pas tranché", () => {
    const trace = expliquerLePas([CHAINE_COMPLETE[0]!, CHAINE_COMPLETE[1]!]);
    expect(trace.manquants).toContain("politique");
    expect(trace.complete).toBe(false);
  });

  // Un refus N'EST PAS suivi d'un effet, et c'est la preuve que la règle a tenu — pas un trou.
  it("considère complète une chaîne où la politique a refusé", () => {
    const trace = expliquerLePas([
      CHAINE_COMPLETE[0]!,
      CHAINE_COMPLETE[1]!,
      evenement(12, "politique_refuse", { capacite: "faire_la_compta" }),
    ]);

    expect(trace.manquants).toEqual([]);
    expect(trace.complete).toBe(true);
  });

  it("considère complète une chaîne suspendue en attente d'accord", () => {
    const trace = expliquerLePas([
      CHAINE_COMPLETE[0]!,
      CHAINE_COMPLETE[1]!,
      evenement(12, "politique_suspend", { capacite: "envoyer_message" }),
    ]);
    expect(trace.complete).toBe(true);
  });

  // Autorisé mais sans issue : c'est le trou qui compte vraiment — un effet a pu partir sans
  // que rien ne le dise.
  it("refuse de déclarer complète une chaîne autorisée sans résultat ni échec", () => {
    const trace = expliquerLePas(CHAINE_COMPLETE.slice(0, 4));
    expect(trace.complete).toBe(false);
  });
});

describe("le récit répond en français, avec ce que le journal contient", () => {
  it("raconte le pas nominal du contexte jusqu'au résultat", () => {
    const recit = raconterLePas(expliquerLePas(CHAINE_COMPLETE)).join("\n");

    expect(recit).toContain("rendez_vous_qualifies");
    expect(recit).toContain("Julie correspond à la cible déclarée");
    expect(recit).toContain("envoyer_message");
    expect(recit).toContain("une fois pour toutes");
    expect(recit).toContain("jamais agir deux fois");
  });

  it("dit ce dont l'employé ne disposait pas", () => {
    const recit = raconterLePas(expliquerLePas(CHAINE_COMPLETE)).join("\n");
    expect(recit).toContain("Il ne disposait pas de : secteur");
  });

  it("dit qu'un fait appris a été écarté, sans le recopier", () => {
    const recit = raconterLePas(expliquerLePas(CHAINE_COMPLETE)).join("\n");
    expect(recit).toContain("écartées");
    // Le contenu du fait n'a pas à sortir dans un récit destiné au client.
    expect(recit).not.toContain("f-9");
  });

  it("distingue une autorisation permanente d'une action sans effet extérieur", () => {
    const sansEffet = raconterLePas(
      expliquerLePas([
        CHAINE_COMPLETE[0]!,
        CHAINE_COMPLETE[1]!,
        evenement(12, "politique_allow", {
          capacite: "lire_prospects",
          fondement: "sans_effet_exterieur",
        }),
      ]),
    ).join("\n");

    expect(sansEffet).toContain("ne sort pas de votre entreprise");
    expect(sansEffet).not.toContain("une fois pour toutes");
  });

  it("dit un refus comme un refus", () => {
    const recit = raconterLePas(
      expliquerLePas([
        CHAINE_COMPLETE[0]!,
        CHAINE_COMPLETE[1]!,
        evenement(12, "politique_refuse", { capacite: "faire_la_compta" }),
      ]),
    ).join("\n");

    expect(recit).toContain("hors de ce que fait ce métier");
  });

  it("distingue un échec passager d'un échec définitif", () => {
    const passager = raconterLePas(
      expliquerLePas([...CHAINE_COMPLETE.slice(0, 4), evenement(14, ACTION_ECHOUEE, { definitif: false })]),
    ).join("\n");
    const definitif = raconterLePas(
      expliquerLePas([...CHAINE_COMPLETE.slice(0, 4), evenement(14, ACTION_ECHOUEE, { definitif: true })]),
    ).join("\n");

    expect(passager).toContain("retentée");
    expect(definitif).toContain("n'a pas été retentée");
  });

  it("dit la validation humaine quand elle a eu lieu", () => {
    const recit = raconterLePas(
      expliquerLePas([
        CHAINE_COMPLETE[0]!,
        CHAINE_COMPLETE[1]!,
        evenement(12, "politique_suspend", { capacite: "envoyer_message" }),
        evenement(13, ACCORD_ACCORDE),
      ]),
    ).join("\n");

    expect(recit).toContain("demandé votre accord");
    expect(recit).toContain("Vous avez donné votre accord");
  });

  it("annonce une chaîne incomplète au lieu de raconter une histoire lisse", () => {
    const recit = raconterLePas(expliquerLePas(CHAINE_COMPLETE.slice(1))).join("\n");
    expect(recit).toContain("Chaîne incomplète");
    expect(recit).toContain("contexte");
  });

  it("ne prétend rien quand le modèle n'a pas su répondre", () => {
    const recit = raconterLePas(
      expliquerLePas([
        CHAINE_COMPLETE[0]!,
        evenement(11, "proposition_illisible", { refus: "json_illisible" }),
      ]),
    ).join("\n");

    expect(recit).toContain("rien n'a été tenté");
  });
});

describe("le vocabulaire du produit est respecté", () => {
  it("ne dit jamais « IA », « modèle », « bot » ni « prompt » au client", () => {
    const tous = [
      raconterLePas(expliquerLePas(CHAINE_COMPLETE)),
      raconterLePas(expliquerLePas(CHAINE_COMPLETE.slice(0, 3))),
      raconterLePas(
        expliquerLePas([
          CHAINE_COMPLETE[0]!,
          evenement(11, "proposition_illisible", { refus: "json_illisible" }),
        ]),
      ),
    ]
      .flat()
      .join("\n")
      .toLowerCase();

    for (const interdit of [" ia ", "modèle", "bot", "prompt", "gpt", "assistant", "automation"]) {
      expect(tous).not.toContain(interdit);
    }
  });
});
