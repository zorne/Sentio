/**
 * Tests de l'adaptateur d'entrée de la désinscription.
 *
 * Comme pour `diagnostic`, ils ne rejouent pas les règles du domaine — `desinscrire()` a les
 * siennes, sous Vitest, dans `packages/domain`. Ils vérifient ce que seul cet endroit peut
 * casser : la méthode, le jeton, le comportement GET/POST (RFC 8058), et le fait que la panne
 * d'un dépôt ne fasse jamais fuir un prospect a le suivant.
 *
 *     deno test --allow-env supabase/functions/desinscription/
 */

import { createHandler, type LeadEmailLookup, type SuppressionWriter } from "./handler.ts";
import { buildOptOutToken } from "../_shared/optout-token.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  assert(actual === expected, `${message} — attendu ${String(expected)}, obtenu ${String(actual)}`);
}

const SECRET = "secret-de-test-jamais-en-production";
const TENANT = "11111111-1111-1111-1111-111111111111";
const LEAD = "22222222-2222-2222-2222-222222222222";

/** Un dépôt en mémoire — l'email peut être `null` pour simuler un prospect introuvable. */
function fakeDeps(email: string | null) {
  const inserted: Array<{ tenantId: string; pattern: string; kind: string; reason: string }> = [];
  const leads: LeadEmailLookup = {
    find(tenantId, leadId) {
      if (tenantId !== TENANT || leadId !== LEAD || email === null) return Promise.resolve(null);
      return Promise.resolve({ email });
    },
  };
  const suppressions: SuppressionWriter = {
    insert(intent) {
      inserted.push(intent);
      return Promise.resolve();
    },
  };
  return { leads, suppressions, inserted, secret: () => SECRET };
}

function request(method: string, token?: string): Request {
  const url = new URL("https://sentio.test/desinscription");
  if (token !== undefined) url.searchParams.set("t", token);
  return new Request(url, { method });
}

Deno.test("une méthode autre que GET/POST est refusée", async () => {
  const deps = fakeDeps("marc@zenith.com");
  const { handle } = createHandler(deps);
  const response = await handle(request("PUT", "peu-importe"));
  assertEquals(response.status, 405, "méthode inattendue");
});

Deno.test("un jeton absent est refusé, sans écriture", async () => {
  const deps = fakeDeps("marc@zenith.com");
  const { handle } = createHandler(deps);
  const response = await handle(request("GET"));
  assertEquals(response.status, 400, "jeton absent");
  assertEquals(deps.inserted.length, 0, "aucune écriture sans jeton valide");
});

Deno.test("un jeton mal signé est refusé", async () => {
  const deps = fakeDeps("marc@zenith.com");
  const { handle } = createHandler(deps);
  const forged = await buildOptOutToken(TENANT, LEAD, "un-autre-secret");
  const response = await handle(request("GET", forged));
  assertEquals(response.status, 400, "signature invalide");
  assertEquals(deps.inserted.length, 0, "aucune écriture sur un jeton forgé");
});

Deno.test("un jeton valide sur un prospect introuvable répond quand même 200, sans écriture", async () => {
  const deps = fakeDeps(null);
  const { handle } = createHandler(deps);
  const token = await buildOptOutToken(TENANT, LEAD, SECRET);
  const response = await handle(request("GET", token));
  assertEquals(response.status, 200, "rien à désinscrire n'est pas un échec pour le visiteur");
  assertEquals(deps.inserted.length, 0, "aucune ligne écrite sans email à suppresser");
});

Deno.test("un jeton valide écrit la désinscription, adresse en minuscules", async () => {
  const deps = fakeDeps("Marc.Dubois@Zenith.com");
  const { handle } = createHandler(deps);
  const token = await buildOptOutToken(TENANT, LEAD, SECRET);
  const response = await handle(request("GET", token));
  assertEquals(response.status, 200, "désinscription honorée");
  assertEquals(deps.inserted.length, 1, "une ligne écrite");
  assertEquals(deps.inserted[0]?.pattern, "marc.dubois@zenith.com", "adresse normalisée");
  assertEquals(deps.inserted[0]?.kind, "desinscription", "type correct");
  assertEquals(deps.inserted[0]?.tenantId, TENANT, "bon tenant");
});

Deno.test("suivre le même lien deux fois n'échoue pas la seconde fois", async () => {
  const deps = fakeDeps("marc@zenith.com");
  const { handle } = createHandler(deps);
  const token = await buildOptOutToken(TENANT, LEAD, SECRET);
  const first = await handle(request("GET", token));
  const second = await handle(request("GET", token));
  assertEquals(first.status, 200, "premier clic honoré");
  assertEquals(second.status, 200, "second clic honoré aussi (idempotence)");
  assertEquals(deps.inserted.length, 2, "le dépôt réel, lui, ignore le doublon (prefer: ignore-duplicates)");
});

Deno.test("un POST (List-Unsubscribe-Post, RFC 8058) répond sans corps", async () => {
  const deps = fakeDeps("marc@zenith.com");
  const { handle } = createHandler(deps);
  const token = await buildOptOutToken(TENANT, LEAD, SECRET);
  const response = await handle(request("POST", token));
  assertEquals(response.status, 200, "un clic automatique doit réussir");
  const text = await response.text();
  assertEquals(text, "", "un client de messagerie n'affiche jamais le corps de la réponse");
});

Deno.test("une panne du dépôt ne fuit pas : réponse honnête, jamais une pile d'appels", async () => {
  const deps = fakeDeps("marc@zenith.com");
  deps.suppressions.insert = () => {
    throw new Error("panne simulée du dépôt");
  };
  const { respond } = createHandler(deps);
  const token = await buildOptOutToken(TENANT, LEAD, SECRET);
  const response = await respond(request("GET", token));
  assertEquals(response.status, 500, "la panne devient une 500 honnête");
});

Deno.test("le secret absent invalide tout jeton, plutôt que de planter", async () => {
  const deps = fakeDeps("marc@zenith.com");
  const withoutSecret = { ...deps, secret: () => undefined };
  const { handle } = createHandler(withoutSecret);
  const token = await buildOptOutToken(TENANT, LEAD, SECRET);
  const response = await handle(request("GET", token));
  assertEquals(response.status, 400, "secret absent = jeton non vérifiable = refus");
});
