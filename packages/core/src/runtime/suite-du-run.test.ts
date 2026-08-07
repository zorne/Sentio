import { REGLAGES_RUNTIME_PAR_DEFAUT, type ReglagesRuntime } from "@sentio/config";
import { describe, expect, it } from "vitest";

import { NonCompliantRouting, TaskDeferred } from "../errors.js";
import type { EtatRun } from "../journal/run-state.js";
import { ATTENTION_REQUISE, PAS_REPORTE, RUN_ECHOUE, RUN_REPORTE, RUN_TERMINE } from "../journal/vocabulaire.js";
import type { ResultatExecution } from "./execute-action.js";
import type { ActionProposee, DecisionPas } from "./next-action.js";
import {
  deciderLaSuite,
  exigeUnHumain,
  issueDepuisErreur,
  type IssueDuPas,
  type SuiteDuRun,
} from "./suite-du-run.js";

const MAINTENANT = new Date("2026-08-07T09:00:00.000Z");
const HEURE = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const PROPOSITION: ActionProposee = {
  kind: "action",
  capabilityKey: "prospects.envoyer_message",
  input: { leadId: "lead-1" },
  rationale: "Julie correspond à la cible déclarée.",
};

function etat(pasDuCycle: number): EtatRun {
  return {
    phase: "en_cours",
    actionsExecutees: pasDuCycle,
    pasDuCycle,
    reprendreApres: pasDuCycle,
    actionEnAttente: null,
    effetsDejaProduits: new Set(),
    effetsEngagesSansResultat: new Set(),
  };
}

function suite(
  issue: IssueDuPas,
  options: { pasDuCycle?: number; reglages?: ReglagesRuntime } = {},
): SuiteDuRun {
  return deciderLaSuite({
    issue,
    etat: etat(options.pasDuCycle ?? 1),
    reglages: options.reglages ?? REGLAGES_RUNTIME_PAR_DEFAUT,
    maintenant: MAINTENANT,
  });
}

/** Un pas qui a décidé, et — quand la décision l'autorisait — exécuté. */
function apres(decision: DecisionPas, execution: ResultatExecution | null = null): IssueDuPas {
  return { kind: "decision", decision, execution };
}

const AGIR: DecisionPas = {
  kind: "agir",
  proposition: PROPOSITION,
  decision: { outcome: "allow", notify: false, basis: "accord_permanent" },
};

describe("le travail avance", () => {
  it("enchaîne sur le pas suivant après une action réussie", () => {
    const resultat = suite(apres(AGIR, { kind: "execute", resultat: { envoye: true }, cle: "mail:1" }));

    expect(resultat.kind).toBe("poursuivre");
    if (resultat.kind !== "poursuivre") return;
    // Dû tout de suite : le battement suivant le reprend, il n'attend pas une échéance.
    expect(resultat.quand).toEqual(MAINTENANT);
    expect(resultat.pasRestants).toBe(9);
    // Aucun événement de journal : le pas a déjà écrit le sien. En ajouter un dirait deux fois
    // la même chose, et ferait grossir un journal borné à 30 jours.
    expect(resultat.nature).toBeNull();
  });

  it("enchaîne aussi quand l'effet avait déjà eu lieu — rien de nouveau, mais rien de perdu", () => {
    const resultat = suite(apres(AGIR, { kind: "deja_fait", resultat: {}, cle: "mail:1" }));
    expect(resultat.kind).toBe("poursuivre");
  });

  it("n'arrête pas le run sur un refus de politique ni sur une réponse illisible", () => {
    // Le pas suivant peut proposer autre chose. Ce qui empêche la boucle n'est pas un compteur de
    // plus : c'est le budget de pas, vérifié plus bas.
    expect(suite(apres({ kind: "refuse", raison: "hors périmètre" })).kind).toBe("poursuivre");
    expect(
      suite(apres({ kind: "proposition_illisible", refus: "json_illisible", detail: "…" })).kind,
    ).toBe("poursuivre");
  });
});

describe("le budget de pas d'un cycle", () => {
  it("referme proprement le cycle au dixième pas, et le reporte à la cadence", () => {
    const resultat = suite(
      apres(AGIR, { kind: "execute", resultat: {}, cle: "mail:1" }),
      { pasDuCycle: 10 },
    );

    expect(resultat.kind).toBe("reporter");
    if (resultat.kind !== "reporter") return;
    expect(resultat.motif).toBe("budget_epuise");
    // La reprise est à la cadence — 24 h —, pas « dès que possible ».
    expect(resultat.quand.getTime() - MAINTENANT.getTime()).toBe(24 * HEURE);
    // `run_reporte` et non `run_termine` : le travail n'est pas fini, il est suspendu au
    // lendemain. Écrire une fin ferait croire à un objectif atteint.
    expect(resultat.nature).toBe(RUN_REPORTE);
  });

  it("prend sa borne dans la configuration, jamais dans une constante du code", () => {
    // C'est toute la raison d'être de `ReglagesRuntime` : faire évoluer la valeur ne doit
    // demander aucune modification de ce module.
    const troisPas: ReglagesRuntime = { ...REGLAGES_RUNTIME_PAR_DEFAUT, pasMaximumParRun: 3 };

    expect(
      suite(apres(AGIR, { kind: "execute", resultat: {}, cle: "m" }), {
        pasDuCycle: 2,
        reglages: troisPas,
      }).kind,
    ).toBe("poursuivre");

    expect(
      suite(apres(AGIR, { kind: "execute", resultat: {}, cle: "m" }), {
        pasDuCycle: 3,
        reglages: troisPas,
      }).kind,
    ).toBe("reporter");
  });

  it("le budget prime sur une nouvelle tentative", () => {
    // Réveiller le worker dans un quart d'heure pour un pas qui n'a plus le droit de s'exécuter
    // aujourd'hui ne servirait à rien.
    const resultat = suite(
      apres(AGIR, { kind: "echec_transitoire", detail: "503", tentatives: 1 }),
      { pasDuCycle: 10 },
    );

    expect(resultat.kind).toBe("reporter");
    if (resultat.kind !== "reporter") return;
    expect(resultat.motif).toBe("budget_epuise");
  });

  it("ne s'applique ni à une fin, ni à un arrêt qui attend un humain", () => {
    // Un run qui attend un accord ne doit surtout pas recevoir d'échéance : il repartirait sans
    // que le client ait répondu.
    const fin = suite(apres({ kind: "termine", raison: "plus de prospects" }), { pasDuCycle: 10 });
    expect(fin.kind).toBe("terminer");

    const accord = suite(
      apres({
        kind: "suspendu",
        proposition: PROPOSITION,
        decision: { outcome: "suspend", approvalId: "a-1", clientMessage: "…" },
      }),
      { pasDuCycle: 10 },
    );
    expect(accord.kind).toBe("attendre_humain");
  });
});

describe("le run s'arrête", () => {
  it("termine normalement quand le modèle juge le travail fini", () => {
    const resultat = suite(apres({ kind: "termine", raison: "objectif du jour atteint" }));

    expect(resultat.kind).toBe("terminer");
    if (resultat.kind !== "terminer") return;
    expect(resultat.issue).toBe("termine");
    expect(resultat.nature).toBe(RUN_TERMINE);
    expect(resultat.detail).toBe("objectif du jour atteint");
  });

  it("échoue, et le dit, sur un échec définitif", () => {
    const resultat = suite(apres(AGIR, { kind: "echec_definitif", detail: "domaine suspendu" }));

    expect(resultat.kind).toBe("terminer");
    if (resultat.kind !== "terminer") return;
    expect(resultat.issue).toBe("echoue");
    expect(resultat.nature).toBe(RUN_ECHOUE);
  });

  it("retente un pas après un échec passager, sans rouvrir le budget du cycle", () => {
    const resultat = suite(apres(AGIR, { kind: "echec_transitoire", detail: "503", tentatives: 1 }));

    expect(resultat.kind).toBe("reporter");
    if (resultat.kind !== "reporter") return;
    expect(resultat.motif).toBe("nouvelle_tentative");
    expect(resultat.quand.getTime() - MAINTENANT.getTime()).toBe(15 * MINUTE);
    // `pas_reporte`, pas `run_reporte` : sinon une panne qui se répète remettrait le compteur à
    // zéro à chaque tentative, et l'employé tournerait sans borne dans la même journée.
    expect(resultat.nature).toBe(PAS_REPORTE);
  });

  it("traite un pas incohérent — autorisé mais jamais exécuté — comme un échec, pas comme un succès", () => {
    const resultat = suite(apres(AGIR, null));

    expect(resultat.kind).toBe("terminer");
    if (resultat.kind !== "terminer") return;
    expect(resultat.issue).toBe("echoue");
  });
});

describe("un plafond atteint reporte le travail — il ne le fait pas disparaître", () => {
  // ⚠️ Ce cas manquait, et il rendait NOYAU-07 faux de bout en bout : le Gateway reportait
  // proprement, EXEC-04 laissait remonter l'erreur, et personne ne la rattrapait — le travail
  // restait verrouillé dans la file au lieu d'être reporté.
  const REPORT: IssueDuPas = {
    kind: "report_de_quota",
    clientMessage: "Le travail de votre employé reprendra très vite.",
    detail: "Plafond inference_tokens_per_day atteint pour l'entreprise (66000/66000).",
  };

  it("reporte à la cadence, et pas dans un quart d'heure", () => {
    // Les trois plafonds qui produisent ce report se rouvrent au jour ou au mois, jamais à la
    // minute : réessayer plus tôt réveillerait le worker pour se faire refuser à l'identique.
    const resultat = suite(REPORT);

    expect(resultat.kind).toBe("reporter");
    if (resultat.kind !== "reporter") return;
    expect(resultat.motif).toBe("report_de_quota");
    expect(resultat.quand.getTime() - MAINTENANT.getTime()).toBe(24 * HEURE);
    expect(resultat.nature).toBe(RUN_REPORTE);
  });

  it("ne dérange personne : un plafond se rouvre tout seul", () => {
    expect(exigeUnHumain(suite(REPORT))).toBe(false);
  });

  it("garde le message du client sans l'inventer", () => {
    const resultat = suite(REPORT);
    if (resultat.kind !== "reporter") throw new Error("attendu un report");
    expect(resultat.messageClient).toBe(REPORT.clientMessage);
  });

  it("ne se confond pas avec le budget de pas, même quand les deux sont atteints", () => {
    // Même échéance, motif différent. Les confondre effacerait du journal la raison réelle.
    const resultat = suite(REPORT, { pasDuCycle: 10 });
    if (resultat.kind !== "reporter") throw new Error("attendu un report");
    expect(resultat.motif).toBe("report_de_quota");
  });

  it("ne traduit QUE le report de quota — tout le reste doit être relancé", () => {
    const report = issueDepuisErreur(new TaskDeferred("message client", "plafond atteint"));
    expect(report).toEqual({
      kind: "report_de_quota",
      clientMessage: "message client",
      detail: "plafond atteint",
    });

    // Avaler ces erreurs-là transformerait un bug en « le modèle n'a rien proposé ».
    expect(issueDepuisErreur(new NonCompliantRouting("donnée réelle vers un non conforme"))).toBeNull();
    expect(issueDepuisErreur(new Error("panne"))).toBeNull();
    expect(issueDepuisErreur("pas une erreur")).toBeNull();
  });
});

describe("le run attend une personne", () => {
  it("attend un accord sans écrire d'événement : la suspension est déjà au journal", () => {
    const resultat = suite(
      apres({
        kind: "suspendu",
        proposition: PROPOSITION,
        decision: { outcome: "suspend", approvalId: "a-1", clientMessage: "…" },
      }),
    );

    expect(resultat.kind).toBe("attendre_humain");
    if (resultat.kind !== "attendre_humain") return;
    expect(resultat.motif).toBe("accord_attendu");
    // ⚠️ Écrire `attention_requise` par-dessus `politique_suspend` ferait perdre à l'état sa
    // lisibilité : la reprise après accord (EXEC-11) ne saurait plus quoi rouvrir.
    expect(resultat.nature).toBeNull();
  });

  it("arrête le run quand un effet irréversible a été engagé sans issue connue", () => {
    const resultat = suite(
      apres(AGIR, {
        kind: "verification_humaine_requise",
        cle: "mail:1",
        detail: "issue inconnue",
      }),
    );

    expect(resultat.kind).toBe("attendre_humain");
    if (resultat.kind !== "attendre_humain") return;
    expect(resultat.motif).toBe("verification_humaine");
    expect(resultat.nature).toBe(ATTENTION_REQUISE);
  });

  it("arrête le run sur un contexte incomplet : réessayer demain n'y changerait rien", () => {
    const resultat = suite({ kind: "contexte_incomplet", detail: "objectif absent" });

    expect(resultat.kind).toBe("attendre_humain");
    if (resultat.kind !== "attendre_humain") return;
    expect(resultat.motif).toBe("contexte_incomplet");
    expect(resultat.nature).toBe(ATTENTION_REQUISE);
  });

  it("n'est le cas que des arrêts qui attendent quelqu'un — la lecture d'EXEC-14", () => {
    // La décision produit : on ne notifie pas après chaque run, on notifie quand l'employé est
    // bloqué. `exigeUnHumain` est le seul endroit qui répond à cette question.
    expect(exigeUnHumain(suite({ kind: "contexte_incomplet", detail: "…" }))).toBe(true);
    expect(exigeUnHumain(suite(apres({ kind: "termine", raison: "fini" })))).toBe(false);
    expect(
      exigeUnHumain(suite(apres(AGIR, { kind: "execute", resultat: {}, cle: "m" }))),
    ).toBe(false);
    expect(
      exigeUnHumain(
        suite(apres(AGIR, { kind: "execute", resultat: {}, cle: "m" }), { pasDuCycle: 10 }),
      ),
    ).toBe(false);
  });
});

describe("la fonction est pure", () => {
  it("rend deux fois exactement la même chose sur la même entrée", () => {
    const issue = apres(AGIR, { kind: "execute", resultat: {}, cle: "mail:1" });
    expect(suite(issue)).toEqual(suite(issue));
  });

  it("ne lit jamais l'horloge : toutes les échéances partent de `maintenant`", () => {
    const ailleurs = new Date("2030-01-01T00:00:00.000Z");
    const resultat = deciderLaSuite({
      issue: apres(AGIR, { kind: "execute", resultat: {}, cle: "m" }),
      etat: etat(10),
      reglages: REGLAGES_RUNTIME_PAR_DEFAUT,
      maintenant: ailleurs,
    });

    expect(resultat.kind).toBe("reporter");
    if (resultat.kind !== "reporter") return;
    expect(resultat.quand).toEqual(new Date(ailleurs.getTime() + 24 * HEURE));
  });
});
