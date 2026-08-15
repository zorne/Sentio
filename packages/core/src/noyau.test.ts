import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LEXIQUE_DOC_PATH, findForbiddenTerms, parseForbiddenTerms } from "@sentio/config";
import type { CapabilityBinding, PlanId } from "@sentio/domain";
import { describe, expect, it } from "vitest";

import { CapabilityRegistry } from "./capability/registry.js";
import { MalformedConversation, assertWellFormed } from "./conversation/turn.js";
import { CapabilityUnavailable } from "./errors.js";
import { MissingIdempotencyKey, assertIdempotent, idempotencyKeyFor } from "./idempotency.js";
import { alreadyDone, reconstructTrace, type JournalEntry } from "./journal/trace.js";
import { DEFERRAL_MESSAGES } from "./model/gateway.js";
import { APPROVAL_REQUEST_MESSAGE } from "./policy/engine.js";

describe("Tour de conversation", () => {
  it("refuse un résultat de capacité orphelin", () => {
    expect(() =>
      assertWellFormed([
        { role: "user", type: "text", text: "vas-y" },
        { role: "capability", type: "capability_result", callId: "x", output: {}, failed: false },
      ]),
    ).toThrow(MalformedConversation);
  });

  it("refuse deux demandes portant le même identifiant", () => {
    const call = {
      role: "assistant",
      type: "capability_call",
      callId: "1",
      capabilityKey: "envoyer_message",
      input: {},
    } as const;

    expect(() => assertWellFormed([call, call])).toThrow(/même identifiant/);
  });

  it("exige que la consigne permanente ouvre la conversation", () => {
    expect(() =>
      assertWellFormed([
        { role: "user", type: "text", text: "bonjour" },
        { role: "system", type: "text", text: "ADN" },
      ]),
    ).toThrow(/doit ouvrir la conversation/);
  });

  it("accepte une conversation complète", () => {
    expect(() =>
      assertWellFormed([
        { role: "system", type: "text", text: "ADN" },
        { role: "user", type: "text", text: "prospecte" },
        {
          role: "assistant",
          type: "capability_call",
          callId: "1",
          capabilityKey: "rechercher.prospect",
          input: {},
        },
        { role: "capability", type: "capability_result", callId: "1", output: [], failed: false },
      ]),
    ).not.toThrow();
  });
});

describe("Clé d'idempotence", () => {
  const base = {
    tenantId: "t",
    taskId: "task",
    step: 3,
    capabilityKey: "envoyer_message",
    effect: { destinataire: "a@exemple.fr", objet: "Bonjour" },
  };

  it("est déterministe — c'est ce qui fait échouer le rejeu", () => {
    expect(idempotencyKeyFor(base)).toBe(idempotencyKeyFor(base));
  });

  it("ne dépend pas de l'ordre des champs de l'effet", () => {
    const inverse = { ...base, effect: { objet: "Bonjour", destinataire: "a@exemple.fr" } };
    expect(idempotencyKeyFor(inverse)).toBe(idempotencyKeyFor(base));
  });

  it("change dès que l'effet change", () => {
    const autre = { ...base, effect: { ...base.effect, destinataire: "b@exemple.fr" } };
    expect(idempotencyKeyFor(autre)).not.toBe(idempotencyKeyFor(base));
  });

  it("ne recopie aucune donnée personnelle dans la clé", () => {
    expect(idempotencyKeyFor(base)).not.toContain("exemple.fr");
  });

  it("refuse une action à effet extérieur sans clé", () => {
    expect(() => assertIdempotent("external_irreversible", "", "envoyer_message")).toThrow(
      MissingIdempotencyKey,
    );
    expect(() => assertIdempotent("read", null, "lire")).not.toThrow();
  });
});

describe("Reconstruction de trace", () => {
  // `createdAt` est IDENTIQUE partout, à dessein : c'est ce que fait la base, où `now()` vaut
  // l'heure de début de transaction. Un test qui échelonnerait les horodatages laisserait
  // croire qu'ils ordonnent quelque chose (EXEC-02).
  const MEME_INSTANT = new Date("2026-07-29T10:00:00Z");
  const entry = (over: Partial<JournalEntry> & { id: string; kind: string; seq: number }): JournalEntry => ({
    payload: {},
    idempotencyKey: null,
    createdAt: MEME_INSTANT,
    ...over,
  });

  it("rétablit l'ordre du journal quel que soit l'ordre reçu", () => {
    const trace = reconstructTrace([
      entry({ id: "b", seq: 2, kind: "second" }),
      entry({ id: "a", seq: 1, kind: "premier" }),
    ]);

    expect(trace.steps.map((s) => s.kind)).toEqual(["premier", "second"]);
    expect(trace.last?.kind).toBe("second");
  });

  it("ordonne sur le rang, jamais sur l'identifiant — un UUID v4 n'ordonne rien", () => {
    // `id` décroissant, `seq` croissant : si le tri retombait sur `id`, l'ordre s'inverserait.
    const trace = reconstructTrace([
      entry({ id: "zzz", seq: 1, kind: "premier" }),
      entry({ id: "aaa", seq: 2, kind: "second" }),
    ]);
    expect(trace.steps.map((s) => s.kind)).toEqual(["premier", "second"]);
  });

  it("sait ce qui a déjà produit son effet", () => {
    const trace = reconstructTrace([entry({ id: "a", seq: 1, kind: "message_envoye", idempotencyKey: "k1" })]);

    expect(alreadyDone(trace, "k1")).toBe(true);
    expect(alreadyDone(trace, "k2")).toBe(false);
  });

  it("déduit l'attente d'un accord humain du seul journal", () => {
    const suspendu = reconstructTrace([entry({ id: "a", seq: 1, kind: "politique_suspend" })]);
    expect(suspendu.awaitingApproval).toBe(true);

    const repris = reconstructTrace([
      entry({ id: "a", seq: 1, kind: "politique_suspend" }),
      entry({ id: "b", seq: 2, kind: "accord_accorde" }),
    ]);
    expect(repris.awaitingApproval).toBe(false);
  });

  it("referme aussi l'attente sur un refus — un run refusé n'attend plus rien", () => {
    const refuse = reconstructTrace([
      entry({ id: "a", seq: 1, kind: "politique_suspend" }),
      entry({ id: "b", seq: 2, kind: "accord_refuse" }),
    ]);
    expect(refuse.awaitingApproval).toBe(false);
  });
});

describe("Registre de capacités", () => {
  const contract = {
    key: "envoyer_message",
    effectClass: "external_irreversible",
    description: "Écrire à une entreprise et engager la conversation.",
  } as const;

  const binding = (over: Partial<CapabilityBinding>): CapabilityBinding =>
    ({
      id: "b" as CapabilityBinding["id"],
      capabilityId: "cap" as CapabilityBinding["capabilityId"],
      planId: "start" as PlanId,
      engineKey: "moteur-a",
      priority: 1,
      ...over,
    }) as CapabilityBinding;

  function registry() {
    const reg = new CapabilityRegistry();
    reg.registerContract(contract);
    return reg;
  }

  it("refuse un moteur sans contrat — le contrat vient toujours avant", () => {
    expect(() =>
      registry().registerEngine({
        engineKey: "m",
        capabilityKey: "inconnue",
        execute: async () => null,
      }),
    ).toThrow(CapabilityUnavailable);
  });

  it("résout le moteur de plus haute priorité pour la formule", () => {
    const reg = registry();
    reg.registerEngine({ engineKey: "moteur-a", capabilityKey: contract.key, execute: async () => "a" });
    reg.registerEngine({ engineKey: "moteur-b", capabilityKey: contract.key, execute: async () => "b" });

    const engine = reg.resolve({
      capabilityKey: contract.key,
      planId: "start" as PlanId,
      bindings: [
        binding({ engineKey: "moteur-a", priority: 1 }),
        binding({ engineKey: "moteur-b", priority: 10 }),
      ],
      capabilityKeyOf: () => contract.key,
    });

    expect(engine.engineKey).toBe("moteur-b");
  });

  it("ignore la liaison d'une autre formule", () => {
    const reg = registry();
    reg.registerEngine({ engineKey: "premium", capabilityKey: contract.key, execute: async () => null });

    expect(() =>
      reg.resolve({
        capabilityKey: contract.key,
        planId: "start" as PlanId,
        bindings: [binding({ engineKey: "premium", planId: "growth" as PlanId, priority: 10 })],
        capabilityKeyOf: () => contract.key,
      }),
    ).toThrow(CapabilityUnavailable);
  });

  it("saute une liaison dont le moteur n'est pas encore livré", () => {
    const reg = registry();
    reg.registerEngine({ engineKey: "moteur-a", capabilityKey: contract.key, execute: async () => "a" });

    const engine = reg.resolve({
      capabilityKey: contract.key,
      planId: "start" as PlanId,
      bindings: [
        binding({ engineKey: "pas-encore-livre", priority: 99 }),
        binding({ engineKey: "moteur-a", priority: 1 }),
      ],
      capabilityKeyOf: () => contract.key,
    });

    expect(engine.engineKey).toBe("moteur-a");
  });
});

describe("Messages visibles par le client", () => {
  // Le noyau produit des textes que le client lira : reports de tâche, demandes d'accord. Ils sont
  // soumis au lexique comme n'importe quel texte d'interface — et une règle vérifiée par un test
  // vaut mieux qu'une règle rappelée dans un document.
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const terms = parseForbiddenTerms(readFileSync(`${repoRoot}${LEXIQUE_DOC_PATH}`, "utf8"));

  const messages = [...Object.values(DEFERRAL_MESSAGES), APPROVAL_REQUEST_MESSAGE];

  it.each(messages)("respecte le lexique : %s", (message) => {
    expect(findForbiddenTerms(message, terms)).toHaveLength(0);
  });
});
