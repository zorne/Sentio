import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";
import { describe, expect, it, vi } from "vitest";

import { CapabilityRegistry } from "../capability/registry.js";
import { idempotencyKeyFor } from "../idempotency.js";
import {
  EffetTransitoire,
  MAX_TENTATIVES,
  executeDecidedAction,
  type EffectLedger,
  type EtatEffet,
} from "./execute-action.js";
import type { DecisionPas } from "./next-action.js";

/**
 * EXEC-06 — l'exécution, et tout ce qui doit rester impossible.
 *
 * Les cas de CONCURRENCE et d'UNICITÉ ne sont pas ici : un registre factice ne peut pas prouver
 * qu'un index Postgres tranche une course. Ils vivent dans
 * `apps/worker/src/effects.integration.test.ts`, contre une vraie base. Ici : la logique de
 * décision, les interruptions, et les refus.
 */

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const AUTRE_TENANT = "99999999-9999-9999-9999-999999999999" as TenantId;
const TACHE = "22222222-2222-2222-2222-222222222222" as TaskId;
const EMPLOYE = "33333333-3333-3333-3333-333333333333" as EmployeeId;

/**
 * Un registre en mémoire qui imite fidèlement les DEUX règles de la vraie table : la clé est
 * unique par entreprise, et le résultat se rattache par la charge utile.
 */
class RegistreFactice implements EffectLedger {
  readonly engages = new Map<string, { tentatives: number }>();
  readonly resultats = new Map<string, unknown>();
  readonly ecritures: { kind: string; cle: string }[] = [];
  /** Simule un autre worker qui gagne la course juste avant nous. */
  perdreLaCourse = false;

  private static cle(tenantId: string, key: string): string {
    return `${tenantId}|${key}`;
  }

  async statusOf(tenantId: TenantId, key: string): Promise<EtatEffet> {
    const id = RegistreFactice.cle(tenantId, key);
    if (this.resultats.has(id)) {
      return { kind: "deja_execute", resultat: this.resultats.get(id) };
    }
    const engage = this.engages.get(id);
    if (engage !== undefined) {
      return { kind: "engage_sans_resultat", tentatives: engage.tentatives };
    }
    return { kind: "jamais_engage" };
  }

  async reserve(input: { tenantId: TenantId; idempotencyKey: string }): Promise<boolean> {
    const id = RegistreFactice.cle(input.tenantId, input.idempotencyKey);
    if (this.perdreLaCourse || this.engages.has(id)) return false;
    this.engages.set(id, { tentatives: 0 });
    return true;
  }

  async record(input: {
    tenantId: TenantId;
    kind: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const id = RegistreFactice.cle(input.tenantId, input.idempotencyKey);
    this.ecritures.push({ kind: input.kind, cle: input.idempotencyKey });
    if (input.kind === "action_executee") {
      this.resultats.set(id, input.payload["resultat"]);
    } else {
      const engage = this.engages.get(id);
      if (engage !== undefined) engage.tentatives += 1;
    }
  }
}

function registre() {
  const r = new CapabilityRegistry();
  r.registerContract({
    key: "envoyer_message",
    effectClass: "external_irreversible",
    description: "Écrire à une entreprise.",
  });
  r.registerContract({
    key: "lire_prospects",
    effectClass: "read",
    description: "Regarder les prospects du client.",
  });
  return r;
}

function decisionAgir(capabilityKey = "envoyer_message", entree: Record<string, unknown> = {
  a: "julie@exemple.fr",
  message: "Bonjour Julie",
}): DecisionPas {
  return {
    kind: "agir",
    proposition: { kind: "action", capabilityKey, input: entree, rationale: "Premier contact." },
    decision: { outcome: "allow", notify: false, basis: "accord_permanent" },
  };
}

function monter(options: { moteur?: () => Promise<unknown>; ledger?: RegistreFactice } = {}) {
  const ledger = options.ledger ?? new RegistreFactice();
  const moteur = vi.fn(options.moteur ?? (async () => ({ messageId: "m-1" })));
  const deps = {
    registry: registre(),
    ledger,
    engineFor: async () => ({ execute: moteur as (input: unknown) => Promise<unknown> }),
  };
  return { deps, ledger, moteur };
}

async function executer(
  deps: ReturnType<typeof monter>["deps"],
  decision: DecisionPas = decisionAgir(),
  tenantId: TenantId = TENANT,
) {
  return executeDecidedAction(deps, { tenantId, taskId: TACHE, employeeId: EMPLOYE, decision });
}

// ── La règle absolue ─────────────────────────────────────────────────────────

describe("seule une décision « agir » peut produire un effet", () => {
  const PROPOSITION = {
    kind: "action",
    capabilityKey: "envoyer_message",
    input: { a: "julie@exemple.fr" },
    rationale: "Premier contact.",
  } as const;

  const interdites: DecisionPas[] = [
    { kind: "refuse", raison: "hors périmètre" },
    {
      kind: "suspendu",
      proposition: PROPOSITION,
      decision: { outcome: "suspend", approvalId: "a-1", clientMessage: "…" },
    },
    { kind: "termine", raison: "plus rien à faire" },
    { kind: "proposition_illisible", refus: "json_illisible", detail: "…" },
  ];

  for (const decision of interdites) {
    it(`« ${decision.kind} » → aucun moteur appelé, aucun effet engagé`, async () => {
      const { deps, ledger, moteur } = monter();
      const resultat = await executer(deps, decision);

      expect(resultat.kind).toBe("non_autorise");
      expect(moteur).not.toHaveBeenCalled();
      expect(ledger.engages.size).toBe(0);
      expect(ledger.ecritures).toEqual([]);
    });
  }

  it("refuse une capacité sans contrat, même présentée comme autorisée", async () => {
    const { deps, moteur } = monter();
    const resultat = await executer(deps, decisionAgir("capacite_inventee"));

    expect(resultat.kind).toBe("non_autorise");
    expect(moteur).not.toHaveBeenCalled();
  });
});

// ── L'effet, une fois et une seule ───────────────────────────────────────────

describe("une action autorisée s'exécute une fois", () => {
  it("exécute, enregistre le résultat, et engage avant d'agir", async () => {
    const { deps, ledger, moteur } = monter();
    const resultat = await executer(deps);

    expect(resultat.kind).toBe("execute");
    expect(moteur).toHaveBeenCalledTimes(1);
    // L'engagement précède : sans lui, un effet pourrait exister sans trace.
    expect(ledger.engages.size).toBe(1);
    expect(ledger.ecritures.map((e) => e.kind)).toEqual(["action_executee"]);
  });

  it("rejouée à l'identique, elle ne produit PAS de second effet", async () => {
    const { deps, ledger, moteur } = monter();
    await executer(deps);

    const second = await executer(deps);
    expect(second.kind).toBe("deja_fait");
    expect(moteur).toHaveBeenCalledTimes(1);
    expect(ledger.ecritures).toHaveLength(1);
  });

  it("rejouée depuis une AUTRE tâche, elle ne produit pas non plus de second effet", async () => {
    // Le cœur de la correction EXEC-06 : la clé identifie l'EFFET, pas le chemin qui y mène.
    const { deps, moteur } = monter();
    await executer(deps);

    const ailleurs = await executeDecidedAction(deps, {
      tenantId: TENANT,
      taskId: "44444444-4444-4444-4444-444444444444" as TaskId,
      employeeId: EMPLOYE,
      decision: decisionAgir(),
    });

    expect(ailleurs.kind).toBe("deja_fait");
    expect(moteur).toHaveBeenCalledTimes(1);
  });

  it("un effet DIFFÉRENT n'entre pas en collision", async () => {
    const { deps, moteur } = monter();
    await executer(deps);
    await executer(deps, decisionAgir("envoyer_message", { a: "marc@exemple.fr", message: "Bonjour Marc" }));

    expect(moteur).toHaveBeenCalledTimes(2);
  });

  it("une capacité différente n'entre pas en collision, même entrée identique", async () => {
    const { deps, moteur } = monter();
    const entree = { reference: "r-1" };
    await executer(deps, decisionAgir("envoyer_message", entree));
    await executer(deps, decisionAgir("lire_prospects", entree));

    expect(moteur).toHaveBeenCalledTimes(2);
  });

  it("une AUTRE entreprise n'entre pas en collision", async () => {
    const { deps, moteur } = monter();
    await executer(deps);
    const chezAutre = await executer(deps, decisionAgir(), AUTRE_TENANT);

    expect(chezAutre.kind).toBe("execute");
    expect(moteur).toHaveBeenCalledTimes(2);
  });

  it("la clé ne dépend pas de l'ordre des champs de l'entrée", () => {
    const a = idempotencyKeyFor({ tenantId: TENANT, capabilityKey: "m", effect: { x: 1, y: 2 } });
    const b = idempotencyKeyFor({ tenantId: TENANT, capabilityKey: "m", effect: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });
});

// ── Les interruptions ────────────────────────────────────────────────────────

describe("une interruption ne produit jamais un doublon", () => {
  it("interrompu AVANT l'engagement : le battement suivant reprend normalement", async () => {
    const { deps, ledger, moteur } = monter();
    // Rien n'a été écrit : c'est l'état d'un worker tué avant d'agir.
    expect(ledger.engages.size).toBe(0);

    const resultat = await executer(deps);
    expect(resultat.kind).toBe("execute");
    expect(moteur).toHaveBeenCalledTimes(1);
  });

  // Les trois interruptions du milieu laissent le MÊME état : engagé, sans résultat.
  it("interrompu APRÈS l'engagement (effet irréversible) : rien n'est rejoué, un humain est appelé", async () => {
    const ledger = new RegistreFactice();
    const cle = idempotencyKeyFor({
      tenantId: TENANT,
      capabilityKey: "envoyer_message",
      effect: { a: "julie@exemple.fr", message: "Bonjour Julie" },
    });
    ledger.engages.set(`${TENANT}|${cle}`, { tentatives: 0 });

    const { deps, moteur } = monter({ ledger });
    const resultat = await executer(deps);

    expect(resultat.kind).toBe("verification_humaine_requise");
    expect(moteur).not.toHaveBeenCalled();
  });

  it("interrompu APRÈS l'enregistrement : le battement suivant passe à la suite", async () => {
    const { deps, moteur } = monter();
    await executer(deps);
    moteur.mockClear();

    const suivant = await executer(deps);
    expect(suivant.kind).toBe("deja_fait");
    expect(moteur).not.toHaveBeenCalled();
  });

  it("un effet REJOUABLE (lecture) est repris après interruption, au lieu de bloquer", async () => {
    const ledger = new RegistreFactice();
    const cle = idempotencyKeyFor({
      tenantId: TENANT,
      capabilityKey: "lire_prospects",
      effect: { filtre: "actifs" },
    });
    ledger.engages.set(`${TENANT}|${cle}`, { tentatives: 0 });

    const { deps, moteur } = monter({ ledger });
    const resultat = await executer(deps, decisionAgir("lire_prospects", { filtre: "actifs" }));

    expect(resultat.kind).toBe("execute");
    expect(moteur).toHaveBeenCalledTimes(1);
  });

  it("un effet rejouable finit par abandonner : pas de boucle infinie", async () => {
    const ledger = new RegistreFactice();
    const cle = idempotencyKeyFor({
      tenantId: TENANT,
      capabilityKey: "lire_prospects",
      effect: { filtre: "actifs" },
    });
    ledger.engages.set(`${TENANT}|${cle}`, { tentatives: MAX_TENTATIVES });

    const { deps, moteur } = monter({ ledger });
    const resultat = await executer(deps, decisionAgir("lire_prospects", { filtre: "actifs" }));

    expect(resultat.kind).toBe("echec_definitif");
    expect(moteur).not.toHaveBeenCalled();
  });

  it("perdre la course contre un autre worker n'exécute rien", async () => {
    const ledger = new RegistreFactice();
    ledger.perdreLaCourse = true;

    const { deps, moteur } = monter({ ledger });
    const resultat = await executer(deps);

    expect(resultat.kind).toBe("verification_humaine_requise");
    expect(moteur).not.toHaveBeenCalled();
  });

  it("perdre la course contre un worker qui a DÉJÀ terminé rend son résultat", async () => {
    const { deps, ledger, moteur } = monter();
    await executer(deps); // le premier worker termine
    ledger.perdreLaCourse = true;
    moteur.mockClear();

    const resultat = await executer(deps);
    expect(resultat.kind).toBe("deja_fait");
    expect(moteur).not.toHaveBeenCalled();
  });
});

// ── Les échecs ───────────────────────────────────────────────────────────────

describe("les échecs, et leur borne", () => {
  it("une erreur transitoire autorise un nouvel essai", async () => {
    const { deps, ledger } = monter({
      moteur: async () => {
        throw new EffetTransitoire("service momentanément indisponible");
      },
    });
    const resultat = await executer(deps, decisionAgir("lire_prospects", { filtre: "actifs" }));

    expect(resultat.kind).toBe("echec_transitoire");
    expect(ledger.ecritures.map((e) => e.kind)).toEqual(["action_echouee"]);
  });

  it("une erreur définitive ne se rejoue pas", async () => {
    const { deps } = monter({
      moteur: async () => {
        throw new Error("adresse invalide");
      },
    });
    const resultat = await executer(deps);

    expect(resultat.kind).toBe("echec_definitif");
  });

  it("des erreurs transitoires répétées finissent par être définitives", async () => {
    const ledger = new RegistreFactice();
    const { deps } = monter({
      ledger,
      moteur: async () => {
        throw new EffetTransitoire("encore indisponible");
      },
    });
    const decision = decisionAgir("lire_prospects", { filtre: "actifs" });

    let dernier = await executeDecidedAction(deps, {
      tenantId: TENANT,
      taskId: TACHE,
      employeeId: EMPLOYE,
      decision,
    });
    for (let i = 0; i < MAX_TENTATIVES + 2 && dernier.kind === "echec_transitoire"; i++) {
      dernier = await executeDecidedAction(deps, {
        tenantId: TENANT,
        taskId: TACHE,
        employeeId: EMPLOYE,
        decision,
      });
    }

    expect(dernier.kind).toBe("echec_definitif");
  });

  it("un moteur introuvable est un échec définitif, pas une tentative sans fin", async () => {
    const ledger = new RegistreFactice();
    const deps = {
      registry: registre(),
      ledger,
      engineFor: async () => {
        throw new Error("aucun moteur pour cette formule");
      },
    };
    const resultat = await executeDecidedAction(deps, {
      tenantId: TENANT,
      taskId: TACHE,
      employeeId: EMPLOYE,
      decision: decisionAgir(),
    });

    expect(resultat.kind).toBe("echec_definitif");
    // L'engagement a bien eu lieu avant : la trace existe même quand rien n'a été tenté.
    expect(ledger.engages.size).toBe(1);
  });

  it("un échec n'est jamais confondu avec un succès au battement suivant", async () => {
    const ledger = new RegistreFactice();
    const { deps } = monter({
      ledger,
      moteur: async () => {
        throw new EffetTransitoire("panne");
      },
    });
    await executer(deps, decisionAgir("lire_prospects", { filtre: "actifs" }));

    const etat = await ledger.statusOf(
      TENANT,
      idempotencyKeyFor({
        tenantId: TENANT,
        capabilityKey: "lire_prospects",
        effect: { filtre: "actifs" },
      }),
    );
    expect(etat.kind).toBe("engage_sans_resultat");
  });
});
