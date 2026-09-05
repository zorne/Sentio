import { describe, expect, it } from "vitest";

import { EmailProviderUnavailable, EmailRejected, type OutgoingEmail } from "./provider.js";
import { ResendEmailProvider } from "./resend.js";

const email: OutgoingEmail = {
  from: { address: "carter@client.fr", name: "Carter — Menuiseries Duval" },
  to: { address: "contact@prospect.fr" },
  subject: "Vos fenêtres",
  text: "Bonjour.",
  idempotencyKey: "envoyer.prospect:abc",
  headers: { "Auto-Submitted": "auto-generated" },
};

function providerWith(responder: (...args: never[]) => Promise<Response>, capture?: unknown[]) {
  return new ResendEmailProvider({
    apiKey: "clé-de-test",
    fetchImpl: ((url: string, init: RequestInit) => {
      capture?.push({ url, init });
      return responder(...([] as never[]));
    }) as unknown as typeof fetch,
  });
}

describe("Adaptateur d'expédition", () => {
  it("rend l'identifiant du message envoyé", async () => {
    const provider = providerWith(async () => new Response(JSON.stringify({ id: "msg_1" })));

    expect(await provider.send(email)).toEqual({ providerMessageId: "msg_1" });
  });

  it("transmet la clé d'idempotence dans l'en-tête prévu", async () => {
    const calls: unknown[] = [];
    const provider = providerWith(async () => new Response(JSON.stringify({ id: "msg_1" })), calls);

    await provider.send(email);

    const init = (calls[0] as { init: { headers: Record<string, string>; body: string } }).init;
    expect(init.headers["Idempotency-Key"]).toBe("envoyer.prospect:abc");
    // Le nom d'affichage voyage avec l'adresse : le message vient de l'entreprise cliente.
    expect(JSON.parse(init.body).from).toBe("Carter — Menuiseries Duval <carter@client.fr>");
    expect(JSON.parse(init.body).headers["Auto-Submitted"]).toBe("auto-generated");
  });

  it("traite une limitation de débit comme passagère", async () => {
    const provider = providerWith(async () => new Response("trop vite", { status: 429 }));

    await expect(provider.send(email)).rejects.toBeInstanceOf(EmailProviderUnavailable);
  });

  it("traite un refus comme définitif — insister abîmerait la réputation du client", async () => {
    const provider = providerWith(async () => new Response("domaine non vérifié", { status: 403 }));

    await expect(provider.send(email)).rejects.toBeInstanceOf(EmailRejected);
  });

  it("refuse de considérer l'envoi comme fait sans identifiant", async () => {
    const provider = providerWith(async () => new Response(JSON.stringify({})));

    await expect(provider.send(email)).rejects.toBeInstanceOf(EmailRejected);
  });

  it("traite une coupure réseau comme passagère", async () => {
    const provider = providerWith(async () => {
      throw new Error("ECONNRESET");
    });

    await expect(provider.send(email)).rejects.toBeInstanceOf(EmailProviderUnavailable);
  });
});
