import { randomUUID } from "node:crypto";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { composerLeWorker } from "./composition.js";
import { demarrer } from "./main.js";
import { LONGUEUR_MINIMALE_DU_SECRET, VARIABLES, lireLaConfiguration, moteursMontesParDefaut } from "@sentio/runtime";
import { HEARTBEAT_HEADER, signHeartbeat } from "@sentio/runtime";
import { ROUTE_DU_BATTEMENT, demarrerLeServeur } from "./serveur.js";

/**
 * EXEC-18 — le worker **en tant que processus**, contre un vrai Postgres et un vrai socket.
 *
 * ⚠️ Ce que ce fichier vérifie et qu'aucun autre ne peut vérifier : que Sentio **démarre**. Les
 * autres suites appellent des fonctions ; ici on monte la racine de composition, on ouvre un port,
 * et on parle HTTP — parce que « ça compile » et « ça démarre » sont deux propriétés différentes,
 * et que la seconde ne se découvre autrement qu'en production.
 *
 * ══ LE POINT CRITIQUE ══
 *
 * La signature du battement. C'est la seule chose qui sépare ce point d'entrée d'un levier public
 * pour brûler le quota d'inférence de la plateforme. Les cas « MUTATION » l'attaquent : sans
 * en-tête, avec une signature d'un autre secret, avec un horodatage rejoué. Aucun ne doit
 * déclencher le moindre travail — et « aucun travail » se vérifie sur la BASE, pas sur le code
 * de réponse.
 */

let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

const SECRET = `secret-de-battement-${"x".repeat(LONGUEUR_MINIMALE_DU_SECRET)}`;

describeIfDatabase("EXEC-18 — le worker démarre et sert un battement signé", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];

  function environnement(surcharges: Record<string, string> = {}): Record<string, string> {
    return {
      [VARIABLES.databaseUrl]: connectionString as string,
      [VARIABLES.secret]: SECRET,
      // Une adresse qui ne répondra jamais : aucun test ne doit sortir sur le réseau. Le
      // fournisseur est là pour que la configuration soit complète, pas pour être appelé.
      [VARIABLES.principal.url]: "https://modele.invalide.exemple/v1",
      [VARIABLES.principal.modele]: "modele-de-test",
      [VARIABLES.principal.cle]: "cle-de-test",
      [VARIABLES.principal.politique]: "no_train",
      // Pas de PORT ici : `0` est refusé par la configuration, et à raison — un service qui
      // choisirait un port au hasard serait injoignable. Les tests demandent le port libre
      // directement au serveur, ce qui est le rôle de l'adaptateur d'hôte, pas de la config.
      [VARIABLES.nomDeLExecutant]: "worker-de-test",
      ...surcharges,
    };
  }

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await sql.withTransaction(async (tx) => {
        await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
        await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
        await tx.query("delete from tenant where id = $1", [tenantId]);
      });
    }
    await sql.close();
  });

  beforeEach(async () => {
    await sql.query("delete from job", []);
  });

  /** Une entreprise avec un employé et des prospects : de quoi qu'un battement ait du travail. */
  async function entreprise(prospects: number): Promise<string> {
    const tenantId = randomUUID();
    tenants.push(tenantId);
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise EXEC-18"]);
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
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, $2::jsonb, '["relancer.prospect","qualifier.prospect"]'::jsonb) returning id`,
      [
        versionUnique(),
        JSON.stringify({
          profession: "commercial",
          mission: "trouver des entreprises à qui vendre",
          perimetre: ["qualifier"],
          limites: ["comptabilité"],
        }),
      ],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
       values ($1, $2, $3, 'confirm_once') returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    // L'approvisionnement n'ouvre plus un travail qu'aucune capacité activée ne sert : sans ces
    // lignes, l'employé serait recruté sans rien pouvoir faire — et ce n'est pas ce qu'on éprouve
    // ici. En production, c'est `appliquer_la_configuration` qui les écrit.
    await sql.query(
      `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
       select $1, $2, c.id, true from capability c where c.key = 'qualifier.prospect'`,
      [tenantId, employee?.id],
    );
    for (let i = 0; i < prospects; i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Prospect ${i}`, `p${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }
    return tenantId;
  }

  async function missions(tenantId: string): Promise<number> {
    const [row] = await sql.query<{ n: string }>(
      "select count(*) as n from task where tenant_id = $1",
      [tenantId],
    );
    return Number(row?.n ?? 0);
  }

  /** Monte le worker, ouvre un port, exécute le scénario, referme tout — même en cas d'échec. */
  async function avecUnWorkerEnMarche<T>(
    env: Record<string, string>,
    scenario: (base: string) => Promise<T>,
  ): Promise<T> {
    const worker = composerLeWorker(lireLaConfiguration(env));
    const serveur = await demarrerLeServeur(worker.battement, { port: 0 });
    try {
      return await scenario(`http://127.0.0.1:${serveur.port}${ROUTE_DU_BATTEMENT}`);
    } finally {
      await serveur.arreter();
      await worker.fermer();
    }
  }

  async function battre(base: string, entete: string | null): Promise<Response> {
    return fetch(base, {
      method: "POST",
      ...(entete === null ? {} : { headers: { [HEARTBEAT_HEADER]: entete } }),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Le worker démarre et travaille
  // ═══════════════════════════════════════════════════════════════════════════

  it("démarre, accepte un battement signé, et ouvre réellement du travail", async () => {
    const tenantId = await entreprise(3);

    const rapport = await avecUnWorkerEnMarche(environnement(), async (base) => {
      const entete = await signHeartbeat(SECRET, new Date());
      const reponse = await battre(base, entete);
      expect(reponse.status).toBe(200);
      return (await reponse.json()) as { traites: number; echoues: number };
    });

    // Le battement a rendu un compte rendu exploitable par le planificateur.
    expect(rapport).toHaveProperty("traites");

    // ⚠️ La preuve est en base, pas dans la réponse : l'approvisionnement a réellement ouvert
    // les missions du jour. Le processus entier a donc tourné, de l'environnement à l'écriture.
    expect(await missions(tenantId)).toBe(3);
  });

  it("sert une seule route, et rien d'autre", async () => {
    await avecUnWorkerEnMarche(environnement(), async (base) => {
      const ailleurs = base.replace(ROUTE_DU_BATTEMENT, "/");
      expect((await fetch(ailleurs, { method: "POST" })).status).toBe(404);
      expect((await fetch(`${ailleurs}admin`, { method: "POST" })).status).toBe(404);
    });
  });

  it("refuse GET : un battement a un effet, et un préchargement n'en déclenche pas", async () => {
    // Un scanner de liens, un aperçu de messagerie ou un préchargement de navigateur ne doivent
    // pas faire travailler un employé — la mésaventure que `/auth/callback` a déjà connue.
    await avecUnWorkerEnMarche(environnement(), async (base) => {
      const entete = await signHeartbeat(SECRET, new Date());
      const reponse = await fetch(base, { method: "GET", headers: { [HEARTBEAT_HEADER]: entete } });
      expect(reponse.status).toBe(405);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MUTATIONS — attaquer le point critique : la signature
  // ═══════════════════════════════════════════════════════════════════════════

  it("MUTATION — sans en-tête, avec un faux secret, ou rejoué : refusé, et AUCUN travail", async () => {
    const tenantId = await entreprise(3);

    await avecUnWorkerEnMarche(environnement(), async (base) => {
      // Bien au-delà de la fenêtre d'acceptation : un en-tête capturé ne doit pas resservir.
      const vieux = await signHeartbeat(SECRET, new Date(Date.now() - 60 * 60 * 1000));
      const autreSecret = await signHeartbeat(
        `autre-secret-${"y".repeat(LONGUEUR_MINIMALE_DU_SECRET)}`,
        new Date(),
      );

      for (const entete of [null, "n'importe quoi", vieux, autreSecret]) {
        const reponse = await battre(base, entete);
        expect(reponse.status).toBe(401);
        // Le refus ne dit jamais POURQUOI : distinguer « signature fausse » de « horodatage
        // périmé » n'aide que celui qui cherche à en fabriquer une valide.
        expect(await reponse.json()).toEqual({ erreur: "Battement refusé." });
      }
    });

    // ⚠️ LE point : la base n'a pas bougé. Un 401 qui aurait quand même approvisionné serait un
    // refus décoratif.
    expect(await missions(tenantId)).toBe(0);
  });

  it("MUTATION — un worker sans secret configuré ne démarre pas du tout", async () => {
    // Le pire scénario : un déploiement où la variable a été oubliée. Le point d'entrée ne doit
    // pas s'ouvrir « en attendant » — il ne doit pas exister.
    const sansSecret = environnement();
    delete sansSecret[VARIABLES.secret];
    expect(() => lireLaConfiguration(sansSecret)).toThrow(/SENTIO_HEARTBEAT_SECRET/);
  });

  it("MUTATION — une rotation de secret prend effet sans redéploiement", async () => {
    // Le secret est relu à chaque appel, jamais capturé au montage. Un worker qui l'aurait figé
    // exigerait un redémarrage pour révoquer un secret compromis — c'est-à-dire au pire moment.
    const config = lireLaConfiguration(environnement());
    let secretCourant = SECRET;
    const worker = composerLeWorker({ ...config, get secretDuBattement() {
      return secretCourant;
    } } as typeof config);
    const serveur = await demarrerLeServeur(worker.battement, { port: 0 });
    try {
      const base = `http://127.0.0.1:${serveur.port}${ROUTE_DU_BATTEMENT}`;
      const ancien = await signHeartbeat(SECRET, new Date());
      expect((await battre(base, ancien)).status).toBe(200);

      secretCourant = `nouveau-secret-${"z".repeat(LONGUEUR_MINIMALE_DU_SECRET)}`;
      expect((await battre(base, ancien)).status).toBe(401);

      const neuf = await signHeartbeat(secretCourant, new Date());
      expect((await battre(base, neuf)).status).toBe(200);
    } finally {
      await serveur.arreter();
      await worker.fermer();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Frontière de confidentialité
  // ═══════════════════════════════════════════════════════════════════════════

  it("MUTATION — sans preuve d'opt-out, aucune donnée réelle ne part vers un modèle", async () => {
    // Le drapeau est fermé par défaut. Le Gateway doit alors ÉCARTER le fournisseur AVANT tout
    // appel réseau — l'adresse configurée est injoignable, donc si une requête partait malgré
    // tout, on verrait une panne réseau et non un refus de routage.
    const tenantId = await entreprise(1);

    await avecUnWorkerEnMarche(environnement(), async (base) => {
      const entete = await signHeartbeat(SECRET, new Date());
      expect((await battre(base, entete)).status).toBe(200);
    });

    const chaine = (
      await sql.query<{ kind: string }>(
        "select kind from execution_event where tenant_id = $1 order by seq",
        [tenantId],
      )
    ).map((ligne) => ligne.kind);

    // La porte s'est fermée sur une RÈGLE, pas sur une panne : « routage_refuse » est écrit, et
    // aucune proposition n'a jamais été reçue — donc rien n'est parti.
    expect(chaine).toContain("routage_refuse");
    expect(chaine).not.toContain("proposition_recue");

    // ⚠️ Et ce n'est PAS traité comme un report : un plafond se rouvre tout seul, une preuve
    // d'opt-out manquante non. Le run s'arrête et appelle une personne — c'est le comportement
    // voulu, et il est vérifié ici pour qu'il ne dérive pas en report silencieux.
    expect(chaine).toContain("attention_requise");
    const [signale] = await sql.query<{ n: string }>(
      "select count(*) as n from intervention_requise where tenant_id = $1",
      [tenantId],
    );
    expect(Number(signale?.n)).toBe(1);
  });

  it("le compte rendu du battement remonte au planificateur, incidents compris", async () => {
    await entreprise(1);
    const journal: Record<string, unknown>[] = [];

    const config = lireLaConfiguration(environnement());
    const worker = composerLeWorker(config, { log: (record) => journal.push(record) });
    try {
      const entete = await signHeartbeat(SECRET, new Date());
      const reponse = await worker.battement(
        new Request("http://worker.local/battement", {
          method: "POST",
          headers: { [HEARTBEAT_HEADER]: entete },
        }),
      );
      expect(reponse.status).toBe(200);
    } finally {
      await worker.fermer();
    }

    // Le planificateur est le seul témoin extérieur : ce qu'il lit doit suffire à voir un incident.
    expect(journal.some((ligne) => ligne["route"] === "battement")).toBe(true);
    expect(journal.some((ligne) => ligne["status"] === 200)).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Le processus lui-même
  // ═══════════════════════════════════════════════════════════════════════════

  it("le point d'entrée démarre pour de bon, et sert le battement", async () => {
    // `demarrer()` lit `process.env`, monte tout, et écoute. C'est le seul test qui exerce le
    // chemin complet du PROCESSUS — environnement compris.
    const ancien = { ...process.env };
    Object.assign(process.env, environnement(), { [VARIABLES.port]: "0" });
    // Le port 0 est refusé par la configuration : on repasse par un port réel mais libre.
    process.env[VARIABLES.port] = String(30000 + Math.floor(Math.random() * 20000));

    const serveur = await demarrer();
    try {
      expect(serveur).not.toBeNull();
      const entete = await signHeartbeat(SECRET, new Date());
      const reponse = await battre(
        `http://127.0.0.1:${serveur!.port}${ROUTE_DU_BATTEMENT}`,
        entete,
      );
      expect(reponse.status).toBe(200);
    } finally {
      await serveur?.arreter();
      for (const cle of Object.keys(process.env)) delete process.env[cle];
      Object.assign(process.env, ancien);
    }
  });

  it("le point d'entrée REFUSE de démarrer sur une configuration incomplète", async () => {
    // Un service qui s'ouvrirait « en attendant » est un service ouvert le jour où personne ne
    // regarde. Il ne doit pas écouter du tout, et le dire par son code de sortie.
    const ancien = { ...process.env };
    const sansSecret = environnement();
    delete sansSecret[VARIABLES.secret];
    for (const cle of Object.keys(process.env)) delete process.env[cle];
    Object.assign(process.env, sansSecret);

    try {
      // Rien n'écoute, et `demarrer` le dit. Le code de sortie EX_CONFIG est posé par le point
      // d'entrée du processus, pas ici : une fonction qui muterait `process.exitCode` ferait
      // échouer la suite de tests qui l'appelle.
      expect(await demarrer()).toBeNull();
    } finally {
      for (const cle of Object.keys(process.env)) delete process.env[cle];
      Object.assign(process.env, ancien);
    }
  });

  /**
   * ⚠️ CE TEST EXISTE POUR QU'UNE COLONNE NE DEVIENNE PAS UN COMMENTAIRE QUI MENT.
   *
   * `capability.disponible` dit au client et au diagnostic quelles capacités s'exécutent
   * vraiment. Cette vérité est écrite à DEUX endroits : la colonne, et la liste des moteurs
   * montés dans `composition.ts`. Deux endroits divergent — et ici la divergence serait
   * **silencieuse** : on ne la découvrirait qu'en écoutant un client s'étonner.
   *
   * Ce test rend la divergence bruyante. Monter un moteur sans le déclarer en base, ou déclarer
   * une capacité sans monter son moteur, fait échouer `pnpm run verify`.
   *
   * C'est le constat P0-3 de `docs/35-audit-avant-production.md`.
   */
  it("ce que la base annonce comme disponible est exactement ce que le code sait exécuter", async () => {
    const annoncees = (
      await sql.query<{ key: string }>(
        "select key from capability where disponible order by key",
        [],
      )
    ).map((ligne) => ligne.key);

    // Les moteurs réellement montés par défaut, demandés au code plutôt que recopiés : une liste
    // recopiée ici serait un troisième endroit à tenir à jour, donc un troisième mensonge possible.
    const montees = [...moteursMontesParDefaut(sql)].map((m) => m.capabilityKey).sort();

    expect(annoncees).toEqual(montees);
  });

});
