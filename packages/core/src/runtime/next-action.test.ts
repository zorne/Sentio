import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";
import { describe, expect, it, vi } from "vitest";

import { CapabilityRegistry } from "../capability/registry.js";
import type { ConversationTurn } from "../conversation/turn.js";
import {
  NonCompliantRouting,
  PermanentProviderError,
  ProviderQuotaExceeded,
  TaskDeferred,
} from "../errors.js";
import { ModelGateway } from "../model/gateway.js";
import type { ModelProvider } from "../model/provider.js";
import { PolicyEngine } from "../policy/engine.js";
import type { ApprovalStore, JournalWriter, UsageLedger } from "../ports.js";
import { decideNextAction, readProposition, type DecisionPas } from "./next-action.js";

/**
 * EXEC-04 — la frontière entre « le modèle propose » et « le domaine décide ».
 *
 * Tout est unitaire ici, et c'est possible parce que le noyau ne connaît aucune infrastructure :
 * le Gateway reçoit des fournisseurs factices, le Policy Engine des ports factices. Ce qui
 * dépend vraiment de Postgres est testé dans `apps/worker`.
 */

const TENANT = "tenant-a" as TenantId;
const AUTRE_TENANT = "tenant-b" as TenantId;
const TACHE = "tache-1" as TaskId;
const EMPLOYE = "employe-1" as EmployeeId;

const CONTEXTE: ConversationTurn[] = [
  { role: "system", type: "text", text: "Métier : commercial. Limites, jamais franchies : comptabilité." },
  { role: "user", type: "text", text: "Objectif de ce travail : 10 rendez-vous." },
];

const REPONSE_VALIDE = JSON.stringify({
  action: "agir",
  capacite: "qualifier_prospect",
  entree: { leadId: "l-1" },
  pourquoi: "Ce prospect correspond à la cible déclarée.",
});

// ── Doublures ────────────────────────────────────────────────────────────────

function journalFactice() {
  const entrees: { kind: string; payload: unknown; tenantId: string }[] = [];
  const journal: JournalWriter = {
    append: async (entry) => {
      entrees.push({ kind: entry.kind, payload: entry.payload, tenantId: String(entry.tenantId) });
    },
  };
  return { journal, entrees };
}

function approbationsFactices(standing = false) {
  const demandes: unknown[] = [];
  const store: ApprovalStore = {
    hasStandingApproval: async () => standing,
    requestApproval: async (r) => {
      demandes.push(r);
      return "approbation-1";
    },
  };
  return { store, demandes };
}

/** Compteur réel dans sa forme, factice dans ses valeurs. Les enregistrements sont conservés :
 *  la traçabilité du coût se vérifie, elle ne se suppose pas. */
function ledgerFactice(limite: number | null = null) {
  const enregistrements: { quoi: "entreprise" | "enveloppe"; montant: number; cle: string }[] = [];
  const ledger: UsageLedger = {
    tenantLimit: async () => limite,
    tenantUsage: async () => (limite === null ? 0 : limite),
    recordTenantUsage: async (_tenant, metric, amount) => {
      enregistrements.push({ quoi: "entreprise", montant: amount, cle: String(metric) });
    },
    envelopeUsage: async () => 0,
    recordEnvelopeUsage: async (envelope, providerKey, amount) => {
      enregistrements.push({ quoi: "enveloppe", montant: amount, cle: `${envelope}:${providerKey}` });
    },
  };
  return { ledger, enregistrements };
}

function fournisseur(over: Partial<ModelProvider> & { key: string }): ModelProvider {
  return {
    dataPolicy: "no_train",
    complete: async () => ({
      turn: { role: "assistant", type: "text", text: REPONSE_VALIDE },
      tokens: 42,
    }),
    ...over,
  } as ModelProvider;
}

function registreFactice() {
  const registre = new CapabilityRegistry();
  registre.registerContract({
    key: "qualifier_prospect",
    effectClass: "read",
    description: "Regarder si un prospect correspond à ce que vend le client.",
  });
  registre.registerContract({
    key: "envoyer_message",
    effectClass: "external_irreversible",
    description: "Écrire à une entreprise et engager la conversation.",
  });
  return registre;
}

function monter(
  options: {
    reponse?: string;
    provider?: ModelProvider;
    providers?: ModelProvider[];
    standing?: boolean;
    limite?: number | null;
    optOutProuve?: boolean;
  } = {},
) {
  const { journal, entrees } = journalFactice();
  const { store, demandes } = approbationsFactices(options.standing ?? false);

  const providers =
    options.providers ??
    [
      options.provider ??
        fournisseur({
          key: "principal",
          complete: async () => ({
            turn: {
              role: "assistant",
              type: "text",
              text: options.reponse ?? REPONSE_VALIDE,
            },
            tokens: 42,
          }),
        }),
    ];

  const { ledger, enregistrements } = ledgerFactice(options.limite ?? null);
  const gateway = new ModelGateway({
    providers,
    ledger,
    journal,
    flags: { inferenceOptOutProven: options.optOutProuve ?? true } as never,
    clock: { now: () => new Date("2026-08-06T10:00:00Z"), sleep: async () => undefined },
  });

  const deps = {
    gateway,
    policy: new PolicyEngine(store, journal),
    registry: registreFactice(),
    journal,
  };

  return { deps, entrees, demandes, enregistrements };
}

const BASE = {
  tenantId: TENANT,
  taskId: TACHE,
  employeeId: EMPLOYE,
  turns: CONTEXTE,
  capacitesAutorisees: ["qualifier_prospect", "envoyer_message"],
  autonomy: "auto" as const,
  dataClass: "real" as const,
  envelope: "sold_employees",
};

async function decider(options: Parameters<typeof monter>[0] = {}, over: Partial<typeof BASE> = {}) {
  const { deps, entrees, demandes, enregistrements } = monter(options);
  const decision = await decideNextAction(deps, { ...BASE, ...over });
  return { decision, entrees, demandes, enregistrements };
}

// ── Lecture stricte ──────────────────────────────────────────────────────────

describe("readProposition — une réponse n'est jamais lue « au mieux »", () => {
  it("lit une proposition d'action valide", () => {
    const lecture = readProposition(REPONSE_VALIDE);
    expect(lecture).toEqual({
      ok: true,
      proposition: {
        kind: "action",
        capabilityKey: "qualifier_prospect",
        input: { leadId: "l-1" },
        rationale: "Ce prospect correspond à la cible déclarée.",
      },
    });
  });

  it("lit une fin de travail", () => {
    const lecture = readProposition('{"action":"terminer","pourquoi":"Plus aucun prospect à traiter."}');
    expect(lecture.ok && lecture.proposition.kind).toBe("termine");
  });

  it("tolère l'emballage en bloc de code, qui n'est pas une malformation", () => {
    const lecture = readProposition("```json\n" + REPONSE_VALIDE + "\n```");
    expect(lecture.ok).toBe(true);
  });

  it("refuse une réponse vide", () => {
    expect(readProposition("   ")).toMatchObject({ ok: false, refus: "reponse_vide" });
  });

  it("refuse ce qui n'est pas du JSON", () => {
    expect(readProposition("Je vais contacter Marc.")).toMatchObject({
      ok: false,
      refus: "json_illisible",
    });
    expect(readProposition("{ceci n'est pas du json}")).toMatchObject({
      ok: false,
      refus: "json_illisible",
    });
  });

  it("refuse une forme inattendue plutôt que de la deviner", () => {
    expect(readProposition('{"action":"envoyer","pourquoi":"x"}')).toMatchObject({
      ok: false,
      refus: "forme_invalide",
    });
    expect(readProposition('["agir"]')).toMatchObject({ ok: false, refus: "json_illisible" });
  });

  // Le cas qui compte le plus : un champ en trop est le plus souvent une consigne injectée.
  it("refuse un champ non prévu, au lieu de l'ignorer en silence", () => {
    const lecture = readProposition(
      JSON.stringify({
        action: "agir",
        capacite: "qualifier_prospect",
        entree: {},
        pourquoi: "x",
        executer_directement: true,
      }),
    );
    expect(lecture).toMatchObject({ ok: false, refus: "champ_inconnu" });
    expect(lecture.ok === false && lecture.detail).toContain("executer_directement");
  });

  it("exige un motif : une action sans pourquoi est inexplicable au client", () => {
    expect(
      readProposition('{"action":"agir","capacite":"qualifier_prospect","entree":{},"pourquoi":"  "}'),
    ).toMatchObject({ ok: false, refus: "forme_invalide" });
  });

  it("refuse une capacité absente ou vide", () => {
    expect(readProposition('{"action":"agir","capacite":"","entree":{},"pourquoi":"x"}')).toMatchObject({
      ok: false,
      refus: "capacite_manquante",
    });
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    expect(
      readProposition('{"action":"agir","capacite":"q","entree":"tout","pourquoi":"x"}'),
    ).toMatchObject({ ok: false, refus: "entree_invalide" });
  });
});

// ── La décision ──────────────────────────────────────────────────────────────

describe("le modèle propose, le domaine décide", () => {
  it("autorise une lecture, et n'exécute rien", async () => {
    const { decision } = await decider();
    expect(decision.kind).toBe("agir");
    if (decision.kind !== "agir") return;
    expect(decision.proposition.capabilityKey).toBe("qualifier_prospect");
    expect(decision.decision.outcome).toBe("allow");
  });

  // La règle non négociable : l'irréversible n'est jamais automatique, même en autonomie « auto ».
  it("suspend un effet extérieur irréversible même quand le client a choisi « auto »", async () => {
    const { decision, demandes } = await decider({
      reponse: JSON.stringify({
        action: "agir",
        capacite: "envoyer_message",
        entree: { a: "julie@exemple.fr" },
        pourquoi: "Premier contact.",
      }),
    });

    expect(decision.kind).toBe("suspendu");
    expect(demandes).toHaveLength(1);
  });

  it("refuse une capacité hors du périmètre de CET employé, même demandée par le modèle", async () => {
    const { decision } = await decider(
      {
        reponse: JSON.stringify({
          action: "agir",
          capacite: "envoyer_message",
          entree: {},
          pourquoi: "x",
        }),
      },
      { capacitesAutorisees: ["qualifier_prospect"] },
    );

    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") return;
    expect(decision.raison).toContain("envoyer_message");
  });

  it("refuse une capacité qui n'existe nulle part — inventée par le modèle", async () => {
    const { decision } = await decider(
      {
        reponse: JSON.stringify({
          action: "agir",
          capacite: "pirater_le_concurrent",
          entree: {},
          pourquoi: "x",
        }),
      },
      { capacitesAutorisees: ["pirater_le_concurrent"] }, // même autorisée, aucun contrat ne la définit
    );

    expect(decision.kind).toBe("refuse");
  });

  it("rend la fin du travail sans passer par la politique", async () => {
    const { decision, demandes } = await decider({
      reponse: '{"action":"terminer","pourquoi":"Tous les prospects ont été traités."}',
    });
    expect(decision.kind).toBe("termine");
    expect(demandes).toHaveLength(0);
  });

  it("arrête le pas sur une réponse illisible — aucun repli vers une autre action", async () => {
    const { decision, demandes } = await decider({ reponse: "Je vais écrire à Marc, c'est mieux." });

    expect(decision.kind).toBe("proposition_illisible");
    expect(demandes).toHaveLength(0); // rien n'a été soumis à la politique
  });

  it("la classe d'effet vient du CONTRAT, jamais de ce que le modèle prétend", async () => {
    // Le modèle range son envoi dans une « entree » qui se dit inoffensive : sans effet.
    const { decision } = await decider({
      reponse: JSON.stringify({
        action: "agir",
        capacite: "envoyer_message",
        entree: { effectClass: "read", inoffensif: true },
        pourquoi: "x",
      }),
    });
    expect(decision.kind).toBe("suspendu");
  });
});

// ── Ce qui remonte, et ne doit pas être avalé ────────────────────────────────

describe("aucun rattrapage silencieux", () => {
  it("laisse remonter un report de quota d'entreprise", async () => {
    await expect(decider({ limite: 0 })).rejects.toThrow(TaskDeferred);
  });

  it("laisse remonter un routage non conforme — donnée réelle, opt-out non prouvé", async () => {
    await expect(decider({ optOutProuve: false })).rejects.toThrow(NonCompliantRouting);
  });

  it("laisse remonter une erreur permanente de fournisseur", async () => {
    await expect(
      decider({
        provider: fournisseur({
          key: "cassé",
          complete: async () => {
            throw new PermanentProviderError("cassé", "clé refusée");
          },
        }),
      }),
    ).rejects.toThrow(PermanentProviderError);
  });

  it("reporte la tâche quand tous les fournisseurs éligibles sont épuisés", async () => {
    await expect(
      decider({
        providers: [
          fournisseur({
            key: "a",
            complete: async () => {
              throw new ProviderQuotaExceeded("a", "quota a");
            },
          }),
          fournisseur({
            key: "b",
            complete: async () => {
              throw new ProviderQuotaExceeded("b", "quota b");
            },
          }),
        ],
      }),
    ).rejects.toThrow(TaskDeferred);
  });

  it("sans aucun fournisseur — donc sans identifiant utilisable — rien ne part", async () => {
    await expect(decider({ providers: [] })).rejects.toThrow(NonCompliantRouting);
  });

  it("ne franchit JAMAIS la frontière de classe de données pour se rabattre", async () => {
    // Le conforme échoue ; le non-conforme est là, et ne doit pas être essayé.
    const nonConforme = vi.fn();
    await expect(
      decider({
        providers: [
          fournisseur({
            key: "conforme",
            dataPolicy: "no_train",
            complete: async () => {
              throw new ProviderQuotaExceeded("conforme", "épuisé");
            },
          }),
          fournisseur({ key: "gratuit", dataPolicy: "free", complete: nonConforme as never }),
        ],
      }),
    ).rejects.toThrow(TaskDeferred);
    expect(nonConforme).not.toHaveBeenCalled();
  });
});

// ── Traçabilité et isolation ─────────────────────────────────────────────────

describe("traçabilité", () => {
  it("journalise la proposition, son coût et son fournisseur", async () => {
    const { entrees } = await decider();
    const proposition = entrees.find((e) => e.kind === "proposition_recue");

    expect(proposition).toBeDefined();
    expect(proposition?.payload).toMatchObject({ fournisseur: "principal", jetons: 42 });
  });

  it("compte le coût de l'appel, par entreprise ET par enveloppe", async () => {
    const { enregistrements } = await decider();

    expect(enregistrements.some((e) => e.quoi === "entreprise" && e.montant === 42)).toBe(true);
    expect(enregistrements.some((e) => e.quoi === "enveloppe" && e.montant === 42)).toBe(true);
  });

  it("compte le coût même quand la réponse est inexploitable — l'appel a bien été payé", async () => {
    const { enregistrements } = await decider({ reponse: "n'importe quoi" });
    expect(enregistrements.some((e) => e.montant === 42)).toBe(true);
  });

  it("journalise aussi une réponse illisible — un refus muet ressemble à une panne", async () => {
    const { entrees } = await decider({ reponse: "n'importe quoi" });
    const trace = entrees.find((e) => e.kind === "proposition_illisible");

    expect(trace).toBeDefined();
    expect(trace?.payload).toMatchObject({ refus: "json_illisible" });
  });

  it("journalise la décision de politique, y compris les refus", async () => {
    const { entrees } = await decider(
      {
        reponse: JSON.stringify({
          action: "agir",
          capacite: "envoyer_message",
          entree: {},
          pourquoi: "x",
        }),
      },
      { capacitesAutorisees: ["qualifier_prospect"] },
    );
    expect(entrees.some((e) => e.kind === "politique_refuse")).toBe(true);
  });

  it("n'écrit jamais sous l'entreprise d'un autre : toutes les traces portent le même tenant", async () => {
    const { entrees } = await decider({}, { tenantId: AUTRE_TENANT });
    expect(entrees.length).toBeGreaterThan(0);
    expect(entrees.every((e) => e.tenantId === AUTRE_TENANT)).toBe(true);
  });

  it("transmet l'entreprise au Gateway pour le comptage, sans jamais la mêler à une autre", async () => {
    const vu: (string | null)[] = [];
    await decider(
      {
        provider: fournisseur({
          key: "espion",
          complete: async (requete) => {
            vu.push(requete.tenantId);
            return { turn: { role: "assistant", type: "text", text: REPONSE_VALIDE }, tokens: 1 };
          },
        }),
      },
      { tenantId: AUTRE_TENANT },
    );
    expect(vu).toEqual([AUTRE_TENANT]);
  });
});

describe("ce que le Gateway reçoit", () => {
  it("reçoit le contexte assemblé, et la consigne de forme parmi les consignes permanentes", async () => {
    let recu: readonly ConversationTurn[] = [];
    await decider({
      provider: fournisseur({
        key: "espion",
        complete: async (requete) => {
          recu = requete.turns;
          return { turn: { role: "assistant", type: "text", text: REPONSE_VALIDE }, tokens: 1 };
        },
      }),
    });

    // L'ADN reste en tête, la tâche reste en queue : la consigne s'insère entre les deux.
    expect(recu[0]?.role).toBe("system");
    expect(recu[recu.length - 1]?.role).toBe("user");
    const rangConsigne = recu.findIndex(
      (t) => t.type === "text" && t.text.includes("Capacités autorisées"),
    );
    expect(rangConsigne).toBeGreaterThan(0);
    expect(rangConsigne).toBeLessThan(recu.length - 1);
  });

  it("annonce au modèle les seules capacités de cet employé", async () => {
    let recu: readonly ConversationTurn[] = [];
    await decider(
      {
        provider: fournisseur({
          key: "espion",
          complete: async (requete) => {
            recu = requete.turns;
            return { turn: { role: "assistant", type: "text", text: REPONSE_VALIDE }, tokens: 1 };
          },
        }),
      },
      { capacitesAutorisees: ["qualifier_prospect"] },
    );

    const consigne = recu.find((t) => t.type === "text" && t.text.includes("Capacités autorisées"));
    expect(consigne?.type === "text" && consigne.text).toContain("qualifier_prospect");
    expect(consigne?.type === "text" && consigne.text).not.toContain("envoyer_message");
  });
});

describe("ce module n'exécute jamais rien", () => {
  it("n'appelle aucun moteur de capacité, même quand la politique autorise", async () => {
    const moteur = vi.fn();
    const { deps } = monter();
    deps.registry.registerEngine({
      engineKey: "moteur-qualif",
      capabilityKey: "qualifier_prospect",
      execute: moteur as never,
    });

    const decision: DecisionPas = await decideNextAction(deps, BASE);

    expect(decision.kind).toBe("agir");
    expect(moteur).not.toHaveBeenCalled();
  });
});
