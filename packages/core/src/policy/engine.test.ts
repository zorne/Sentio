/** Réalise : TEST-02 */

import { describe, expect, it } from "vitest";

import type { ApprovalStore, JournalWriter } from "../ports.js";
import { PolicyEngine, refuseOutOfScope, type PolicyRequest } from "./engine.js";

class FakeApprovals implements ApprovalStore {
  /** Indexé par CAPACITÉ, comme la vraie table : un accord ne couvre jamais une classe entière
   *  (EXEC-05, migration `20260806120002`). */
  standing = new Set<string>();
  requested: { effectClass: string; capabilityKey: string }[] = [];

  async hasStandingApproval(_t: string, _e: string, capabilityKey: string): Promise<boolean> {
    return this.standing.has(capabilityKey);
  }
  async requestApproval(input: { effectClass: string; capabilityKey: string }): Promise<string> {
    this.requested.push({ effectClass: input.effectClass, capabilityKey: input.capabilityKey });
    return `approval-${this.requested.length}`;
  }
}

class FakeJournal implements JournalWriter {
  entries: string[] = [];
  async append(entry: { kind: string }): Promise<void> {
    this.entries.push(entry.kind);
  }
}

function request(overrides: Partial<PolicyRequest> = {}): PolicyRequest {
  return {
    tenantId: "11111111-1111-1111-1111-111111111111" as PolicyRequest["tenantId"],
    taskId: "22222222-2222-2222-2222-222222222222" as PolicyRequest["taskId"],
    employeeId: "33333333-3333-3333-3333-333333333333" as PolicyRequest["employeeId"],
    capabilityKey: "envoyer_message",
    effectClass: "external_irreversible",
    autonomy: "confirm_once",
    ...overrides,
  };
}

function build() {
  const approvals = new FakeApprovals();
  const journal = new FakeJournal();
  return { engine: new PolicyEngine(approvals, journal), approvals, journal };
}

describe("Policy Engine — classes d'effet", () => {
  it("laisse passer une lecture et une écriture interne", async () => {
    const { engine, approvals } = build();

    for (const effectClass of ["read", "internal_write"] as const) {
      const decision = await engine.decide(request({ effectClass, autonomy: "auto" }));
      expect(decision.outcome).toBe("allow");
    }
    expect(approvals.requested).toHaveLength(0);
  });

  it("signale à notifier sans suspendre, sur une écriture interne", async () => {
    const { engine } = build();

    const decision = await engine.decide(
      request({ effectClass: "internal_write", autonomy: "notify" }),
    );

    expect(decision).toMatchObject({ outcome: "allow", notify: true });
  });
});

describe("Policy Engine — l'irréversible n'est jamais automatique par défaut", () => {
  it("suspend même en autonomie « auto » (invariant 6)", async () => {
    const { engine, approvals } = build();

    // C'est le cœur de l'invariant : choisir « auto » n'achète pas le droit d'envoyer un email
    // sans avoir jamais demandé.
    const decision = await engine.decide(request({ autonomy: "auto" }));

    expect(decision.outcome).toBe("suspend");
    expect(approvals.requested).toHaveLength(1);
  });

  it("« confirmer une fois » : suspend d'abord, passe ensuite", async () => {
    const { engine, approvals } = build();

    expect((await engine.decide(request())).outcome).toBe("suspend");

    approvals.standing.add("envoyer_message");
    expect((await engine.decide(request())).outcome).toBe("allow");
  });

  it("« confirmer » demande à chaque fois, même avec un accord permanent", async () => {
    const { engine, approvals } = build();
    approvals.standing.add("envoyer_message");

    const decision = await engine.decide(request({ autonomy: "confirm" }));

    expect(decision.outcome).toBe("suspend");
  });

  it("la révocation ramène immédiatement à la suspension", async () => {
    const { engine, approvals } = build();
    approvals.standing.add("envoyer_message");
    expect((await engine.decide(request())).outcome).toBe("allow");

    approvals.standing.delete("envoyer_message");

    expect((await engine.decide(request())).outcome).toBe("suspend");
  });
});

describe("Policy Engine — traçabilité", () => {
  it("journalise chaque décision, y compris les suspensions", async () => {
    const { engine, journal } = build();

    await engine.decide(request({ effectClass: "read" }));
    await engine.decide(request());

    // TEST-02 : un refus ou une suspension non tracés sont indistinguables d'une panne.
    expect(journal.entries).toEqual(["politique_allow", "politique_suspend"]);
  });

  it("refuse hors périmètre en nommant les capacités autorisées", () => {
    const decision = refuseOutOfScope("tenir_la_comptabilite", ["trouver_des_prospects"]);

    expect(decision).toMatchObject({ outcome: "refuse" });
    expect(decision.outcome === "refuse" && decision.reason).toMatch(/trouver_des_prospects/);
  });

  it("trace le refus hors périmètre — TEST-02 exige la trace, pas seulement le refus", async () => {
    const { engine, journal } = build();

    const decision = await engine.refuse(
      request({ capabilityKey: "tenir_la_comptabilite" }),
      ["trouver_des_prospects"],
    );

    expect(decision.outcome).toBe("refuse");
    expect(journal.entries).toEqual(["politique_refuse"]);
  });
});
