import { HEARTBEAT_HEADER, signHeartbeat } from "@sentio/domain";

import { PostgresDeno } from "./sql.ts";
import { repondre, sonder } from "./index.ts";

/**
 * PROTOTYPE D16 — la viabilité de l'exécutant Deno, vérifiée sous Deno.
 *
 * ⚠️ Ces tests s'exécutent sous **Deno**, pas sous Node. C'est tout leur intérêt : ce qu'on veut
 * savoir n'est pas si le code compile, mais s'il se comporte pareil sur l'autre runtime. Un test
 * Node ne pourrait pas le dire.
 *
 * Ils sont sautés sans `DATABASE_URL` — comme les suites d'intégration côté Node.
 */

/** Assertions locales — même convention que `desinscription/index.test.ts`. Une fonction
 *  n'importe pas de bibliothèque tierce, pas même pour ses tests : la dérogation de frontière
 *  couvre le pilote de base, et rien d'autre. */
function assert(condition: boolean, message = "condition fausse"): void {
  if (!condition) throw new Error(message);
}

function assertEquals(actuel: unknown, attendu: unknown): void {
  const a = JSON.stringify(actuel);
  const b = JSON.stringify(attendu);
  assert(a === b, `attendu ${b}, obtenu ${a}`);
}

const url = Deno.env.get("DATABASE_URL");
const SECRET = `secret-de-battement-${"x".repeat(32)}`;
const ignore = url === undefined || url === "";

Deno.test({
  name: "la signature écrite côté Node est acceptée ici — un seul module, deux runtimes",
  ignore,
  async fn() {
    // ⚠️ LE point d'architecture. Si les deux runtimes ne s'accordaient pas au bit près sur le
    // HMAC, la migration exigerait de resigner tous les déclencheurs — et une divergence
    // silencieuse ouvrirait ou fermerait le point d'entrée sans que personne ne le voie.
    Deno.env.set("SENTIO_HEARTBEAT_SECRET", SECRET);
    const entete = await signHeartbeat(SECRET, new Date());

    const reponse = await repondre(
      new Request("http://local/battement", { method: "POST", headers: { [HEARTBEAT_HEADER]: entete } }),
    );

    assertEquals(reponse.status, 200);
    const rapport = (await reponse.json()) as { msConnexion: number; msRequete: number };
    assert(rapport.msRequete >= 0);
    console.log(
      `   [D16] connexion ${Math.round(rapport.msConnexion)} ms · ` +
        `prise de travail ${Math.round(rapport.msRequete)} ms`,
    );
  },
});

Deno.test({
  name: "MUTATION — sans en-tête, mal signé, ou rejoué : refusé, et aucune connexion ouverte",
  ignore,
  async fn() {
    Deno.env.set("SENTIO_HEARTBEAT_SECRET", SECRET);

    const vieux = await signHeartbeat(SECRET, new Date(Date.now() - 3_600_000));
    const autre = await signHeartbeat(`autre-${"y".repeat(32)}`, new Date());

    for (const entete of [null, "n'importe quoi", vieux, autre]) {
      const reponse = await repondre(
        new Request("http://local/battement", {
          method: "POST",
          ...(entete === null ? {} : { headers: { [HEARTBEAT_HEADER]: entete } }),
        }),
      );
      assertEquals(reponse.status, 401);
      // Le refus ne dit jamais POURQUOI : distinguer « signature fausse » de « horodatage périmé »
      // n'aide que celui qui cherche à en fabriquer une valide.
      assertEquals(await reponse.json(), { erreur: "Battement refusé." });
    }
  },
});

Deno.test({
  name: "MUTATION — un secret absent refuse tout, il n'ouvre pas « en attendant »",
  ignore,
  async fn() {
    Deno.env.delete("SENTIO_HEARTBEAT_SECRET");
    const entete = await signHeartbeat(SECRET, new Date());
    const reponse = await repondre(
      new Request("http://local/battement", { method: "POST", headers: { [HEARTBEAT_HEADER]: entete } }),
    );
    assertEquals(reponse.status, 401);
    Deno.env.set("SENTIO_HEARTBEAT_SECRET", SECRET);
  },
});

Deno.test({
  name: "un GET ne déclenche rien : un battement a un effet",
  ignore,
  async fn() {
    const reponse = await repondre(new Request("http://local/battement", { method: "GET" }));
    assertEquals(reponse.status, 405);
    await reponse.body?.cancel();
  },
});

Deno.test({
  name: "le port SqlClient s'implémente sous Deno, et `for update skip locked` s'exécute tel quel",
  ignore,
  async fn() {
    const debut = performance.now();
    const sql = await PostgresDeno.connecter(url as string);
    const msConnexion = performance.now() - debut;
    try {
      // La requête d'EXEC-12, au mot près. Si elle passe ici, le SQL n'aura rien à réécrire.
      const debutRequete = performance.now();
      const pris = await sonder(sql, new Date());
      const msRequete = performance.now() - debutRequete;
      assert(pris >= 0);

      // Le pilote Deno rend bien des OBJETS : sans `queryObject`, le domaine lirait des tableaux
      // et `rowToDomain` s'y perdrait en silence.
      const lignes = await sql.query<{ un: number }>("select 1 as un", []);
      assertEquals(lignes[0]?.un, 1);

      console.log(
        `   [D16] connexion ${Math.round(msConnexion)} ms · requête ${Math.round(msRequete)} ms`,
      );
    } finally {
      await sql.fermer();
    }
  },
});
