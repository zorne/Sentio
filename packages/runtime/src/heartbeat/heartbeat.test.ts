import { describe, expect, it } from "vitest";

import {
  createHeartbeatHandler,
  signHeartbeat,
  verifyHeartbeat,
  DEFAULT_TOLERANCE_MS,
  HEARTBEAT_HEADER,
  type HeartbeatReport,
} from "./index.js";

const SECRET = "un-secret-de-test-suffisamment-long";
const MAINTENANT = new Date("2026-08-06T10:00:00.000Z");

function horloge(now: Date) {
  return { now: () => now, sleep: async () => {} };
}

function requete(header: string | null, method = "POST"): Request {
  const headers = new Headers();
  if (header !== null) headers.set(HEARTBEAT_HEADER, header);
  return new Request("https://exemple.test/battement", { method, headers });
}

function handler(overrides: {
  secret?: string | undefined;
  now?: Date;
  travaux?: () => Promise<HeartbeatReport>;
} = {}) {
  const journal: Record<string, unknown>[] = [];
  const respond = createHeartbeatHandler({
    secret: () => ("secret" in overrides ? overrides.secret : SECRET),
    clock: horloge(overrides.now ?? MAINTENANT),
    executerLesTravauxDus: overrides.travaux ?? (async () => ({ traites: 0, echoues: 0 })),
    log: (record) => journal.push(record),
  });
  return { respond, journal };
}

describe("verifyHeartbeat — qui a le droit de réveiller l'exécution", () => {
  it("accepte un battement fraîchement signé", async () => {
    const header = await signHeartbeat(SECRET, MAINTENANT);
    expect(await verifyHeartbeat({ header, secret: SECRET, now: MAINTENANT })).toEqual({ ok: true });
  });

  // Le contrôle qui compte le plus : une configuration manquante ne doit JAMAIS ouvrir la porte.
  it("refuse tout quand aucun secret n'est configuré, même un en-tête bien formé", async () => {
    const header = await signHeartbeat(SECRET, MAINTENANT);
    expect(await verifyHeartbeat({ header, secret: undefined, now: MAINTENANT })).toEqual({
      ok: false,
      reason: "secret_absent",
    });
    expect(await verifyHeartbeat({ header, secret: "", now: MAINTENANT })).toEqual({
      ok: false,
      reason: "secret_absent",
    });
  });

  it("refuse une signature produite avec un autre secret", async () => {
    const header = await signHeartbeat("un-autre-secret", MAINTENANT);
    expect(await verifyHeartbeat({ header, secret: SECRET, now: MAINTENANT })).toEqual({
      ok: false,
      reason: "signature_invalide",
    });
  });

  it("refuse un en-tête rejoué au-delà de la fenêtre", async () => {
    const header = await signHeartbeat(SECRET, MAINTENANT);
    const plusTard = new Date(MAINTENANT.getTime() + DEFAULT_TOLERANCE_MS + 1000);
    expect(await verifyHeartbeat({ header, secret: SECRET, now: plusTard })).toEqual({
      ok: false,
      reason: "hors_fenetre",
    });
  });

  it("tolère une horloge de planificateur légèrement en avance ou en retard", async () => {
    const header = await signHeartbeat(SECRET, MAINTENANT);
    const enAvance = new Date(MAINTENANT.getTime() - DEFAULT_TOLERANCE_MS + 1000);
    const enRetard = new Date(MAINTENANT.getTime() + DEFAULT_TOLERANCE_MS - 1000);
    expect(await verifyHeartbeat({ header, secret: SECRET, now: enAvance })).toEqual({ ok: true });
    expect(await verifyHeartbeat({ header, secret: SECRET, now: enRetard })).toEqual({ ok: true });
  });

  it("refuse un en-tête absent, vide ou mal formé", async () => {
    const cas: Array<[string | null, string]> = [
      [null, "entete_absent"],
      ["   ", "entete_absent"],
      ["sans-point", "entete_malforme"],
      ["trop.de.points", "entete_malforme"],
      ["pas-un-nombre.c2lnbmF0dXJl", "horodatage_invalide"],
    ];
    for (const [header, reason] of cas) {
      expect(await verifyHeartbeat({ header, secret: SECRET, now: MAINTENANT })).toEqual({ ok: false, reason });
    }
  });

  it("ne laisse pas une signature illisible provoquer une exception", async () => {
    const header = `${MAINTENANT.getTime()}.@@@pas-du-base64@@@`;
    const verdict = await verifyHeartbeat({ header, secret: SECRET, now: MAINTENANT });
    expect(verdict.ok).toBe(false);
  });
});

describe("le point d'entrée du battement", () => {
  it("exécute les travaux dus et rend le rapport", async () => {
    const { respond, journal } = handler({ travaux: async () => ({ traites: 3, echoues: 1 }) });
    const reponse = await respond(requete(await signHeartbeat(SECRET, MAINTENANT)));

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ traites: 3, echoues: 1 });
    expect(journal[0]).toMatchObject({ route: "heartbeat", status: 200, traites: 3 });
  });

  it("n'exécute rien quand la signature est refusée", async () => {
    let appele = false;
    const { respond } = handler({
      travaux: async () => {
        appele = true;
        return { traites: 0, echoues: 0 };
      },
    });
    const reponse = await respond(requete("1754474400000.signature-fausse"));

    expect(reponse.status).toBe(401);
    expect(appele).toBe(false);
  });

  it("ne révèle jamais POURQUOI un battement est refusé", async () => {
    const { respond } = handler({ secret: undefined });
    const sansSecret = await respond(requete(await signHeartbeat(SECRET, MAINTENANT)));
    const { respond: respond2 } = handler();
    const mauvaiseSignature = await respond2(requete("1754474400000.signature-fausse"));

    expect(await sansSecret.json()).toEqual(await mauvaiseSignature.json());
    expect(sansSecret.status).toBe(mauvaiseSignature.status);
  });

  it("journalise en revanche la vraie raison — sinon une panne de config ressemble à une attaque", async () => {
    const { respond, journal } = handler({ secret: undefined });
    await respond(requete(await signHeartbeat(SECRET, MAINTENANT)));
    expect(journal[0]).toMatchObject({ status: 401, raison: "secret_absent" });
  });

  // Un GET déclenché par un préchargement ou un scanner de liens exécuterait du travail réel.
  it("refuse tout ce qui n'est pas un POST, même signé", async () => {
    const { respond } = handler();
    const header = await signHeartbeat(SECRET, MAINTENANT);
    for (const methode of ["GET", "HEAD", "PUT", "DELETE"]) {
      const reponse = await respond(requete(header, methode));
      expect(reponse.status).toBe(405);
    }
  });

  it("survit à un travail qui échoue, et le dit", async () => {
    const { respond, journal } = handler({
      travaux: async () => {
        throw new Error("base injoignable");
      },
    });
    const reponse = await respond(requete(await signHeartbeat(SECRET, MAINTENANT)));

    expect(reponse.status).toBe(500);
    expect(journal[0]).toMatchObject({ status: 500 });
    expect(JSON.stringify(journal[0])).toContain("base injoignable");
  });

  it("ne se met jamais en cache", async () => {
    const { respond } = handler();
    const reponse = await respond(requete(await signHeartbeat(SECRET, MAINTENANT)));
    expect(reponse.headers.get("cache-control")).toBe("no-store");
  });

  it("relit le secret à chaque appel, pour qu'une rotation ne demande pas un redéploiement", async () => {
    let secretCourant: string | undefined = SECRET;
    const respond = createHeartbeatHandler({
      secret: () => secretCourant,
      clock: horloge(MAINTENANT),
      executerLesTravauxDus: async () => ({ traites: 0, echoues: 0 }),
      log: () => {},
    });

    const header = await signHeartbeat(SECRET, MAINTENANT);
    expect((await respond(requete(header))).status).toBe(200);

    secretCourant = "secret-tourne";
    expect((await respond(requete(header))).status).toBe(401);
  });
});
