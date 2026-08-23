import { HEARTBEAT_HEADER, signHeartbeat } from "@sentio/domain";

import { PostgresDeno } from "./sql.ts";
import { monter, repondre } from "./index.ts";

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

const SECRET_AUTRE = `autre-secret-${"y".repeat(32)}`;

/** L'environnement complet d'un hôte Deno — l'exact pendant de celui du test Node. */
function environnement(surcharges: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL: url as string,
    SENTIO_HEARTBEAT_SECRET: SECRET,
    // Adresse injoignable : aucun test ne sort sur le réseau. Le fournisseur est là pour que la
    // configuration soit complète, pas pour être appelé.
    SENTIO_MODELE_PRINCIPAL_URL: "https://modele.invalide.exemple/v1",
    SENTIO_MODELE_PRINCIPAL_NOM: "modele-de-test",
    SENTIO_MODELE_PRINCIPAL_CLE: "cle-de-test",
    SENTIO_MODELE_PRINCIPAL_POLITIQUE: "no_train",
    SENTIO_NOM_EXECUTANT: "executant-deno-de-test",
    ...surcharges,
  };
}

function battre(entete: string | null): Promise<Response> {
  for (const [cle, valeur] of Object.entries(environnement())) Deno.env.set(cle, valeur);
  return repondre(
    new Request("http://local/battement", {
      method: "POST",
      ...(entete === null ? {} : { headers: { [HEARTBEAT_HEADER]: entete } }),
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARITÉ — les mêmes comportements que l'hôte Node, vérifiés ici
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "parité — un battement signé côté Node est accepté, et la boucle complète tourne",
  ignore,
  async fn() {
    // ⚠️ L'en-tête est produit par le MÊME module que côté Node (`packages/domain`). Si les deux
    // runtimes divergeaient d'un bit sur le HMAC, la migration exigerait de resigner tous les
    // déclencheurs — et une divergence silencieuse ouvrirait ou fermerait le point d'entrée.
    // Une entreprise prête à travailler, montée en SQL direct : ce test vérifie l'HÔTE, pas les
    // fixtures. Ce qu'on veut prouver, c'est que la boucle complète tourne sous Deno.
    const sql = PostgresDeno.ouvrir(url as string);
    const tenantId = crypto.randomUUID();
    try {
      await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Parité Deno"]);
      await sql.query(
        `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
         select $1, p.id, 'active', now() - interval '1 day', now() + interval '29 days'
           from plan p where p.tier = 'start'`,
        [tenantId],
      );
      await sql.query(
        `insert into objective (tenant_id, metric, target_value, horizon)
         values ($1, 'rendez_vous_qualifies', 10, 'ce mois')`,
        [tenantId],
      );
      const definition = await sql.query<{ id: string }>(
        `insert into employee_definition (gisement, version, dna, capacites)
         values ('commercial', $1, $2::jsonb, '["relancer.prospect"]'::jsonb) returning id`,
        [
          Math.floor(Math.random() * 2_000_000_000),
          JSON.stringify({
            profession: "commercial",
            mission: "trouver des entreprises à qui vendre",
            perimetre: ["qualifier"],
            limites: ["comptabilité"],
          }),
        ],
      );
      const identity = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
        "commercial",
      ]);
      await sql.query(
        `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
         values ($1, $2, $3, 'confirm_once')`,
        [tenantId, definition[0]?.id, identity[0]?.id],
      );
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, 'Prospect parité', $2, 'import_client', 'qualifie')`,
        [tenantId, `parite-${crypto.randomUUID().slice(0, 8)}@exemple.fr`],
      );

      const reponse = await battre(await signHeartbeat(SECRET, new Date()));
      assertEquals(reponse.status, 200);
      const rapport = (await reponse.json()) as { traites: number; echoues: number };
      assert(typeof rapport.traites === "number", "le battement rend un compte rendu");

      // ⚠️ LA preuve : l'approvisionnement a réellement ouvert une mission, et la boucle a
      // réellement démarré un run. Le tout sous Deno, avec le MÊME code que Node.
      const missions = await sql.query<{ n: string }>(
        "select count(*) as n from task where tenant_id = $1",
        [tenantId],
      );
      assertEquals(Number(missions[0]?.n), 1);

      const journal = await sql.query<{ kind: string }>(
        "select kind from execution_event where tenant_id = $1 order by seq",
        [tenantId],
      );
      const natures = journal.map((l) => l.kind);
      assert(natures.includes("approvisionnement_ouverture"), `approvisionnement absent : ${natures}`);
      assert(natures.includes("run_demarre"), `run non démarré : ${natures}`);
    } finally {
      // ⚠️ `set_config(..., true)` est LOCAL à une transaction : hors transaction, le réglage n'a
      // aucune portée et le déclencheur du journal refuse la suppression. Même contrainte que
      // côté Node — et une preuve de plus que le schéma se comporte pareil sous les deux hôtes.
      await sql.withTransaction(async (tx) => {
        await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
        await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
        await tx.query("delete from tenant where id = $1", [tenantId]);
      });
      await sql.fermer();
    }
  },
});

Deno.test({
  name: "parité — signature invalide refusée AVANT toute écriture",
  ignore,
  async fn() {
    const sql = PostgresDeno.ouvrir(url as string);
    let avant = 0;
    try {
      const [n] = await sql.query<{ n: string }>("select count(*) as n from execution_event", []);
      avant = Number(n?.n ?? 0);
    } finally {
      await sql.fermer();
    }

    const vieux = await signHeartbeat(SECRET, new Date(Date.now() - 3_600_000));
    const autre = await signHeartbeat(SECRET_AUTRE, new Date());
    for (const entete of [null, "n'importe quoi", vieux, autre]) {
      const reponse = await battre(entete);
      assertEquals(reponse.status, 401);
      // Le refus ne dit jamais POURQUOI : distinguer « signature fausse » de « horodatage périmé »
      // n'aide que celui qui cherche à en fabriquer une valide.
      assertEquals(await reponse.json(), { erreur: "Battement refusé." });
    }

    const apres = PostgresDeno.ouvrir(url as string);
    try {
      const [n] = await apres.query<{ n: string }>("select count(*) as n from execution_event", []);
      // ⚠️ LE point : un 401 qui aurait quand même écrit serait un refus décoratif.
      assertEquals(Number(n?.n ?? 0), avant);
    } finally {
      await apres.fermer();
    }
  },
});

Deno.test({
  name: "parité — un secret absent refuse tout ; il n'ouvre pas « en attendant »",
  ignore,
  async fn() {
    for (const [cle, valeur] of Object.entries(environnement())) Deno.env.set(cle, valeur);
    Deno.env.delete("SENTIO_HEARTBEAT_SECRET");
    const reponse = await repondre(
      new Request("http://local/battement", {
        method: "POST",
        headers: { [HEARTBEAT_HEADER]: await signHeartbeat(SECRET, new Date()) },
      }),
    );
    // Configuration inexploitable : l'exécutant ne monte pas du tout.
    assertEquals(reponse.status, 500);
    assertEquals(await reponse.json(), { erreur: "Erreur interne." });
  },
});

Deno.test({
  name: "parité — un GET ne déclenche rien : un battement a un effet",
  ignore,
  async fn() {
    for (const [cle, valeur] of Object.entries(environnement())) Deno.env.set(cle, valeur);
    const reponse = await repondre(new Request("http://local/battement", { method: "GET" }));
    assertEquals(reponse.status, 405);
    await reponse.body?.cancel();
  },
});

Deno.test({
  name: "parité — aucun secret ne sort dans un message de configuration refusée",
  ignore,
  fn() {
    const secretEnClair = "mot-de-passe-tres-secret";
    try {
      monter({ ...environnement(), DATABASE_URL: `mysql://u:${secretEnClair}@h/d` });
      throw new Error("attendu un refus");
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      assert(!message.includes(secretEnClair), "un secret a fuité dans le message");
      assert(message.includes("DATABASE_URL"), "le NOM de la variable doit être cité");
    }
  },
});

Deno.test({
  name: "le pilote Deno tient le port : objets, transactions, et aucune fuite de secret",
  ignore,
  async fn() {
    const sql = PostgresDeno.ouvrir(url as string);
    try {
      // Des OBJETS, pas des tableaux : sans `queryObject`, le domaine lirait des colonnes vides.
      const lignes = await sql.query<{ un: number }>("select 1 as un", []);
      assertEquals(lignes[0]?.un, 1);

      // Les transactions : l'approvisionnement en dépend pour être atomique.
      const dans = await sql.withTransaction(async (tx) => {
        const r = await tx.query<{ deux: number }>("select 2 as deux", []);
        return r[0]?.deux;
      });
      assertEquals(dans, 2);

      // Une erreur de base ne rapporte JAMAIS sa cause : le pilote y recopie la chaîne de
      // connexion, mot de passe compris.
      let message = "";
      try {
        await sql.query("select * from table_qui_nexiste_pas", []);
      } catch (erreur) {
        message = erreur instanceof Error ? erreur.message : String(erreur);
      }
      assert(message.length > 0, "une requête invalide doit lever");
      assert(!message.includes("postgres://"), "la chaîne de connexion a fuité");
      assert(!/password|mot de passe/i.test(message), "un mot de passe a fuité");
    } finally {
      await sql.fermer();
    }
  },
});
