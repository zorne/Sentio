import { describe, expect, it } from "vitest";

import { VerifyDomainAuthCapability, type DnsTxtLookup, type SendingDomainAuthStore } from "./domain-auth.js";

const GOOD_SPF = "v=spf1 include:_spf.resend.com ~all";
const GOOD_DKIM = "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7";
const GOOD_DMARC = "v=DMARC1; p=quarantine; rua=mailto:dmarc@zenith.fr";

function build(records: Record<string, readonly string[]>) {
  const marks: Array<{ tenantId: string; sendingDomainId: string; spf: boolean; dkim: boolean; dmarc: boolean }> = [];
  const dns: DnsTxtLookup = {
    async lookup(hostname) {
      return records[hostname] ?? [];
    },
  };
  const store: SendingDomainAuthStore = {
    async markVerified(input) {
      marks.push(input);
    },
  };
  const capability = new VerifyDomainAuthCapability(dns, store);
  return { capability, marks };
}

const INPUT = {
  tenantId: "t-1",
  sendingDomainId: "d-1",
  domain: "zenith.fr",
  dkimSelector: "resend",
};

describe("VerifyDomainAuthCapability — ce qu'une vérification constate", () => {
  it("valide les trois preuves quand les trois enregistrements sont corrects", async () => {
    const { capability, marks } = build({
      "zenith.fr": [GOOD_SPF],
      "resend._domainkey.zenith.fr": [GOOD_DKIM],
      "_dmarc.zenith.fr": [GOOD_DMARC],
    });
    const result = await capability.execute(INPUT);
    expect(result.allVerified).toBe(true);
    expect(result.spf).toEqual({ verified: true });
    expect(result.dkim).toEqual({ verified: true });
    expect(result.dmarc).toEqual({ verified: true });
    expect(marks).toEqual([{ tenantId: "t-1", sendingDomainId: "d-1", spf: true, dkim: true, dmarc: true }]);
  });

  it("refuse un domaine sans aucun enregistrement, avec une raison par preuve manquante", async () => {
    const { capability, marks } = build({});
    const result = await capability.execute(INPUT);
    expect(result.allVerified).toBe(false);
    expect(result.spf).toEqual({ verified: false, reason: expect.stringContaining("SPF") });
    expect(result.dkim).toEqual({ verified: false, reason: expect.stringContaining("DKIM") });
    expect(result.dmarc).toEqual({ verified: false, reason: expect.stringContaining("DMARC") });
    expect(marks[0]).toEqual({ tenantId: "t-1", sendingDomainId: "d-1", spf: false, dkim: false, dmarc: false });
  });

  it("refuse un SPF qui ne referme pas la liste des expéditeurs", async () => {
    const { capability } = build({
      "zenith.fr": ["v=spf1 include:_spf.resend.com"],
      "resend._domainkey.zenith.fr": [GOOD_DKIM],
      "_dmarc.zenith.fr": [GOOD_DMARC],
    });
    const result = await capability.execute(INPUT);
    expect(result.spf.verified).toBe(false);
    expect(result.allVerified).toBe(false);
  });

  it("refuse une clé DKIM sans clé publique", async () => {
    const { capability } = build({
      "zenith.fr": [GOOD_SPF],
      "resend._domainkey.zenith.fr": ["v=DKIM1; k=rsa"],
      "_dmarc.zenith.fr": [GOOD_DMARC],
    });
    const result = await capability.execute(INPUT);
    expect(result.dkim.verified).toBe(false);
  });

  it("refuse une politique DMARC sans mode déclaré", async () => {
    const { capability } = build({
      "zenith.fr": [GOOD_SPF],
      "resend._domainkey.zenith.fr": [GOOD_DKIM],
      "_dmarc.zenith.fr": ["v=DMARC1; rua=mailto:dmarc@zenith.fr"],
    });
    const result = await capability.execute(INPUT);
    expect(result.dmarc.verified).toBe(false);
  });

  it("dé-vérifie : une preuve autrefois valide et absente maintenant est réécrite à false, jamais laissée intacte", async () => {
    const { capability, marks } = build({
      "zenith.fr": [], // le SPF a disparu depuis une précédente vérification réussie
      "resend._domainkey.zenith.fr": [GOOD_DKIM],
      "_dmarc.zenith.fr": [GOOD_DMARC],
    });
    await capability.execute(INPUT);
    expect(marks[0]?.spf).toBe(false);
  });

  it("interroge le bon nom pour chaque preuve — sélecteur DKIM, sous-domaine _dmarc", async () => {
    const requested: string[] = [];
    const dns: DnsTxtLookup = {
      async lookup(hostname) {
        requested.push(hostname);
        return [];
      },
    };
    const store: SendingDomainAuthStore = { async markVerified() {} };
    await new VerifyDomainAuthCapability(dns, store).execute(INPUT);
    expect(requested).toContain("zenith.fr");
    expect(requested).toContain("resend._domainkey.zenith.fr");
    expect(requested).toContain("_dmarc.zenith.fr");
  });
});
