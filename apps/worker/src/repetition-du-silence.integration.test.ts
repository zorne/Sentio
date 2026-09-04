import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import type { CapabilityEngine } from "@sentio/core";
import {
  HEARTBEAT_HEADER,
  LONGUEUR_MINIMALE_DU_SECRET,
  VARIABLES,
  lireLaConfiguration,
  signHeartbeat,
} from "@sentio/runtime";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { composerLeWorker } from "./composition.js";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import { ROUTE_DU_BATTEMENT, demarrerLeServeur } from "./serveur.js";

/**
 * ÉTAPE 8 — la répétition générale du silence.
 *
 * ══ POURQUOI CE FICHIER EXISTE ══
 *
 * On a recensé dix façons de tomber en panne sans le dire (`docs/36-fermer-le-silence.md`), et on a
 * construit des détecteurs. **Aucun n'avait jamais été déclenché.** Un système d'alarme jamais
 * éprouvé n'est pas un système d'alarme, c'est une hypothèse — et une hypothèse rassurante est
 * exactement ce que ce lot passe son temps à démonter.
 *
 * ══ LES TROIS RÈGLES DE CETTE SUITE ══
 *
 *   · **Provoqué, pas simulé.** On retire vraiment une capacité, on coupe vraiment le fournisseur,
 *     on bloque vraiment une mission. Aucun cas n'appelle directement une fonction d'alerte : ça ne
 *     prouverait rien sur la chaîne, qui est précisément ce qu'on éprouve.
 *   · **Observé de bout en bout**, là où un humain le verrait : le verdict dans la réponse rendue au
 *     planificateur, le code de sortie du workflow, la notification dans l'espace du dirigeant,
 *     l'alerte de `pnpm run surveiller`. Jamais au milieu de la chaîne.
 *   · **Un cas non couvert s'écrit non couvert**, et son absence de signal est ASSERTÉE. Le jour où
 *     quelqu'un le couvrira, ce fichier échouera et le forcera à mettre le tableau à jour. Un trou
 *     tu est un trou qui se rouvre.
 *
 * ══ CE QUE CETTE SUITE N'OBSERVE PAS, ET IL FAUT LE SAVOIR ══
 *
 * Le workflow est joué **à partir du fichier réel**, extrait au moment du test : sa logique de
 * décision ne peut donc pas diverger de ce qui tourne. Mais seule la partie DÉCISION est jouée — la
 * signature du battement, elle, est éprouvée par `composition.integration.test.ts`, qui l'attaque
 * sans en-tête, avec un autre secret et rejouée.
 *
 * ⚠️ **LE VERDICT EST GLOBAL, LES ASSERTIONS NE LE SONT PAS.** Un battement juge la flotte
 * entière : lancée avec les autres suites sur une base partagée, cette répétition verrait leurs
 * entreprises peser sur le verdict. Chaque cas assertе donc ce qui lui est ATTRIBUABLE — ses
 * motifs, son journal, ses notifications — et le verdict n'est rapporté que comme observation.
 * Le tableau de référence se lit sur une base dédiée, où rien d'autre ne tourne.
 *
 * Et l'alarme du guetteur externe ne peut pas être observée d'ici : elle vit chez healthchecks.io.
 * Ce qui est observable en local — que le ping part sur un verdict normal et ne part pas sinon —
 * l'est ; le reste est un geste humain, inscrit dans `docs/20-plan-action.md`.
 */

const executer = promisify(execFile);
const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;
const SECRET = `secret-de-battement-${"x".repeat(LONGUEUR_MINIMALE_DU_SECRET)}`;
const RACINE = join(import.meta.dirname, "..", "..", "..");

let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

/** Ce qu'un humain verrait, et rien d'autre. */
interface Observation {
  readonly verdict: string;
  readonly anomalies: readonly string[];
  readonly motifs: Readonly<Record<string, number>>;
  /** Le code de sortie du workflow. 1 = un email d'échec part chez le fondateur. */
  readonly workflow: number;
  /** Le guetteur externe a-t-il reçu son signal ? */
  readonly ping: boolean;
  /** Ce que le dirigeant lit dans son espace. */
  readonly notifications: readonly string[];
  /** Ce que `pnpm run surveiller` afficherait. */
  readonly sante: readonly string[];
  /** Le rapport d'exploitation du cycle : reprise, approvisionnement, compteur. */
  readonly rapport: Record<string, unknown>;
}

/** Une ligne du tableau rendu à la fin. */
const tableau: { cas: string; provoque: string; attendu: string; observe: string; couvert: string }[] =
  [];

function noter(
  cas: string,
  provoque: string,
  attendu: string,
  observe: string,
  couvert: "oui" | "non" | "partiel",
): void {
  tableau.push({ cas, provoque, attendu, observe, couvert });
}

describeIfDatabase("Étape 8 — la répétition générale du silence", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];
  let guetteur: Server;
  let pings = 0;
  let portDuGuetteur = 0;
  let modele: Server;
  let portDuModele = 0;
  /** Ce que le faux fournisseur répond. Changé par les cas qui coupent le modèle. */
  let humeurDuModele:
    | "propose"
    | "modele_retire"
    | "reponse_vide"
    | "sans_contenu"
    | "termine_sans_agir" = "propose";
  /** Ce que le modèle propose quand il propose. Les cas qui éprouvent les gardes le changent. */
  let capaciteProposee = "qualifier.prospect";
  let tlsInitial: string | undefined;
  let dernierRapport: Record<string, unknown> = {};

  /**
   * La partie DÉCISION du workflow, extraite du fichier réel au moment du test.
   *
   * ⚠️ Extraite, jamais recopiée. Une copie divergerait au premier ajustement, et cette suite
   * éprouverait alors un workflow qui n'existe pas — le vert le plus trompeur qui soit.
   */
  function decisionDuWorkflow(): string {
    const yml = readFileSync(join(RACINE, ".github", "workflows", "battement.yml"), "utf8");
    const debut = yml.indexOf('          case "${code}" in');
    const fin = yml.indexOf("\n", yml.lastIndexOf("          fi"));
    if (debut < 0 || fin < 0) {
      throw new Error(
        "Le bloc de décision du workflow est introuvable : ce fichier ne peut plus prouver ce " +
          "qu'il prétend prouver. Corriger l'extraction plutôt que de la contourner.",
      );
    }
    return yml
      .slice(debut, fin)
      .split("\n")
      .map((ligne) => (ligne.startsWith(" ".repeat(10)) ? ligne.slice(10) : ligne))
      .join("\n");
  }

  /**
   * La GARDE du workflow — le contrôle des secrets, extrait lui aussi du fichier réel.
   *
   * C'est la moitié du cas 5 trouvée sans rien provoquer : ce bloc sortait avec le code 0 quand un
   * secret manquait, laissant le planificateur vert pendant que Lady ne se réveillait pas.
   */
  function gardeDuWorkflow(): string {
    const yml = readFileSync(join(RACINE, ".github", "workflows", "battement.yml"), "utf8");
    const debut = yml.indexOf('          if [ -z "${URL}" ]');
    const fin = yml.indexOf("\n", yml.indexOf("          fi", debut));
    if (debut < 0 || fin < 0) throw new Error("La garde des secrets est introuvable dans le workflow.");
    return yml
      .slice(debut, fin)
      .split("\n")
      .map((ligne) => (ligne.startsWith(" ".repeat(10)) ? ligne.slice(10) : ligne))
      .join("\n");
  }

  /** Joue le workflow sur une VRAIE réponse de battement, et rend son code de sortie. */
  async function jouerLeWorkflow(corps: string, code: number): Promise<number> {
    const script = [
      "set -euo pipefail",
      `code="${code}"`,
      `corps="$(mktemp)"`,
      `cat > "\${corps}" <<'CORPS'\n${corps}\nCORPS`,
      `GUETTEUR="http://127.0.0.1:${portDuGuetteur}/jeton"`,
      decisionDuWorkflow(),
    ].join("\n");

    try {
      await executer("bash", ["-c", script]);
      return 0;
    } catch (erreur) {
      return (erreur as { code?: number }).code ?? -1;
    }
  }

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    guetteur = createServer((_, reponse) => {
      pings += 1;
      reponse.writeHead(200);
      reponse.end("OK");
    });
    await new Promise<void>((resoudre) => guetteur.listen(0, resoudre));
    portDuGuetteur = (guetteur.address() as { port: number }).port;

    // ⚠️ UN VRAI FOURNISSEUR, PAS UN BOUCHON DANS LE CODE. Il parle le dialecte réel
    // (`/chat/completions`), et c'est le VRAI adaptateur HTTP qui l'appelle. Un test qui
    // remplacerait le client du modèle ne prouverait rien sur ce que fait le produit quand un
    // fournisseur retire un modèle — c'est-à-dire sur le cas 4 précisément.
    const dossier = mkdtempSync(join(tmpdir(), "sentio-modele-"));
    const cle = join(dossier, "cle.pem");
    const cert = join(dossier, "cert.pem");
    await executer("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", cle, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1",
      "-addext", "subjectAltName=IP:127.0.0.1",
    ]);

    // ⚠️ **LA CONFIGURATION EXIGE `https://`, ET ON NE LA CONTOURNE PAS.** Une clé d'API en clair
    // sur le réseau est une clé compromise, et cette règle vaut aussi ici : c'est elle qu'on
    // éprouve en même temps que le reste. Le faux fournisseur sert donc du TLS, avec un certificat
    // auto-signé fabriqué à la volée.
    //
    // ⚠️ Et la vérification du certificat est désactivée POUR CE PROCESSUS DE TEST SEULEMENT,
    // remise en place à la fin. C'est la seule concession de ce fichier, elle est bornée à un
    // processus qui ne sort jamais sur le réseau, et elle achète la seule chose qui compte ici :
    // que ce soit le VRAI adaptateur HTTP du produit qui parle au fournisseur. Un test qui
    // remplacerait ce client ne prouverait rien sur le cas 4.
    tlsInitial = process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

    modele = createSecureServer(
      { key: readFileSync(cle), cert: readFileSync(cert) },
      (_, reponse) => {
        if (humeurDuModele === "modele_retire") {
          // Ce que renvoie réellement un fournisseur qui a retiré un modèle de son catalogue.
          reponse.writeHead(404, { "content-type": "application/json" });
          reponse.end(
            JSON.stringify({ error: { code: "model_not_found", message: "modele-de-test" } }),
          );
          return;
        }
        const contenu =
          humeurDuModele === "reponse_vide"
            ? ""
            : humeurDuModele === "termine_sans_agir"
              ? JSON.stringify({
                  action: "terminer",
                  pourquoi: "il n'y a rien à faire sur ce sujet",
                })
              : JSON.stringify({
                  action: "agir",
                  capacite: capaciteProposee,
                  entree: {},
                  pourquoi: "éprouver la chaîne de bout en bout",
                });
        reponse.writeHead(200, { "content-type": "application/json" });
        reponse.end(
          JSON.stringify(
            humeurDuModele === "sans_contenu"
              ? { choices: [] }
              : { choices: [{ message: { content: contenu } }], usage: { total_tokens: 42 } },
          ),
        );
      },
    );
    await new Promise<void>((resoudre) => modele.listen(0, resoudre));
    portDuModele = (modele.address() as { port: number }).port;

    // Le fournisseur d'essai doit exister en base : sans lui, le registre de consommation refuse
    // d'inscrire ce qu'il a coûté, et la panne ressemblerait à une panne de modèle.
    //
    // ⚠️ Et il porte une date d'opt-out : la base REFUSE d'inscrire « sans entraînement » sans
    // preuve datée (`provider_no_train_needs_proof`). Ce garde-là s'est déclenché en écrivant ce
    // fichier — il fonctionne, et il est éprouvé au passage.
    await sql.query(
      `insert into provider_credential (provider_key, data_policy, opt_out_proven_at)
       values ('principal', 'no_train', now())
       on conflict (provider_key) do nothing`,
      [],
    );
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
    await new Promise<void>((resoudre) => guetteur.close(() => resoudre()));
    await new Promise<void>((resoudre) => modele.close(() => resoudre()));
    if (tlsInitial === undefined) delete process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
    else process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = tlsInitial;

    console.log(
      "\n\n| Cas | Comment il a été provoqué | Signal attendu | Signal réellement observé | Couvert |\n" +
        "|---|---|---|---|---|\n" +
        tableau
          .map((l) => `| ${l.cas} | ${l.provoque} | ${l.attendu} | ${l.observe} | ${l.couvert} |`)
          .join("\n") +
        "\n",
    );
  });

  // ⚠️ REMIS À ZÉRO AVANT CHAQUE CAS, ET PAS SEULEMENT DANS UN `finally`. Un cas qui dépasse son
  // délai laisse son `finally` s'exécuter plus tard : l'humeur du fournisseur fuyait sur le cas
  // suivant, qui échouait pour une raison qui n'était pas la sienne.
  beforeEach(() => {
    humeurDuModele = "propose";
    capaciteProposee = "qualifier.prospect";
  });

  function environnement(surcharges: Record<string, string> = {}): Record<string, string> {
    return {
      [VARIABLES.databaseUrl]: connectionString as string,
      [VARIABLES.secret]: SECRET,
      [VARIABLES.principal.url]: "https://modele.invalide.exemple/v1",
      [VARIABLES.principal.modele]: "modele-de-test",
      [VARIABLES.principal.cle]: "cle-de-test",
      [VARIABLES.principal.politique]: "no_train",
      [VARIABLES.optOutProuve]: "true",
      [VARIABLES.classeDeDonnees]: "real",
      [VARIABLES.nomDeLExecutant]: "repetition-generale",
      ...surcharges,
    };
  }

  /** Une entreprise qui a du travail à faire, et un employé pour le faire. */
  async function entreprise(options: {
    capacites?: readonly string[];
    activees?: readonly string[];
    prospects?: number;
    configuree?: boolean;
  } = {}): Promise<{ tenantId: string; employeeId: string }> {
    const capacites = options.capacites ?? ["qualifier.prospect"];
    const activees = options.activees ?? ["qualifier.prospect"];
    const tenantId = randomUUID();
    tenants.push(tenantId);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Répétition SARL"]);
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
       values ('commercial', $1, $2::jsonb, $3::jsonb) returning id`,
      [
        versionUnique(),
        JSON.stringify({
          profession: "commercial",
          mission: "trouver des entreprises à qui vendre",
          perimetre: ["qualifier"],
          limites: ["comptabilité"],
        }),
        JSON.stringify(capacites),
      ],
    );
    const [identite] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employe] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
       values ($1, $2, $3, 'auto') returning id`,
      [tenantId, definition?.id, identite?.id],
    );
    for (const cle of activees) {
      await sql.query(
        `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
         select $1, $2, c.id, true from capability c where c.key = $3`,
        [tenantId, employe?.id, cle],
      );
    }
    for (let i = 0; i < (options.prospects ?? 1); i += 1) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Prospect ${i}`, `p${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }
    if (options.configuree === true) {
      await sql.query(
        `insert into lady_configuration
           (tenant_id, employee_id, version, role, autonomie, declencheur, raison, active)
         values ($1, $2, 1, 'commerciale', 'confirm', 'recrutement', 'recrutée pour la répétition', true)`,
        [tenantId, employe?.id],
      );
    }

    return { tenantId, employeeId: employe?.id as string };
  }

  /**
   * Un battement RÉEL : le worker monté, un vrai port ouvert, une requête HTTP signée. Puis le
   * workflow joué sur la réponse, et la base relue là où un humain regarderait.
   */
  async function battementReel(options: {
    tenantId: string;
    env?: Record<string, string>;
    moteurs?: readonly CapabilityEngine[];
    /** Le jour du battement. Le compteur compte des JOURS : trois cycles muets, trois dates. */
    maintenant?: Date;
    /** Combien de travaux ce battement prend. Un seul, quand on veut étaler sur plusieurs jours. */
    travauxMax?: number;
  }): Promise<Observation> {
    // Les travaux des autres entreprises sont repoussés, pas supprimés : ce qu'ils ont écrit reste
    // intact, ils ne disputent simplement plus le tour. Un test qui échoue au hasard ne vaut pas
    // mieux qu'un test qui ne teste rien.
    await sql.query("update job set next_run_at = now() + interval '1 hour' where tenant_id <> $1", [
      options.tenantId,
    ]);

    // ⚠️ `etat_de_sante()` regarde TOUTE la flotte : les cas précédents y ont laissé leurs traces.
    // On relève donc ce que CE cas fait apparaître, pas l'état du monde — sans quoi chaque ligne
    // du tableau hériterait des pannes de la précédente, et le tableau dirait n'importe quoi.
    const santeAvant = new Set(
      (await sql.query<{ sujet: string }>("select sujet from etat_de_sante()", [])).map(
        (s) => s.sujet,
      ),
    );
    const pingsAvant = pings;

    const config = lireLaConfiguration(options.env ?? environnement());
    const worker = composerLeWorker(config, {
      // ⚠️ Le lissage du débit du Gateway attend une trentaine de secondes entre deux appels. Un
      // cas qui en provoque dix — un modèle qui répond du vide — durerait alors cinq minutes, et
      // une répétition générale qui dure ne se répète plus. L'attente elle-même est éprouvée par
      // les tests du Gateway ; ce n'est pas ce qu'on regarde ici.
      horlogeDuGateway: { now: () => new Date(), sleep: async () => undefined },
      ...(options.maintenant !== undefined && { maintenant: () => options.maintenant as Date }),
      ...(options.travauxMax !== undefined && { travauxMaxParBattement: options.travauxMax }),
      ...(options.moteurs !== undefined && { moteursMetier: options.moteurs }),
      log: (r) => {
        if (r["route"] === "battement") dernierRapport = r;
      },
    });
    const serveur = await demarrerLeServeur(worker.battement, { port: 0 });
    let corps = "";
    let code = 0;
    try {
      const reponse = await fetch(
        `http://127.0.0.1:${serveur.port}${ROUTE_DU_BATTEMENT}`,
        {
          method: "POST",
          // ⚠️ SIGNÉ À L'INSTANT DU BATTEMENT, PAS À L'HEURE DE LA MACHINE. Les cas qui étalent
          // trois journées donnent une horloge au worker ; signer avec l'heure réelle plaçait
          // l'horodatage hors de la fenêtre de tolérance, et le battement était REFUSÉ en 401.
          // Le banc observait alors trois battements qui n'avaient jamais eu lieu, et aurait
          // rapporté « non couvert » pour un détecteur qui n'avait jamais été sollicité.
          headers: {
            [HEARTBEAT_HEADER]: await signHeartbeat(SECRET, options.maintenant ?? new Date()),
          },
        },
      );
      code = reponse.status;
      corps = await reponse.text();
    } finally {
      await serveur.arreter();
      await worker.fermer();
    }

    // ⚠️ LE BANC REFUSE D'OBSERVER UN BATTEMENT QUI N'A PAS EU LIEU. Un 401 ou un 500 ne rend pas
    // une observation « négative » : il ne rend RIEN. Sans ce garde, une signature hors fenêtre a
    // fait passer trois cas pour non couverts alors qu'aucun détecteur n'avait été sollicité —
    // exactement le vert (ou le rouge) pour la mauvaise raison que cette étape traque.
    if (code !== 200) {
      throw new Error(
        `Le battement a été refusé (${code}) : ce cas n'observe rien, et une observation vide ne ` +
          `vaut pas un constat. Corriger la provocation, jamais l'assertion. Réponse : ${corps}`,
      );
    }

    const workflow = await jouerLeWorkflow(corps, code);
    const rendu = JSON.parse(corps) as {
      verdict?: string;
      anomalies?: string[];
      motifs?: Record<string, number>;
    };

    if (process.env["SENTIO_TRACE"] === "1") {
      const incidents = await sql.query<{ d: string }>(
        `select payload->>'detail' as d from execution_event
          where tenant_id = $1 and payload->>'motif' = 'pas_interrompu' order by seq desc limit 2`,
        [options.tenantId],
      );
      for (const i of incidents) console.log("INCIDENT:", i.d);
    }

    const notifications = await sql.query<{ message: string }>(
      "select message from notification where tenant_id = $1 order by created_at",
      [options.tenantId],
    );
    const sante = await sql.query<{ sujet: string }>("select sujet from etat_de_sante()", []);

    return {
      verdict: rendu.verdict ?? "absent",
      anomalies: rendu.anomalies ?? [],
      motifs: rendu.motifs ?? {},
      workflow,
      ping: pings > pingsAvant,
      notifications: notifications.map((n) => n.message),
      sante: sante.map((s) => s.sujet).filter((sujet) => !santeAvant.has(sujet)),
      rapport: dernierRapport,
    };
  }

  /** Combien de fois cette mission a été remise en file par la reprise. */
  async function evenementDeReprise(tenantId: string, taskId: string): Promise<number> {
    const [ligne] = await sql.query<{ n: string }>(
      `select count(*) as n from execution_event
        where tenant_id = $1 and task_id = $2 and kind = 'reprise_apres_outil'`,
      [tenantId, taskId],
    );
    return Number(ligne?.n ?? 0);
  }

  /** Un moteur qui échoue définitivement — une panne franche, pas un caprice passager. */
  function moteurQuiEchoue(cle: string): CapabilityEngine {
    return {
      // ⚠️ « base », et pas un nom inventé : c'est `capability_binding.engine_key` qui désigne le
      // moteur d'une capacité pour une formule. Un moteur enregistré sous un autre nom n'est
      // jamais résolu — il ressemble alors à un moteur ABSENT, pas à un moteur qui échoue. Ce
      // fichier s'est fait prendre par ce piège en s'écrivant, et c'est instructif : les deux
      // situations se ressemblent de l'extérieur, et ce sont deux pannes différentes.
      engineKey: "base",
      capabilityKey: cle,
      execute: async () => {
        throw new Error("Le moteur refuse : panne franche et définitive.");
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Cas 4 — le fournisseur retire le modèle. DÉJÀ ARRIVÉ POUR DE VRAI.
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐ cas 4a — le modèle a été retiré du catalogue : 404 à chaque appel", async () => {
    // ⚠️ PROVOQUÉ SUR LE VRAI CHEMIN RÉSEAU. Le faux fournisseur répond ce que répond un vrai
    // fournisseur qui a retiré un modèle — 404 `model_not_found` — et c'est l'adaptateur HTTP du
    // produit qui l'appelle, pas un bouchon posé à sa place.
    const { tenantId } = await entreprise();
    humeurDuModele = "modele_retire";
    try {
      const observation = await battementReel({
        tenantId,
        env: environnement({ [VARIABLES.principal.url]: `https://127.0.0.1:${portDuModele}/v1` }),
      });

      expect(observation.verdict).toBe("anormal");
      expect(observation.workflow).toBe(1);
      expect(observation.ping).toBe(false);

      noter(
        "4a — modèle retiré par le fournisseur",
        "un vrai fournisseur HTTP qui répond 404 `model_not_found` à chaque appel",
        "verdict `anormal`, workflow en échec, aucun ping",
        `motifs \`${JSON.stringify(observation.motifs)}\`, verdict \`${observation.verdict}\` (${observation.anomalies.join(", ")}), workflow **${observation.workflow}**, aucun ping`,
        "oui",
      );
    } finally {
      humeurDuModele = "propose";
    }
  }, 60_000);

  it("⭐ cas 4b — le modèle répond, mais ne dit rien", async () => {
    // La panne la plus sournoise des deux : le fournisseur répond 200, et le contenu est vide. Rien
    // n'échoue au sens réseau — il faut que quelque chose, plus haut, refuse de prendre ce silence
    // pour une réponse.
    const { tenantId } = await entreprise();
    humeurDuModele = "reponse_vide";
    try {
      const observation = await battementReel({
        tenantId,
        env: environnement({ [VARIABLES.principal.url]: `https://127.0.0.1:${portDuModele}/v1` }),
      });

      noter(
        "4b — le modèle répond 200 avec un contenu vide",
        "un vrai fournisseur HTTP qui répond `{choices:[{message:{content:\"\"}}]}`",
        "verdict `anormal`, workflow en échec",
        `motifs \`${JSON.stringify(observation.motifs)}\` — les mêmes qu'avant, et ils veulent toujours dire « ça avance » — mais \`sansAction\` les dément : verdict \`${observation.verdict}\` (${observation.anomalies.join(", ") || "aucune"}), workflow **${observation.workflow}**, aucun ping`,
        observation.verdict === "anormal" ? "oui" : "non",
      );

      // ⚠️ CE CAS ÉTAIT LE TROU LE PLUS GRAVE DE LA RÉPÉTITION, ET IL EST FERMÉ.
      //
      // Il l'est par une règle GÉNÉRALE, et pas par un correctif visant `proposition_illisible` :
      // « un run qui consomme son budget sans une seule action exécutée a payé sans rien
      // produire ». Les motifs sont inchangés — `pas_suivant` et `budget_epuise` veulent toujours
      // dire « des pas ont eu lieu », et c'est vrai. Ce qui change, c'est qu'on ne confond plus
      // le geste mécanique (faire avancer le pas) avec le jugement (compter que du travail a
      // avancé).
      expect(observation.motifs["pas_suivant"]).toBeGreaterThan(0);
      expect(observation.motifs["budget_epuise"]).toBeGreaterThan(0);
      expect(observation.anomalies).toContain("run_sans_action");
      expect(observation.verdict).toBe("anormal");
      expect(observation.workflow).toBe(1);
      expect(observation.ping).toBe(false);
    } finally {
      humeurDuModele = "propose";
    }
  }, 300_000);

  it("⭐ cas 4c — le modèle conclut toujours « rien à faire », et n'agit jamais", async () => {
    // ⚠️ LA VARIANTE QUE LA RÈGLE GÉNÉRALE DEVAIT ATTRAPER, ET QU'ON N'AVAIT PAS IMAGINÉE. Le
    // modèle répond parfaitement : un JSON lisible, une action « terminer », un motif. Chaque run
    // se referme sur `travail_acheve` — un motif qui veut dire « le travail a avancé ». Rien n'est
    // jamais exécuté.
    //
    // ⚠️ **PRIS ISOLÉMENT, C'EST LÉGITIME** : une mission ouverte sur un sujet qui s'avère ne rien
    // exiger, c'est un jugement rendu, pas une panne. C'est la RÉPÉTITION qui fait le signal, et
    // c'est le compteur qui la mesure — le mécanisme de `garde_du_silence`, pas un second.
    const { tenantId } = await entreprise({ prospects: 4 });
    humeurDuModele = "termine_sans_agir";
    const env = environnement({
      [VARIABLES.principal.url]: `https://127.0.0.1:${portDuModele}/v1`,
    });

    let observation = await battementReel({
      tenantId,
      env,
      maintenant: new Date("2026-09-07T06:00:00.000Z"),
      travauxMax: 1,
    });
    for (const jour of ["2026-09-08T06:00:00.000Z", "2026-09-09T06:00:00.000Z"]) {
      observation = await battementReel({
        tenantId,
        env,
        maintenant: new Date(jour),
        travauxMax: 1,
      });
    }

    const compteur = observation.rapport["compteur"] as { aNotreCharge: number };

    noter(
      "4c — le modèle conclut toujours « rien à faire »",
      "un fournisseur qui répond un `terminer` parfaitement lisible, trois journées de suite",
      "un cycle isolé reste normal ; la répétition devient anormale",
      `motifs \`${JSON.stringify(observation.motifs)}\` — un « terminé » à chaque fois — mais zéro action exécutée : le compteur le retient (\`aNotreCharge: ${compteur.aNotreCharge}\`) et le verdict devient \`${observation.verdict}\` (${observation.anomalies.join(", ") || "aucune"}), workflow **${observation.workflow}**`,
      observation.verdict === "anormal" ? "oui" : "non",
    );

    // Le motif dit « terminé », et pourtant le cycle est compté muet : c'est exactement ce que la
    // règle du taux devait produire.
    expect(observation.motifs["travail_acheve"]).toBeGreaterThan(0);
    expect(compteur.aNotreCharge).toBeGreaterThan(0);
    expect(observation.anomalies).toContain("travail_bloque_chez_nous");
    expect(observation.verdict).toBe("anormal");
    expect(observation.workflow).toBe(1);

    // ⚠️ ET LE DIRIGEANT N'EN SAIT RIEN, à raison : il ne peut rien y faire. C'est notre chaîne qui
    // tourne à vide, et le canal client doit rester silencieux.
    expect(observation.notifications).toHaveLength(0);
  }, 60_000);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Cas 5 — le battement ne part plus. DÉJÀ ARRIVÉ POUR DE VRAI, ET EN DEUX MOITIÉS.
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐ cas 5a — un secret manque : le planificateur ne peut plus sortir en vert", async () => {
    // ⚠️ C'est la garde RÉELLE du workflow, extraite du fichier, jouée avec des secrets vides.
    // Avant ce lot, elle sortait avec le code 0 : un interrupteur silencieux.
    const script = ["set -euo pipefail", 'URL=""', 'SECRET=""', gardeDuWorkflow()].join("\n");
    let code = 0;
    try {
      await executer("bash", ["-c", script]);
    } catch (erreur) {
      code = (erreur as { code?: number }).code ?? -1;
    }

    expect(code).toBe(1);

    noter(
      "5a — le battement ne part plus : un secret manque",
      "la garde réelle du workflow, extraite du fichier, jouée avec `URL` et `SECRET` vides",
      "le workflow échoue, donc un email part chez le fondateur",
      `code de sortie **${code}**, message \`::error::Battement NON CONFIGURÉ\``,
      "oui",
    );
  }, 60_000);

  it("⭐ cas 5b — le planificateur ne s'exécute plus du tout", async () => {
    // ⚠️ LA PANNE QUI NE PRODUIT AUCUN SIGNAL PAR ELLE-MÊME. GitHub désactive un `schedule` après
    // 60 jours sans activité : il ne reste alors AUCUN workflow pour échouer. Seule une trace qui
    // périme peut le voir.
    const { tenantId } = await entreprise();
    await battementReel({ tenantId });

    // Le battement vient de passer : la surveillance se tait.
    const fraiche = await sql.query(
      "select 1 from etat_de_sante() where sujet = 'battement absent'",
      [],
    );
    expect(fraiche).toHaveLength(0);

    // Trois heures sans battement — le planificateur s'est tu.
    await sql.query("update dernier_battement set passe_le = now() - interval '3 hours'", []);
    const perimee = await sql.query<{ detail: string; mesure: string }>(
      "select detail, mesure from etat_de_sante() where sujet = 'battement absent'",
      [],
    );
    expect(perimee).toHaveLength(1);

    noter(
      "5b — le planificateur ne s'exécute plus du tout",
      "un battement réel, puis sa trace de fraîcheur vieillie de trois heures",
      "`pnpm run surveiller` alerte ; le guetteur externe s'alarme faute de signal",
      `alerte « battement absent » à ${perimee[0]?.mesure} minutes ; l'alarme du guetteur externe, elle, vit chez healthchecks.io et **n'a pas pu être observée d'ici**`,
      "partiel",
    );
  }, 60_000);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Cas 6 — aucun fournisseur conforme. C'EST L'ÉTAT EXACT DE LA PRODUCTION.
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐ cas 6a — aucun fournisseur conforme : la requête ne part pas, et ça s'entend", async () => {
    // ⚠️ PROVOQUÉ, PAS SIMULÉ. On déclare l'opt-out NON prouvé — la vérité d'aujourd'hui — et le
    // Gateway écarte tous les fournisseurs pour une donnée réelle.
    //
    // ⚠️ ET LE RÉSULTAT N'EST PAS CELUI QU'ON ATTENDAIT. `NonCompliantRouting` n'est PAS un report :
    // `issueDepuisErreur` le laisse remonter délibérément, il traverse la boucle en exception et
    // atterrit dans `echoues`. Ce cas était donc déjà visible avant ce lot — ce n'est pas lui qui
    // produisait `{traites:10, echoues:0}`. Voir le cas 6b, qui le produit vraiment.
    const { tenantId } = await entreprise({ prospects: 2 });
    const observation = await battementReel({
      tenantId,
      env: environnement({ [VARIABLES.optOutProuve]: "false" }),
    });

    expect(observation.anomalies).toContain("travaux_echoues");
    expect(observation.verdict).toBe("anormal");
    expect(observation.workflow).toBe(1);
    expect(observation.ping).toBe(false);

    noter(
      "6a — aucun fournisseur conforme",
      "`SENTIO_OPT_OUT_PROUVE=false` sur une donnée réelle : le Gateway écarte tous les fournisseurs",
      "verdict `anormal`, workflow en échec, aucun ping",
      `\`NonCompliantRouting\` remonte en exception : ${JSON.stringify(observation.motifs)} + échecs, verdict \`anormal\` (${observation.anomalies.join(", ")}), workflow **1**, aucun ping`,
      "oui",
    );
  }, 60_000);

  it("⭐ cas 6b — plafond atteint : LE rapport rassurant et faux, enfin déclenché", async () => {
    // ⚠️ C'EST LE CAS QUI A OUVERT TOUT LE LOT, ET IL EST ICI PROVOQUÉ POUR DE VRAI.
    //
    // Le plafond d'inférence de l'entreprise est atteint : le Gateway REPORTE (`TaskDeferred`),
    // ce qui n'est pas une erreur. Le pas ne lève donc rien, `traites` s'incrémente, et l'ancien
    // compte rendu annonçait `{traites:N, echoues:0}` — un travail qui n'a pas eu lieu.
    const { tenantId } = await entreprise({ prospects: 2 });
    await sql.query(
      `insert into usage_counter (tenant_id, metric, period_start, period_end, value)
       select $1, 'inference_tokens_per_day', date_trunc('day', now()), date_trunc('day', now()) + interval '1 day',
              q.quota_limit + 1
         from plan_quota q join plan p on p.id = q.plan_id
        where p.tier = 'start' and q.metric = 'inference_tokens_per_day'`,
      [tenantId],
    );

    const observation = await battementReel({ tenantId });

    // La preuve que le défaut est bien celui qu'on décrivait : des travaux « traités », aucun
    // échec, et pourtant rien n'a avancé.
    expect(observation.motifs["report_de_quota"]).toBeGreaterThan(0);
    expect(observation.anomalies).not.toContain("travaux_echoues");
    expect(observation.verdict).toBe("anormal");
    expect(observation.anomalies).toContain("rien_n_a_abouti");
    expect(observation.workflow).toBe(1);
    expect(observation.ping).toBe(false);

    noter(
      "6b — plafond d'entreprise atteint (`TaskDeferred`)",
      "`usage_counter` poussé au-dessus du quota d'inférence de la formule",
      "verdict `anormal` malgré `echoues: 0`, workflow en échec, aucun ping",
      `motifs \`${JSON.stringify(observation.motifs)}\` sans aucun échec, verdict \`anormal\` (${observation.anomalies.join(", ")}), workflow **1**, aucun ping`,
      "oui",
    );
  }, 60_000);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Cas 2 — une capacité activée qu'aucun moteur ne sert
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐ cas 2 — capacité activée sans moteur : une attente, et elle est dite", async () => {
    // Le dirigeant a activé « écrire à un prospect ». Aucun moteur ne la sert — c'est l'état réel
    // de la composition, qui ne monte pas les moteurs d'envoi. Rien n'est cassé : il MANQUE
    // quelque chose, et c'est nous qui pouvons le fournir.
    const { tenantId } = await entreprise({
      capacites: ["envoyer.prospect"],
      activees: ["envoyer.prospect"],
    });
    const observation = await battementReel({ tenantId });

    expect(observation.motifs["capacite_absente"]).toBeGreaterThan(0);
    expect(observation.verdict).toBe("anormal");
    expect(observation.workflow).toBe(1);

    // ⚠️ ET AUCUNE NOTIFICATION AU DIRIGEANT : monter un moteur est un déploiement, donc notre
    // travail. Lui demander de l'activer l'enverrait chercher un bouton qui n'existe pas.
    expect(observation.notifications).toHaveLength(0);

    const [journal] = await sql.query<{ payload: Record<string, unknown> }>(
      `select payload from execution_event
        where tenant_id = $1 and kind = 'attention_requise' order by seq desc limit 1`,
      [tenantId],
    );
    expect(journal?.payload["cause"]).toBe("moteur_non_monte");

    noter(
      "2 — capacité activée sans moteur",
      "`envoyer.prospect` activée, aucun moteur monté pour la servir",
      "mission en attente et non en échec, verdict `anormal`, RIEN chez le dirigeant",
      "mission `needs_attention` avec cause `moteur_non_monte`, verdict `anormal`, workflow **1**, aucune notification",
      "oui",
    );
  }, 60_000);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Cas 1 — un run qui échoue pour de bon
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Cas 3, 8 et 10 — la mission qu'aucun outil ne sert : écartée, dite, puis reprise
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐ cas 3 — aucun outil activé : rien ne s'ouvre, et le dirigeant l'apprend", async () => {
    // ⚠️ LE CAS LE PLUS DIFFÉRENT DE TOUS. Il n'y a pas de mission bloquée : il n'y a pas de
    // mission du tout. Tous les autres détecteurs raisonnent sur du travail COMMENCÉ, et celui-ci
    // n'a jamais commencé. C'est pourtant la promesse même du produit — « elle demande de l'aide
    // uniquement quand une limite réelle l'en empêche » — et une limite réelle l'en empêche.
    const { tenantId } = await entreprise({
      capacites: ["qualifier.prospect", "envoyer.prospect"],
      activees: [],
    });

    let observation = await battementReel({
      tenantId,
      maintenant: new Date("2026-09-07T06:00:00.000Z"),
    });
    for (const jour of ["2026-09-08T06:00:00.000Z", "2026-09-09T06:00:00.000Z"]) {
      observation = await battementReel({ tenantId, maintenant: new Date(jour) });
    }

    const [ouvertes] = await sql.query<{ n: string }>(
      "select count(*) as n from task where tenant_id = $1",
      [tenantId],
    );
    expect(Number(ouvertes?.n)).toBe(0);

    noter(
      "3 — travail écarté faute de capacité",
      "un employé recruté sans aucun outil activé, sur trois journées : l'approvisionnement n'ouvre rien",
      "le dirigeant apprend qu'il lui manque un outil",
      observation.notifications.length > 0
        ? `aucune mission ouverte, et pourtant une notification : « ${observation.notifications[0]?.slice(0, 95)}… »`
        : "aucune mission ouverte, et aucune notification",
      observation.notifications.length > 0 ? "oui" : "non",
    );

    // ⚠️ Aucune mission n'existe, et le dirigeant est prévenu quand même. C'est la matière
    // première que `justification.ecartes` journalisait depuis `451780c` en attendant un
    // mécanisme : « écrit dès maintenant, parce que le reconstituer après coup coûterait
    // l'historique ». Le mécanisme est là.
    expect(observation.notifications.length).toBeGreaterThan(0);
    expect(observation.notifications[0]).toContain("activer");
  }, 60_000);

  it("⭐ cas 8 — une mission bloquée trois jours : le dirigeant est prévenu, lui", async () => {
    // ⚠️ TROIS JOURS PROVOQUÉS, PAS UN COMPTEUR POUSSÉ À LA MAIN. Trois battements réels, aux
    // dates de trois journées consécutives : le compteur avance d'un cran par jour, et c'est au
    // troisième que le canal s'ouvre.
    const { tenantId, employeeId } = await entreprise({
      capacites: ["envoyer.prospect", "qualifier.prospect"],
      activees: ["qualifier.prospect"],
      prospects: 4,
    });

    // ⚠️ L'ORDRE EST LE SCÉNARIO, ET IL EST RÉEL. Les missions s'ouvrent d'abord — un outil était
    // activé — puis le dirigeant le retire. C'est ainsi qu'une mission se retrouve sans aucun
    // outil applicable : pas par une entreprise mal née, mais par un réglage changé en cours de
    // route. Retirer l'outil AVANT n'ouvrirait rien du tout, et ce serait le cas 3.
    await battementReel({
      tenantId,
      maintenant: new Date("2026-09-07T06:00:00.000Z"),
      travauxMax: 1,
    });
    await sql.query("update employee_capability set enabled = false where tenant_id = $1", [
      tenantId,
    ]);

    let observation = await battementReel({
      tenantId,
      maintenant: new Date("2026-09-08T06:00:00.000Z"),
      travauxMax: 1,
    });
    for (const jour of ["2026-09-09T06:00:00.000Z", "2026-09-10T06:00:00.000Z"]) {
      observation = await battementReel({
        tenantId,
        maintenant: new Date(jour),
        travauxMax: 1,
      });
    }

    const [compteur] = await sql.query<{ cycles: number; cause: string; prevenu: boolean }>(
      `select cycles, derniere_cause as cause, prevenu_le is not null as prevenu
         from travail_muet where tenant_id = $1`,
      [tenantId],
    );
    const activables = await sql.query<{ cle: string }>(
      "select cle from capacites_activables($1, $2)",
      [tenantId, employeeId],
    );

    noter(
      "8 — blocage `needs_attention` qui draine le vivier",
      "trois battements réels, sur trois journées, avec la seule capacité applicable désactivée",
      "une notification chez le dirigeant, nommant l'outil à activer",
      observation.notifications.length > 0
        ? `notification reçue : « ${observation.notifications[0]?.slice(0, 100)}… »`
        : `aucune notification ; compteur = ${JSON.stringify(compteur)} ; activables = ${activables.map((a) => a.cle).join(", ") || "aucune"}`,
      observation.notifications.length > 0 ? "oui" : "non",
    );

    expect(observation.notifications.length).toBeGreaterThan(0);
    expect(observation.notifications[0]).toContain("Écrire à un prospect");
  }, 60_000);

  it("⭐ cas 10 — l'outil arrive : la mission bloquée repart d'elle-même", async () => {
    // Avant l'étape 3, une mission mise de côté n'y revenait JAMAIS, et son prospect était exclu du
    // vivier pour toujours. On bloque, puis on active — et on regarde si elle repart.
    const { tenantId } = await entreprise({
      capacites: ["envoyer.prospect", "qualifier.prospect"],
      activees: ["qualifier.prospect"],
      prospects: 2,
    });
    // Les missions s'ouvrent tant que l'outil est là, puis il disparaît.
    await battementReel({ tenantId, travauxMax: 1 });
    await sql.query("update employee_capability set enabled = false where tenant_id = $1", [
      tenantId,
    ]);
    await battementReel({ tenantId, travauxMax: 1 });

    // ⚠️ ON SUIT UNE MISSION, PAS UN DÉCOMPTE. Un compte global bougeait pour d'autres raisons —
    // une seconde mission se bloquait pendant qu'une première repartait — et le cas concluait
    // « non couvert » alors que la reprise avait parfaitement fonctionné.
    const [bloquee] = await sql.query<{ id: string }>(
      `select id from task where tenant_id = $1 and state = 'needs_attention'
        order by created_at limit 1`,
      [tenantId],
    );
    expect(bloquee, "aucune mission bloquée : la provocation n'a pas eu lieu").toBeDefined();

    const [arret] = await sql.query<{ payload: Record<string, unknown> }>(
      `select payload from execution_event
        where tenant_id = $1 and task_id = $2 and kind = 'attention_requise'
        order by seq desc limit 1`,
      [tenantId, bloquee?.id],
    );
    // La mission est bien arrêtée pour la raison qu'on croit : sans ce contrôle, ce cas pourrait
    // observer une mission bloquée pour une tout autre cause et en tirer une conclusion fausse.
    expect(arret?.payload["motif"]).toBe("capacite_absente");
    expect(arret?.payload["cause"]).toBe("capacite_non_activee");

    // Le dirigeant active l'outil. Rien d'autre.
    await sql.query("update employee_capability set enabled = true where tenant_id = $1", [
      tenantId,
    ]);

    // ⚠️ La reprise est BORNÉE par cycle et regarde toute la flotte : les missions bloquées des
    // cas précédents peuvent occuper le passage. On rebat jusqu'à ce que NOTRE mission ait été
    // reprise, plutôt que de supposer qu'un seul cycle suffit — sans quoi ce cas conclurait au
    // hasard, selon ce que les autres cas ont laissé derrière eux.
    // ⚠️ AUCUNE BORNE RELEVÉE ICI, ET C'EST LE POINT. La borne de production
    // (`reprisesMaxParCycle: 5`) affamait cette mission : la reprise servait les N plus anciennes
    // TOUTES ENTREPRISES CONFONDUES, et une mission dont la cause ne disparaît jamais restait en
    // tête pour toujours. Elle est désormais par entreprise — ce cas passe donc avec les réglages
    // réels, et c'est ce qui le rend probant.
    await battementReel({ tenantId });
    let reprise = await evenementDeReprise(tenantId, bloquee?.id as string);
    for (let essai = 0; essai < 3 && reprise === 0; essai += 1) {
      await battementReel({ tenantId });
      reprise = await evenementDeReprise(tenantId, bloquee?.id as string);
    }
    expect(reprise, "la mission n'a jamais été reprise : la provocation n'a pas eu lieu").toBeGreaterThan(0);

    const [apres] = await sql.query<{ state: string }>(
      "select state from task where tenant_id = $1 and id = $2",
      [tenantId, bloquee?.id],
    );

    noter(
      "10 — la reprise après qu'un outil apparaît",
      "une mission bloquée faute d'outil, puis l'outil activé, puis un second battement",
      "la mission retourne en file sans qu'on ait touché à elle",
      `avec les réglages RÉELS : la mission est reprise (\`reprise_apres_outil\` au journal) et repart pour de bon — elle passe à \`${apres?.state}\`. La borne est désormais par entreprise, et la machine à états connaît l'événement de reprise`,
      apres?.state !== "needs_attention" ? "oui" : "non",
    );

    // ⚠️ CE CAS A TROUVÉ DEUX DÉFAUTS, ET IL LES GARDE TOUS LES DEUX FERMÉS.
    //
    // La reprise remettait bien la mission en file, puis la boucle la reprenait, relisait le
    // journal — dont le dernier événement est `reprise_apres_outil`, que `reconstruireEtatRun` ne
    // connaissait pas — et retombait sur `attention_requise`. `peutReprendre` refusait, et la
    // mission revenait exactement d'où elle venait. L'étape 3 passait son test unitaire et ne
    // fonctionnait pas de bout en bout : le test éprouvait le module, jamais la boucle qui le suit.
    expect(apres?.state).not.toBe("needs_attention");
  }, 60_000);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Cas 7 et 9 — les silences internes
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("⭐ cas 7 — la réévaluation se tait, et personne ne l'entend", async () => {
    // Une Lady configurée, donc examinée par la réévaluation. Elle n'a rien mesuré : la
    // réévaluation se tait, et compte son silence. Reste à savoir si ce compte atteint quelqu'un.
    const { tenantId } = await entreprise({ configuree: true, prospects: 0 });
    const observation = await battementReel({ tenantId });

    const [silence] = await sql.query<{ payload: Record<string, unknown> }>(
      `select payload from execution_event
        where tenant_id = $1 and kind = 'reevaluation_sans_suite' order by seq desc limit 1`,
      [tenantId],
    );

    noter(
      "7 — réévaluation muette",
      "une Lady configurée, réévaluée sans rien à mesurer",
      "le silence remonte quelque part où on le lit",
      silence === undefined
        ? "aucun événement de réévaluation"
        : `silence journalisé (\`${String(silence.payload["raison"])}\`) et compté dans le rapport, mais AUCUN consommateur : le verdict ne prend pas les silences en entrée, et le compte rendu rendu au planificateur ne les porte pas`,
      "non",
    );

    // ⚠️ ASSERTION SUR CE QUI EST. Le silence est journalisé et compté dans le rapport
    // d'exploitation ; RIEN ne le lit. Le jour où le verdict prendra les silences en entrée,
    // cette assertion tombera — et c'est le but.
    expect(silence).toBeDefined();
    const reevaluation = observation.rapport["reevaluation"] as { silences: Record<string, number> };
    expect(Object.values(reevaluation.silences).some((n) => n > 0)).toBe(true);
    expect(observation.anomalies.some((a) => a.includes("reevaluation"))).toBe(false);
  }, 60_000);

  it("⭐ cas 9 — deux refus de politique, et on doit pouvoir les distinguer", async () => {
    // Le modèle propose une capacité qu'il n'aurait pas dû voir. Deux raisons possibles, et elles
    // n'appellent pas la même réparation : le dirigeant ne l'a pas activée, ou aucun moteur ne la
    // sert. Elles écrivaient le même `politique_refuse`, indiscernable.
    const { tenantId } = await entreprise({
      capacites: ["qualifier.prospect", "envoyer.prospect"],
      activees: ["qualifier.prospect"],
    });
    capaciteProposee = "envoyer.prospect";
    const observation = await battementReel({
      tenantId,
      env: environnement({ [VARIABLES.principal.url]: `https://127.0.0.1:${portDuModele}/v1` }),
    });

    const refus = await sql.query<{ payload: Record<string, unknown> }>(
      `select payload from execution_event
        where tenant_id = $1 and kind = 'politique_refuse' order by seq desc limit 2`,
      [tenantId],
    );

    noter(
      "9 — deux gardes, un seul `politique_refuse`",
      "le modèle propose `envoyer.prospect`, activée pour personne et servie par aucun moteur",
      "le refus dit LAQUELLE des deux raisons s'applique",
      refus.length === 0
        ? `aucun refus de politique : la capacité n'a même pas été proposable (motifs \`${JSON.stringify(observation.motifs)}\`)`
        : `refus journalisé avec sa cause : \`${String(refus[0]?.payload["cause"])}\`, et sa raison lisible`,
      refus.length > 0 && refus[0]?.payload["cause"] !== undefined ? "oui" : "non",
    );

    // ⚠️ LES DEUX GARDES SE DISTINGUENT MAINTENANT. `decideNextAction` appelle `policy.refuse`
    // depuis deux endroits — « hors de la liste autorisée » et « capacité inconnue du registre » —
    // et chacune nomme désormais sa cause. Tant que ce n'était pas le cas, aucune alerte fondée
    // sur le journal ne pouvait distinguer ce qui relève du dirigeant de ce qui relève de nous.
    expect(refus.length).toBeGreaterThan(0);
    expect(refus[0]?.payload["cause"]).toBe("hors_du_perimetre");
    expect(String(refus[0]?.payload["raison"])).toContain("périmètre");
  }, 60_000);

  it("⭐ cas 1 — un run échoue : le verdict le dit, et la surveillance aussi", async () => {
    // Un moteur qui lève. Pas un plafond, pas un manque : une panne franche au moment d'agir.
    const { tenantId } = await entreprise();
    const observation = await battementReel({
      tenantId,
      env: environnement({ [VARIABLES.principal.url]: `https://127.0.0.1:${portDuModele}/v1` }),
      moteurs: [moteurQuiEchoue("qualifier.prospect")],
    });

    expect(observation.motifs["echec_definitif"]).toBeGreaterThan(0);
    expect(observation.verdict).toBe("anormal");
    expect(observation.workflow).toBe(1);

    noter(
      "1 — un run échoue",
      "un moteur qui lève une erreur franche au moment d'agir",
      "verdict `anormal`, workflow en échec, « missions en échec » à la surveillance",
      `motifs \`${JSON.stringify(observation.motifs)}\`, verdict \`anormal\` (${observation.anomalies.join(", ")}), workflow **1**, santé : ${observation.sante.join(", ") || "rien"}`,
      "oui",
    );
  }, 60_000);
});
