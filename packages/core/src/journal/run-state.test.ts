import { describe, expect, it } from "vitest";

import {
  ACCORD_ACCORDE,
  ACCORD_REFUSE,
  ACTION_DECIDEE,
  ACTION_EXECUTEE,
  ATTENTION_REQUISE,
  CONTEXTE_ASSEMBLE,
  PAS_REPORTE,
  POLITIQUE_SUSPEND,
  RUN_DEMARRE,
  RUN_ECHOUE,
  RUN_REPORTE,
  RUN_TERMINE,
} from "./vocabulaire.js";
import { peutReprendre, reconstruireEtatRun, type Anomalie, type EtatRun } from "./run-state.js";
import type { JournalEntry } from "./trace.js";

/** Un horodatage IDENTIQUE pour tous : c'est la réalité de la base (`now()` = début de
 *  transaction), et ça garantit qu'aucun test ne s'appuie par accident sur `createdAt`. */
const MEME_INSTANT = new Date("2026-08-06T10:00:00.000Z");

/**
 * ⚠️ L'identifiant est volontairement DÉCROISSANT quand le rang croît.
 *
 * Sans ça, ces tests ne prouvent rien : avec des identifiants du genre `evt-10`, `evt-11`,
 * `evt-12`, un tri fautif sur `(createdAt, id)` rendrait le MÊME ordre que le tri correct, et
 * passerait inaperçu. Vérifié en remettant l'ancien tri : la suite restait verte. Ici, tout tri
 * qui retomberait sur l'identifiant inverse l'ordre et fait échouer les tests.
 */
function evenement(seq: number, kind: string, options: { cle?: string; payload?: unknown } = {}): JournalEntry {
  return {
    id: `evt-${String(1_000_000 - seq).padStart(7, "0")}`,
    seq,
    kind,
    payload: options.payload ?? {},
    idempotencyKey: options.cle ?? null,
    createdAt: MEME_INSTANT,
  };
}

function etatDe(entrees: readonly JournalEntry[]): EtatRun {
  const resultat = reconstruireEtatRun(entrees);
  if (!resultat.ok) throw new Error(`attendu ok, reçu : ${JSON.stringify(resultat.anomalies)}`);
  return resultat.etat;
}

function anomaliesDe(entrees: readonly JournalEntry[]): readonly Anomalie[] {
  const resultat = reconstruireEtatRun(entrees);
  if (resultat.ok) throw new Error("attendu des anomalies, reçu un état");
  return resultat.anomalies;
}

const RUN_NOMINAL = [
  evenement(10, RUN_DEMARRE),
  evenement(11, ACTION_DECIDEE),
  evenement(12, ACTION_EXECUTEE, { cle: "mail:prospect-1" }),
];

describe("l'état métier d'un run, projeté depuis le journal", () => {
  it("part de rien : une tâche sans événement n'a pas commencé", () => {
    expect(etatDe([])).toEqual({
      phase: "jamais_demarre",
      actionsExecutees: 0,
      pasDuCycle: 0,
      reprendreApres: null,
      actionEnAttente: null,
      effetsDejaProduits: new Set(),
      effetsEngagesSansResultat: new Set(),
    });
  });

  it("suit un run nominal, et retient où reprendre", () => {
    const etat = etatDe(RUN_NOMINAL);
    expect(etat.phase).toBe("en_cours");
    expect(etat.actionsExecutees).toBe(1);
    expect(etat.reprendreApres).toBe(12);
    expect(etat.effetsDejaProduits.has("mail:prospect-1")).toBe(true);
  });

  it("passe en attente d'accord, et retient l'action suspendue", () => {
    const etat = etatDe([
      ...RUN_NOMINAL,
      evenement(13, POLITIQUE_SUSPEND, { payload: { outil: "mail.send", a: "julie@exemple.fr" } }),
    ]);
    expect(etat.phase).toBe("attente_accord");
    expect(etat.actionEnAttente).toEqual({ outil: "mail.send", a: "julie@exemple.fr" });
  });

  it("repart après un accord, et oublie l'action en attente", () => {
    const etat = etatDe([
      ...RUN_NOMINAL,
      evenement(13, POLITIQUE_SUSPEND, { payload: { outil: "mail.send" } }),
      evenement(14, ACCORD_ACCORDE),
    ]);
    expect(etat.phase).toBe("en_cours");
    expect(etat.actionEnAttente).toBeNull();
  });

  it("s'arrête sur un refus, sans exécuter l'action suspendue", () => {
    const etat = etatDe([
      ...RUN_NOMINAL,
      evenement(13, POLITIQUE_SUSPEND, { payload: { outil: "mail.send" } }),
      evenement(14, ACCORD_REFUSE),
    ]);
    expect(etat.phase).toBe("termine");
    expect(etat.actionsExecutees).toBe(1); // l'action refusée n'a jamais compté
  });

  it("distingue une fin normale d'un échec", () => {
    expect(etatDe([...RUN_NOMINAL, evenement(13, RUN_TERMINE)]).phase).toBe("termine");
    expect(etatDe([...RUN_NOMINAL, evenement(13, RUN_ECHOUE)]).phase).toBe("echoue");
  });

  it("ne laisse reprendre que ce qui peut l'être", () => {
    expect(peutReprendre(etatDe([]))).toBe(true);
    expect(peutReprendre(etatDe(RUN_NOMINAL))).toBe(true);
    expect(peutReprendre(etatDe([...RUN_NOMINAL, evenement(13, POLITIQUE_SUSPEND)]))).toBe(false);
    expect(peutReprendre(etatDe([...RUN_NOMINAL, evenement(13, RUN_TERMINE)]))).toBe(false);
    expect(peutReprendre(etatDe([...RUN_NOMINAL, evenement(13, RUN_ECHOUE)]))).toBe(false);
  });
});

describe("déterminisme — le même journal rend le même état, toujours", () => {
  it("ne dépend pas de l'ordre d'arrivée des lignes", () => {
    const desordre = [RUN_NOMINAL[2]!, RUN_NOMINAL[0]!, RUN_NOMINAL[1]!];
    expect(etatDe(desordre)).toEqual(etatDe(RUN_NOMINAL));
  });

  // Le défaut réel qu'EXEC-02 corrige : `created_at` est identique pour tout un pas de run.
  // Une reconstruction qui s'y fierait trierait au hasard.
  it("ne s'appuie jamais sur createdAt, identique pour tous les événements d'un même pas", () => {
    const horodatagesIdentiques = RUN_NOMINAL.every((e) => e.createdAt.getTime() === MEME_INSTANT.getTime());
    expect(horodatagesIdentiques).toBe(true);
    expect(etatDe(RUN_NOMINAL).reprendreApres).toBe(12);
  });

  // Le test qui tient vraiment le tri. Les identifiants contredisent les rangs : un tri qui
  // retomberait sur `id` — ce que faisait `reconstructTrace` avant EXEC-02 — lirait
  // « action exécutée » avant « run démarré », et rendrait donc une anomalie au lieu d'un état.
  it("ordonne sur le rang même quand l'identifiant dit l'inverse", () => {
    const ids = RUN_NOMINAL.map((e) => e.id);
    expect([...ids].sort()).toEqual([...ids].reverse()); // les ids sont bien à contre-sens

    const etat = etatDe(RUN_NOMINAL);
    expect(etat.phase).toBe("en_cours");
    expect(etat.reprendreApres).toBe(12);
  });

  it("rend un état identique sur dix relectures — aucune dépendance à un ordre d'itération", () => {
    const attendu = etatDe(RUN_NOMINAL);
    for (let i = 0; i < 10; i++) {
      expect(etatDe([...RUN_NOMINAL].reverse())).toEqual(attendu);
    }
  });
});

describe("idempotence — ce qui a été fait ne se refait pas", () => {
  it("expose les clés déjà consommées, pour ne pas rappeler un service extérieur", () => {
    const etat = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, ACTION_EXECUTEE, { cle: "mail:a" }),
      evenement(3, ACTION_EXECUTEE, { cle: "mail:b" }),
    ]);
    expect([...etat.effetsDejaProduits].sort()).toEqual(["mail:a", "mail:b"]);
  });

  it("refuse un journal où la même clé apparaît deux fois", () => {
    const anomalies = anomaliesDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, ACTION_EXECUTEE, { cle: "mail:a" }),
      evenement(3, ACTION_EXECUTEE, { cle: "mail:a" }),
    ]);
    expect(anomalies.map((a) => a.nature)).toContain("effet_duplique");
  });

  it("ne confond pas absence de clé et clé partagée : plusieurs événements sans clé sont normaux", () => {
    const etat = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, ACTION_DECIDEE),
      evenement(3, ACTION_DECIDEE),
    ]);
    expect(etat.phase).toBe("en_cours");
  });
});

describe("un journal incohérent ne rend JAMAIS un état", () => {
  it("refuse un run qui agit sans avoir démarré — la trace d'un événement disparu", () => {
    const anomalies = anomaliesDe([evenement(5, ACTION_EXECUTEE, { cle: "mail:a" })]);
    expect(anomalies[0]?.nature).toBe("jamais_demarre");
    expect(anomalies[0]?.rang).toBe(5);
  });

  it("refuse un second démarrage", () => {
    expect(anomaliesDe([evenement(1, RUN_DEMARRE), evenement(2, RUN_DEMARRE)])[0]?.nature).toBe(
      "double_demarrage",
    );
  });

  it("refuse un événement survenu après la fin", () => {
    const anomalies = anomaliesDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, RUN_TERMINE),
      evenement(3, ACTION_EXECUTEE, { cle: "mail:a" }),
    ]);
    expect(anomalies[0]?.nature).toBe("evenement_apres_fin");
  });

  it("refuse un accord qui ne referme aucune suspension", () => {
    expect(anomaliesDe([evenement(1, RUN_DEMARRE), evenement(2, ACCORD_ACCORDE)])[0]?.nature).toBe(
      "accord_sans_suspension",
    );
    expect(anomaliesDe([evenement(1, RUN_DEMARRE), evenement(2, ACCORD_REFUSE)])[0]?.nature).toBe(
      "accord_sans_suspension",
    );
  });

  it("refuse une double suspension", () => {
    const anomalies = anomaliesDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, POLITIQUE_SUSPEND),
      evenement(3, POLITIQUE_SUSPEND),
    ]);
    expect(anomalies[0]?.nature).toBe("double_suspension");
  });

  // Sauter poliment un événement inconnu est exactement ce qui produirait un état faux en silence.
  it("refuse une nature inconnue plutôt que de la sauter", () => {
    const anomalies = anomaliesDe([evenement(1, RUN_DEMARRE), evenement(2, "employe_a_dejeune")]);
    expect(anomalies[0]?.nature).toBe("nature_inconnue");
    expect(anomalies[0]?.detail).toContain("employe_a_dejeune");
  });

  it("refuse deux événements de même rang : l'ordre serait ambigu", () => {
    const anomalies = anomaliesDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, ACTION_DECIDEE),
      evenement(2, ACTION_EXECUTEE, { cle: "mail:a" }),
    ]);
    expect(anomalies[0]?.nature).toBe("rang_duplique");
  });

  // Le cas qui arrive vraiment : node-postgres rend un bigint en TEXTE.
  it("refuse un rang qui n'est pas un entier exploitable", () => {
    const pourri = { ...evenement(1, RUN_DEMARRE), seq: "1" as unknown as number };
    expect(anomaliesDe([pourri])[0]?.nature).toBe("rang_absent");
  });

  it("rend TOUTES les anomalies, pas seulement la première — on corrige un journal, pas un symptôme", () => {
    const anomalies = anomaliesDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, ACCORD_ACCORDE),
      evenement(3, "nature_bidon"),
    ]);
    expect(anomalies).toHaveLength(2);
  });
});

describe("reprise après interruption — rien ne survit en mémoire", () => {
  // Le scénario réel : le worker est tué entre deux battements. Le battement suivant relit et
  // doit retrouver EXACTEMENT le même état, pas un état approchant.
  it("retrouve le même état après une relecture complète du journal", () => {
    const journal = [
      evenement(1, RUN_DEMARRE),
      evenement(2, ACTION_DECIDEE),
      evenement(3, ACTION_EXECUTEE, { cle: "mail:prospect-1" }),
      evenement(4, POLITIQUE_SUSPEND, { payload: { outil: "mail.send", a: "marc@exemple.fr" } }),
    ];

    const avantLaPanne = etatDe(journal);
    const apresRedemarrage = etatDe(journal); // aucune mémoire conservée entre les deux

    expect(apresRedemarrage).toEqual(avantLaPanne);
    expect(apresRedemarrage.phase).toBe("attente_accord");
    expect(apresRedemarrage.actionEnAttente).toEqual({ outil: "mail.send", a: "marc@exemple.fr" });
  });

  it("reprend au bon rang après ajout d'événements, sans rejouer les effets déjà produits", () => {
    const avant = [
      evenement(1, RUN_DEMARRE),
      evenement(2, ACTION_EXECUTEE, { cle: "mail:prospect-1" }),
    ];
    const apres = [...avant, evenement(3, ACTION_EXECUTEE, { cle: "mail:prospect-2" })];

    expect(etatDe(avant).reprendreApres).toBe(2);
    expect(etatDe(apres).reprendreApres).toBe(3);
    expect(etatDe(apres).effetsDejaProduits.has("mail:prospect-1")).toBe(true);
    expect(etatDe(apres).actionsExecutees).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXEC-08 — le budget de pas d'un cycle, et l'arrêt qui appelle un humain.
// ─────────────────────────────────────────────────────────────────────────────

describe("le budget de pas d'un cycle", () => {
  it("compte les pas TENTÉS, pas les seuls pas qui ont abouti", () => {
    // Trois contextes assemblés, une seule action exécutée : un employé dont les propositions
    // sont refusées consomme du modèle exactement comme un employé qui réussit. Compter les
    // succès le laisserait tourner sans borne — c'est précisément le cas que la borne existe
    // pour attraper.
    const etat = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, CONTEXTE_ASSEMBLE),
      evenement(3, CONTEXTE_ASSEMBLE),
      evenement(4, CONTEXTE_ASSEMBLE),
      evenement(5, ACTION_EXECUTEE, { cle: "mail:prospect-1" }),
    ]);

    expect(etat.pasDuCycle).toBe(3);
    expect(etat.actionsExecutees).toBe(1);
  });

  it("repart de zéro après un report de run, sans oublier ce qui a été fait", () => {
    const etat = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, CONTEXTE_ASSEMBLE),
      evenement(3, ACTION_EXECUTEE, { cle: "mail:prospect-1" }),
      evenement(4, RUN_REPORTE),
      evenement(5, CONTEXTE_ASSEMBLE),
    ]);

    expect(etat.phase).toBe("en_cours"); // un report n'est ni une fin ni un échec
    expect(etat.pasDuCycle).toBe(1);
    expect(etat.actionsExecutees).toBe(1);
    expect(etat.effetsDejaProduits.has("mail:prospect-1")).toBe(true);
  });

  it("ne rouvre AUCUN budget quand c'est le pas, et non le run, qui est reporté", () => {
    // Sinon un fournisseur qui répond « réessayez » ferait tourner l'employé indéfiniment dans
    // la même journée, chaque échec passager remettant le compteur à zéro.
    const etat = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, CONTEXTE_ASSEMBLE),
      evenement(3, PAS_REPORTE),
      evenement(4, CONTEXTE_ASSEMBLE),
      evenement(5, PAS_REPORTE),
    ]);

    expect(etat.pasDuCycle).toBe(2);
  });

  it("refuse un report sur un run qui ne travaillait pas", () => {
    const anomalies = anomaliesDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, POLITIQUE_SUSPEND, { payload: {} }),
      evenement(3, RUN_REPORTE),
    ]);

    expect(anomalies.map((a) => a.nature)).toContain("report_hors_travail");
  });
});

describe("l'arrêt qui appelle un humain", () => {
  it("passe en attention requise, et le run ne peut plus reprendre seul", () => {
    const etat = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, CONTEXTE_ASSEMBLE),
      evenement(3, ATTENTION_REQUISE, { payload: { motif: "verification_humaine" } }),
    ]);

    expect(etat.phase).toBe("attention_requise");
    expect(peutReprendre(etat)).toBe(false);
  });

  it("se distingue d'une attente d'accord : ce n'est pas la même question posée au client", () => {
    const attention = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, ATTENTION_REQUISE, { payload: {} }),
    ]);
    const accord = etatDe([
      evenement(1, RUN_DEMARRE),
      evenement(2, POLITIQUE_SUSPEND, { payload: { outil: "mail.send" } }),
    ]);

    expect(attention.phase).not.toBe(accord.phase);
    // Une attention requise n'a pas d'action en attente : il n'y a rien à approuver.
    expect(attention.actionEnAttente).toBeNull();
    expect(accord.actionEnAttente).not.toBeNull();
  });
});
