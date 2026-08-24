/**
 * RECRUT-02 — ce que la confirmation de paiement refuse, et pourquoi.
 *
 * ⚠️ Ce fichier vérifie **la porte**, pas le recrutement. Le recrutement lui-même est une
 * transaction en base, éprouvée par l'invariant `LADY-J` — le vérifier ici reviendrait à le
 * vérifier deux fois, et moins bien.
 *
 * Ce qui se joue à cette porte est d'une autre nature : c'est le seul endroit où de l'argent
 * réel rencontre le produit. Une porte trop permissive offre un employé à qui sait recopier une
 * URL.
 */

import { handle } from "./index.ts";
import { signerLaCharge, signHeartbeat } from "@sentio/domain";

const SECRET = "secret-de-paiement-pour-les-tests";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(obtenu: T, attendu: T, message: string): void {
  assert(obtenu === attendu, `${message} — attendu ${String(attendu)}, obtenu ${String(obtenu)}`);
}

const CORPS = JSON.stringify({
  recommendation: "11111111-1111-1111-1111-111111111111",
  entreprise: "Menuiserie Le Guen",
  formule: "start",
  reference: "paiement-abc",
});

async function requeteSignee(corps: string, secret = SECRET): Promise<Request> {
  const maintenant = new Date();
  return new Request("https://exemple.invalid/recrutement", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sentio-signature": await signerLaCharge(secret, maintenant, corps),
    },
    body: corps,
  });
}

/** Le secret posé le temps d'un cas, retiré ensuite : un test ne laisse pas une porte ouverte. */
async function avecSecret(fn: () => Promise<void>): Promise<void> {
  Deno.env.set("SENTIO_PAIEMENT_SECRET", SECRET);
  try {
    await fn();
  } finally {
    Deno.env.delete("SENTIO_PAIEMENT_SECRET");
    Deno.env.delete("DATABASE_URL");
  }
}

Deno.test("un GET ne recrute personne", async () => {
  const response = await handle(new Request("https://exemple.invalid/recrutement"));
  assertEquals(response.status, 405, "seule une notification est acceptée");
});

Deno.test("fermé par défaut : sans secret configuré, rien ne passe", async () => {
  Deno.env.delete("SENTIO_PAIEMENT_SECRET");
  const response = await handle(await requeteSignee(CORPS));
  assertEquals(response.status, 401, "sans secret, la porte reste fermée");
});

Deno.test("une signature d'un autre secret est refusée", async () => {
  await avecSecret(async () => {
    const response = await handle(await requeteSignee(CORPS, "un-autre-secret"));
    assertEquals(response.status, 401, "signature étrangère refusée");
  });
});

Deno.test("⭐ une signature valide REJOUÉE avec un autre corps est refusée", async () => {
  await avecSecret(async () => {
    // Le cas qui compte. Sans signature du corps, quiconque intercepte une confirmation pourrait
    // recruter sur la proposition de quelqu'un d'autre en changeant un identifiant.
    const maintenant = new Date();
    const entete = await signerLaCharge(SECRET, maintenant, CORPS);
    const autreCorps = JSON.stringify({
      recommendation: "22222222-2222-2222-2222-222222222222",
      entreprise: "Entreprise pirate",
      formule: "start",
      reference: "paiement-abc",
    });

    const response = await handle(
      new Request("https://exemple.invalid/recrutement", {
        method: "POST",
        headers: { "content-type": "application/json", "x-sentio-signature": entete },
        body: autreCorps,
      }),
    );
    assertEquals(response.status, 401, "un corps substitué est refusé");
  });
});

Deno.test("un battement authentique ne vaut pas confirmation de paiement", async () => {
  await avecSecret(async () => {
    const response = await handle(
      new Request("https://exemple.invalid/recrutement", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sentio-signature": await signHeartbeat(SECRET, new Date()),
        },
        body: CORPS,
      }),
    );
    assertEquals(response.status, 401, "une signature d'un autre usage est refusée");
  });
});

Deno.test("un champ inconnu est refusé, jamais ignoré", async () => {
  await avecSecret(async () => {
    const corps = JSON.stringify({
      recommendation: "11111111-1111-1111-1111-111111111111",
      entreprise: "Menuiserie",
      formule: "start",
      reference: "paiement-abc",
      montant: 999,
    });
    const response = await handle(await requeteSignee(corps));
    assertEquals(response.status, 422, "un champ en trop est refusé");
  });
});

Deno.test("un champ vide est refusé — une référence vide rendrait le rejeu indétectable", async () => {
  await avecSecret(async () => {
    const corps = JSON.stringify({
      recommendation: "11111111-1111-1111-1111-111111111111",
      entreprise: "Menuiserie",
      formule: "start",
      reference: "   ",
    });
    const response = await handle(await requeteSignee(corps));
    assertEquals(response.status, 422, "une référence vide est refusée");
  });
});

Deno.test("un corps illisible est refusé sans détail technique", async () => {
  await avecSecret(async () => {
    const response = await handle(await requeteSignee("{ pas du json"));
    assertEquals(response.status, 400, "corps illisible");
    const body = (await response.json()) as Record<string, unknown>;
    assert(
      JSON.stringify(body).includes("corps_illisible"),
      "le refus est nommé, sans exposer la cause technique",
    );
  });
});

Deno.test("une confirmation valide sans base configurée ne prétend pas avoir recruté", async () => {
  await avecSecret(async () => {
    Deno.env.delete("DATABASE_URL");
    const response = await handle(await requeteSignee(CORPS));
    assertEquals(response.status, 503, "indisponible plutôt qu'un faux succès");
  });
});

Deno.test("aucun refus ne dit au demandeur où il en est", async () => {
  await avecSecret(async () => {
    const response = await handle(await requeteSignee(CORPS, "mauvais-secret"));
    const body = JSON.stringify(await response.json());
    // « non_autorise » et rien d'autre : distinguer « secret absent » de « signature invalide »
    // apprendrait à celui qui essaie ce qu'il lui reste à trouver.
    assert(!body.includes("signature"), "le motif ne fuit pas dans la réponse");
    assert(!body.includes("secret"), "le motif ne fuit pas dans la réponse");
  });
});
