import { describe, expect, it } from "vitest";

import { AdresseManquante, desinscrire } from "./optout.js";
import type { LeadId, TenantId } from "./ids.js";

const TENANT = "t-1" as TenantId;
const LEAD = "l-1" as LeadId;

describe("desinscrire — ce qu'une désinscription vérifiée produit", () => {
  it("produit une intention de type desinscription, adresse en minuscules", () => {
    const intent = desinscrire({ tenantId: TENANT, leadId: LEAD, email: "Marc.DUBOIS@Zenith.com" });
    expect(intent.kind).toBe("desinscription");
    expect(intent.pattern).toBe("marc.dubois@zenith.com");
    expect(intent.tenantId).toBe(TENANT);
    expect(intent.leadId).toBe(LEAD);
    expect(intent.reason.length).toBeGreaterThan(0);
  });

  it("retire les espaces superflus de l'adresse", () => {
    const intent = desinscrire({ tenantId: TENANT, leadId: LEAD, email: "  marc@zenith.com  " });
    expect(intent.pattern).toBe("marc@zenith.com");
  });

  it("refuse une adresse vide plutôt que d'écrire une ligne muette", () => {
    expect(() => desinscrire({ tenantId: TENANT, leadId: LEAD, email: "" })).toThrow(
      AdresseManquante,
    );
  });

  it("refuse une adresse faite uniquement d'espaces", () => {
    expect(() => desinscrire({ tenantId: TENANT, leadId: LEAD, email: "   " })).toThrow(
      AdresseManquante,
    );
  });
});
