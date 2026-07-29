import { describe, expect, it } from "vitest";

import { EmailProviderUnavailable, type EmailProvider, type OutgoingEmail } from "./provider.js";
import {
  MessageIncomplete,
  SendMessageCapability,
  composeMessage,
  type SendMessageInput,
  type SendingVerdict,
} from "./send-message.js";

/**
 * La capacité d'envoi est le seul endroit du produit qui produit un effet irréversible chez un
 * tiers. Ces tests vérifient donc surtout ce qu'elle **refuse** de faire.
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

function build(options: { verdict?: SendingVerdict; claimed?: boolean } = {}) {
  const { provider, sent } = fakeProvider();
  const claims: string[] = [];
  const capability = new SendMessageCapability(
    {
      check: async () =>
        options.verdict ?? { allowed: true, recipient: { address: "contact@prospect.fr" } },
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

function input(overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    tenantId: "t",
    employeeId: "e",
    leadId: "l",
    sendingDomainId: "d",
    from: { address: "carter@client.fr", name: "Carter — Menuiseries Duval" },
    subject: "Vos fenêtres sur mesure",
    body: "Bonjour, je travaille pour Menuiseries Duval.",
    optOutUrl: "https://client.fr/stop/abc",
    senderCompany: "Menuiseries Duval",
    dataSource: "fichier fourni par Menuiseries Duval",
    rightsContact: "contact@client.fr",
    idempotencyKey: "envoyer_un_message:abc123",
    ...overrides,
  };
}

describe("Composition du message", () => {
  it("porte l'émetteur, l'origine de la donnée, l'opposition et les droits", () => {
    const text = composeMessage(input());

    expect(text).toContain("Menuiseries Duval");
    expect(text).toContain("fichier fourni par Menuiseries Duval");
    expect(text).toContain("https://client.fr/stop/abc");
    expect(text).toContain("contact@client.fr");
  });

  it("refuse un message sans moyen d'opposition", () => {
    expect(() => composeMessage(input({ optOutUrl: "  " }))).toThrow(MessageIncomplete);
  });

  it("refuse un message sans origine de la donnée", () => {
    // Article 14 : le prospect n'a jamais parlé à personne, il doit savoir d'où vient son adresse.
    expect(() => composeMessage(input({ dataSource: "" }))).toThrow(MessageIncomplete);
  });

  it("refuse un message vide", () => {
    expect(() => composeMessage(input({ body: "   " }))).toThrow(MessageIncomplete);
  });
});

describe("Capacité d'envoi — ce qu'elle refuse", () => {
  it("n'envoie rien quand la garde dit non, et rend la raison", async () => {
    const { capability, sent } = build({
      verdict: { allowed: false, reason: "domaine_non_authentifie" },
    });

    const result = await capability.execute(input());

    expect(result).toEqual({ status: "refuse", reason: "domaine_non_authentifie" });
    expect(sent).toHaveLength(0);
  });

  it("n'envoie rien sans clé d'idempotence", async () => {
    const { capability, sent } = build();

    await expect(capability.execute(input({ idempotencyKey: "" }))).rejects.toBeInstanceOf(
      MessageIncomplete,
    );
    expect(sent).toHaveLength(0);
  });

  it("s'arrête si la clé est déjà prise — le message est déjà parti", async () => {
    const { capability, sent } = build({ claimed: false });

    expect(await capability.execute(input())).toEqual({ status: "deja_envoye" });
    expect(sent).toHaveLength(0);
  });

  it("réserve la clé AVANT d'envoyer", async () => {
    // L'ordre est la garantie : une panne entre l'envoi et l'enregistrement ne doit pas produire
    // un second message. Mieux vaut un message perdu qu'un prospect contacté deux fois.
    const ordre: string[] = [];
    const capability = new SendMessageCapability(
      { check: async () => ({ allowed: true, recipient: { address: "contact@prospect.fr" } }) },
      {
        claim: async () => {
          ordre.push("reserve");
          return true;
        },
        confirm: async () => {
          ordre.push("confirme");
        },
      },
      {
        key: "faux",
        send: async () => {
          ordre.push("envoi");
          return { providerMessageId: "id" };
        },
      },
    );

    await capability.execute(input());

    expect(ordre).toEqual(["reserve", "envoi", "confirme"]);
  });

  it("laisse remonter une panne du service sans prétendre avoir envoyé", async () => {
    const capability = new SendMessageCapability(
      { check: async () => ({ allowed: true, recipient: { address: "contact@prospect.fr" } }) },
      { claim: async () => true, confirm: async () => undefined },
      {
        key: "faux",
        send: async () => {
          throw new EmailProviderUnavailable("faux", "503");
        },
      },
    );

    await expect(capability.execute(input())).rejects.toBeInstanceOf(EmailProviderUnavailable);
  });
});

describe("Capacité d'envoi — ce qu'elle pose sur le message", () => {
  it("envoie au destinataire résolu par la garde, jamais à une adresse fournie par l'appelant", async () => {
    const { capability, sent } = build({
      verdict: { allowed: true, recipient: { address: "verifie@prospect.fr" } },
    });

    await capability.execute(input());

    expect(sent[0]?.to.address).toBe("verifie@prospect.fr");
  });

  it("pose le désabonnement en un clic et le marquage du contenu produit automatiquement", async () => {
    const { capability, sent } = build();

    await capability.execute(input());

    expect(sent[0]?.headers?.["List-Unsubscribe"]).toBe("<https://client.fr/stop/abc>");
    expect(sent[0]?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // AI Act, article 50 § 2 : marquage lisible par machine, sous la seule forme normalisée qui
    // existe pour un courrier (RFC 3834).
    expect(sent[0]?.headers?.["Auto-Submitted"]).toBe("auto-generated");
  });

  it("transmet la clé d'idempotence au service d'expédition", async () => {
    const { capability, sent } = build();

    await capability.execute(input());

    expect(sent[0]?.idempotencyKey).toBe("envoyer_un_message:abc123");
  });
});
