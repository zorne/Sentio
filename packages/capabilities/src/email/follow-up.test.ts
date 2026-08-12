import { describe, expect, it } from "vitest";

import type { EmailProvider, OutgoingEmail } from "./provider.js";
import {
  FollowUpCapability,
  composeFollowUp,
  type FollowUpInput,
  type FollowUpVerdict,
} from "./follow-up.js";
import { MessageIncomplete } from "./send-message.js";

/**
 * Une relance est le seul message qu'on envoie à quelqu'un qui n'a PAS répondu au précédent. Ces
 * tests portent donc surtout sur ce qu'elle refuse de faire — et sur le fait qu'elle ne triche
 * pas avec les obligations en se disant « ce n'est qu'une relance ».
 */

function fakeProvider() {
  const sent: OutgoingEmail[] = [];
  const provider: EmailProvider = {
    key: "faux",
    async send(email) {
      sent.push(email);
      return { providerMessageId: `id-${sent.length}` };
    },
  };
  return { provider, sent };
}

function build(options: { verdict?: FollowUpVerdict; claimed?: boolean } = {}) {
  const { provider, sent } = fakeProvider();
  const claims: string[] = [];
  const capability = new FollowUpCapability(
    {
      check: async () =>
        options.verdict ?? { allowed: true, recipient: { address: "contact@prospect.fr" }, rang: 1 },
    },
    {
      claim: async (input) => {
        claims.push(input.idempotencyKey);
        return options.claimed ?? true;
      },
      confirm: async () => undefined,
    },
    provider,
  );
  return { capability, sent, claims };
}

function input(overrides: Partial<FollowUpInput> = {}): FollowUpInput {
  return {
    tenantId: "t",
    employeeId: "e",
    leadId: "l",
    sendingDomainId: "d",
    from: { address: "carter@client.fr", name: "Carter — Menuiseries Duval" },
    subject: "Re : Vos fenêtres sur mesure",
    body: "Bonjour, je reviens vers vous après mon message de la semaine dernière.",
    optOutUrl: "https://client.fr/stop/abc",
    senderCompany: "Menuiseries Duval",
    rightsContact: "contact@client.fr",
    idempotencyKey: "relancer_un_prospect:abc123:1",
    ...overrides,
  };
}

describe("Composition de la relance", () => {
  it("porte l'émetteur, l'opposition et les droits", () => {
    const text = composeFollowUp(input());

    expect(text).toContain("Menuiseries Duval");
    expect(text).toContain("https://client.fr/stop/abc");
    expect(text).toContain("contact@client.fr");
  });

  it("ne répète pas l'origine de la donnée, due au premier message seulement", () => {
    const text = composeFollowUp(input());

    expect(text).not.toContain("provient");
    expect(text).not.toContain("proviennent");
  });

  it("refuse de composer sans moyen d'opposition, même en relance", () => {
    expect(() => composeFollowUp(input({ optOutUrl: "  " }))).toThrow(MessageIncomplete);
  });

  it("refuse de composer sans contact pour exercer ses droits", () => {
    expect(() => composeFollowUp(input({ rightsContact: "" }))).toThrow(MessageIncomplete);
  });

  it("refuse de composer une relance vide", () => {
    expect(() => composeFollowUp(input({ body: "   " }))).toThrow(MessageIncomplete);
  });
});

describe("Exécution de la relance", () => {
  it("envoie quand la garde autorise, et rend le rang qu'elle a calculé", async () => {
    const { capability, sent } = build({
      verdict: { allowed: true, recipient: { address: "contact@prospect.fr" }, rang: 2 },
    });

    const result = await capability.execute(input());

    expect(result).toEqual({ status: "envoye", providerMessageId: "id-1", rang: 2 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to.address).toBe("contact@prospect.fr");
  });

  it("n'envoie rien quand la garde refuse, et rend son motif tel quel", async () => {
    const { capability, sent, claims } = build({
      verdict: { allowed: false, reason: "prospect_a_deja_repondu" },
    });

    const result = await capability.execute(input());

    expect(result).toEqual({ status: "refuse", reason: "prospect_a_deja_repondu" });
    expect(sent).toHaveLength(0);
    // La clé n'est même pas réservée : un refus ne consomme pas d'idempotence.
    expect(claims).toHaveLength(0);
  });

  it("s'arrête sans renvoyer quand la clé d'idempotence est déjà prise", async () => {
    const { capability, sent } = build({ claimed: false });

    const result = await capability.execute(input());

    expect(result).toEqual({ status: "deja_envoye" });
    expect(sent).toHaveLength(0);
  });

  it("refuse d'envoyer sans clé d'idempotence", async () => {
    const { capability, sent } = build();

    await expect(capability.execute(input({ idempotencyKey: "  " }))).rejects.toThrow(
      MessageIncomplete,
    );
    expect(sent).toHaveLength(0);
  });

  it("réserve la clé AVANT d'envoyer — jamais l'inverse", async () => {
    const ordre: string[] = [];
    const provider: EmailProvider = {
      key: "faux",
      async send() {
        ordre.push("envoi");
        return { providerMessageId: "id-1" };
      },
    };
    const capability = new FollowUpCapability(
      { check: async () => ({ allowed: true, recipient: { address: "c@p.fr" }, rang: 1 }) },
      {
        claim: async () => {
          ordre.push("reservation");
          return true;
        },
        confirm: async () => undefined,
      },
      provider,
    );

    await capability.execute(input());

    expect(ordre).toEqual(["reservation", "envoi"]);
  });

  it("porte le désabonnement en un clic et le marquage automatique", async () => {
    const { capability, sent } = build();

    await capability.execute(input());

    expect(sent[0]?.headers?.["List-Unsubscribe"]).toBe("<https://client.fr/stop/abc>");
    expect(sent[0]?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent[0]?.headers?.["Auto-Submitted"]).toBe("auto-generated");
  });
});
