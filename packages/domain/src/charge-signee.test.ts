/**
 * La signature d'une charge — ce qu'elle protège, et ce que la signature du battement ne
 * protégeait pas.
 *
 * Réalise : RECRUT-02
 */

import { describe, expect, it } from "vitest";

import {
  CHARGE_HEADER,
  signHeartbeat,
  signerLaCharge,
  verifierLaCharge,
} from "./heartbeat-signature.js";

const SECRET = "un-secret-de-test-suffisamment-long";
const MAINTENANT = new Date("2026-08-15T12:00:00.000Z");
const CORPS = JSON.stringify({ recommendation: "abc", reference: "paiement-1" });

describe("Une charge signée ne se rejoue pas avec un autre corps", () => {
  it("accepte la charge exacte qui a été signée", async () => {
    const header = await signerLaCharge(SECRET, MAINTENANT, CORPS);
    expect(await verifierLaCharge({ header, secret: SECRET, corps: CORPS, now: MAINTENANT })).toEqual({
      ok: true,
    });
  });

  it("⭐ refuse le MÊME en-tête avec un corps modifié", async () => {
    // C'est le trou que la signature du battement laissait ouverte : elle ne couvre que
    // l'horodatage. Quiconque intercepte une confirmation de paiement pourrait, dans les cinq
    // minutes, recruter sur la proposition de quelqu'un d'autre en changeant le corps.
    const header = await signerLaCharge(SECRET, MAINTENANT, CORPS);
    const autreCorps = JSON.stringify({ recommendation: "xyz", reference: "paiement-1" });

    expect(
      await verifierLaCharge({ header, secret: SECRET, corps: autreCorps, now: MAINTENANT }),
    ).toEqual({ ok: false, reason: "signature_invalide" });
  });

  it("refuse un octet de différence, où qu'il soit", async () => {
    const header = await signerLaCharge(SECRET, MAINTENANT, CORPS);
    expect(
      await verifierLaCharge({ header, secret: SECRET, corps: CORPS + " ", now: MAINTENANT }),
    ).toEqual({ ok: false, reason: "signature_invalide" });
  });

  it("n'accepte pas une signature de battement à la place", async () => {
    // Les deux primitives partagent le format d'en-tête. Sans domaines de signature distincts,
    // un battement authentique servirait de confirmation de paiement.
    const battement = await signHeartbeat(SECRET, MAINTENANT);
    expect(
      await verifierLaCharge({ header: battement, secret: SECRET, corps: CORPS, now: MAINTENANT }),
    ).toEqual({ ok: false, reason: "signature_invalide" });
  });

  it("refuse hors de la fenêtre, sans même calculer la signature", async () => {
    const header = await signerLaCharge(SECRET, MAINTENANT, CORPS);
    const bienPlusTard = new Date(MAINTENANT.getTime() + 10 * 60 * 1000);
    expect(
      await verifierLaCharge({ header, secret: SECRET, corps: CORPS, now: bienPlusTard }),
    ).toEqual({ ok: false, reason: "hors_fenetre" });
  });

  it("est fermée par défaut : sans secret configuré, rien ne passe", async () => {
    const header = await signerLaCharge(SECRET, MAINTENANT, CORPS);
    expect(
      await verifierLaCharge({ header, secret: undefined, corps: CORPS, now: MAINTENANT }),
    ).toEqual({ ok: false, reason: "secret_absent" });
    expect(await verifierLaCharge({ header, secret: "", corps: CORPS, now: MAINTENANT })).toEqual({
      ok: false,
      reason: "secret_absent",
    });
  });

  it("refuse un en-tête absent ou malformé", async () => {
    for (const header of [null, "", "sans-point", "a.b.c"]) {
      const verdict = await verifierLaCharge({ header, secret: SECRET, corps: CORPS, now: MAINTENANT });
      expect(verdict.ok).toBe(false);
    }
  });

  it("porte son propre en-tête, distinct de celui du battement", () => {
    expect(CHARGE_HEADER).toBe("x-sentio-signature");
  });
});
