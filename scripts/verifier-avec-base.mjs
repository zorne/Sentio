/**
 * Tout ce qui exige une vraie base, exécuté pour de bon — jamais sauté en silence.
 *
 *     pnpm run verify:base
 *
 * ══ LE DÉFAUT QUE CE SCRIPT FERME ══
 *
 * Les suites d'intégration se désarment toutes seules quand `DATABASE_URL` est absente
 * (`describe.skip`). C'est ce qui permet à l'intégration continue de les répartir entre deux
 * travaux. Mais en local, `pnpm run verify` passait au vert en ayant sauté **152 tests** — 135
 * dans `apps/worker`, 17 dans `apps/vitrine` — soit tout le moteur : approvisionnement, boucle,
 * moteur d'autorisation, effets, suite de run, trace.
 *
 * Le vert était donc le même, la couverture non. Et `verify` s'exécute avant chaque envoi
 * (`.githooks/pre-push`) : un contrôle qui ment invalide tout ce qui s'appuie sur lui.
 *
 * Ce script rend la base OBLIGATOIRE. Sans elle, il échoue avec la marche à suivre — il ne saute
 * rien. `SENTIO_REQUIRE_DB_TESTS=1` est posé sur chaque suite, si bien qu'une suite qui tenterait
 * de se désarmer ici lèverait une erreur au lieu de se taire.
 *
 * ══ POURQUOI DEUX BASES, ET PAS UNE ══
 *
 * `apps/vitrine` porte son propre schéma et ses suites commencent par
 * `drop schema public cascade` (`src/lib/test-support/schema.ts`). Lancées sur la base du cœur,
 * elles EFFACENT le schéma que les étapes précédentes viennent de vérifier — les tests du moteur
 * échouent alors sur « relation "subscription" does not exist », ce qui ressemble à une panne du
 * moteur et n'en est pas une.
 *
 * L'intégration continue s'en protège par deux bases et un commentaire. Ici, c'est un contrôle :
 * les deux chaînes de connexion doivent différer, sinon on refuse de commencer.
 *
 * ══ CE QU'IL NE FAIT JAMAIS ══
 *
 * Toucher une base distante. Le refus porte sur les hôtes du fournisseur, comme dans
 * `supabase/tests/run.sh` et dans le garde de la vitrine — c'est la seule chose vérifiable sans
 * se connecter, et elle attrape le cas réel : une variable d'environnement laissée en place.
 */

import { execFile as execFileCallback, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Les bases jetables, surchargeables — mais jamais confondues (voir `refuserBasesIdentiques`). */
const BASE_COEUR =
  process.env["SENTIO_BASE_COEUR"] ?? "postgres://postgres@127.0.0.1:5432/sentio_test";
const BASE_VITRINE =
  process.env["SENTIO_BASE_VITRINE"] ?? "postgres://postgres@127.0.0.1:5432/vitrine_test";

// ─────────────────────────────────────────────────────────────────────────────
// Gardes — tout ce qui doit être vrai AVANT la première commande destructrice
// ─────────────────────────────────────────────────────────────────────────────

class Refus extends Error {}

/** Le même refus que `supabase/tests/run.sh` : ce script efface, il ne s'approche pas du distant. */
function refuserBaseDistante(url, nom) {
  if (/supabase\.(co|com)|pooler\.supabase/.test(url)) {
    throw new Refus(
      `${nom} désigne un projet Supabase distant.\n` +
        `   Ce script EFFACE des schémas : il ne s'exécute que sur des bases jetables.\n` +
        `   Pour le distant, c'est « supabase db push », et c'est un geste humain.`,
    );
  }
}

/**
 * Deux bases identiques ne produisent pas une erreur lisible : elles produisent un faux échec du
 * moteur, une heure après. C'est arrivé le 2026-08-15 pendant l'état des lieux — d'où ce garde.
 */
function refuserBasesIdentiques() {
  if (nomDeBase(BASE_COEUR) === nomDeBase(BASE_VITRINE)) {
    throw new Refus(
      `Le cœur et la vitrine désignent la même base (${nomDeBase(BASE_COEUR)}).\n` +
        `   Les suites de la vitrine commencent par « drop schema public cascade » : elles\n` +
        `   effaceraient le schéma du cœur, et les tests du moteur échoueraient sur une absence\n` +
        `   de table qui ressemble à une panne. Deux bases distinctes, toujours.`,
    );
  }
}

const nomDeBase = (url) => new URL(url).pathname.replace(/^\//, "");

/** Postgres absent : on le dit, avec la marche à suivre. On ne saute pas. */
async function exigerPostgres() {
  try {
    await execFile("psql", ["-d", BASE_COEUR.replace(/\/[^/]*$/, "/postgres"), "-c", "select 1"]);
  } catch (cause) {
    throw new Refus(
      `Postgres ne répond pas sur ${new URL(BASE_COEUR).host}.\n` +
        `   Ces vérifications ne sont pas facultatives : elles couvrent le moteur entier, et\n` +
        `   trois bugs réels ont déjà vécu sous une suite verte qui ne tournait que contre des\n` +
        `   doublures. Démarre Postgres, puis relance.\n` +
        `   Autres bases : SENTIO_BASE_COEUR et SENTIO_BASE_VITRINE.\n` +
        `   Cause : ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Préparation des bases
// ─────────────────────────────────────────────────────────────────────────────

const urlMaintenance = (url) => url.replace(/\/[^/]*$/, "/postgres");

async function creerSiAbsente(url) {
  const nom = nomDeBase(url);
  const { stdout } = await execFile("psql", [
    "-tA",
    "-d",
    urlMaintenance(url),
    "-c",
    `select 1 from pg_database where datname = '${nom}'`,
  ]);
  if (stdout.trim() !== "1") {
    await execFile("psql", ["-d", urlMaintenance(url), "-c", `create database "${nom}"`]);
  }
}

/**
 * Remet la base du cœur à nu. `run.sh` applique un schéma complet : rejoué sur une base qui le
 * porte déjà, il échoue sur des objets existants. On efface donc `public` ET `auth` — le stub
 * Supabase recrée le second.
 */
async function remettreANu(url) {
  await execFile("psql", [
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    url,
    "-c",
    "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;",
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exécution
// ─────────────────────────────────────────────────────────────────────────────

function lancer(commande, args, env) {
  return new Promise((tenir, rejeter) => {
    const enfant = spawn(commande, args, {
      cwd: RACINE,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    enfant.on("error", rejeter);
    enfant.on("close", (code) =>
      code === 0 ? tenir() : rejeter(new Error(`${commande} ${args.join(" ")} → code ${code}`)),
    );
  });
}

const etape = (titre) => console.log(`\n→ ${titre}`);

/** Base du cœur remise à nu, puis schéma complet et invariants rejoués depuis les migrations. */
async function preparerCoeur() {
  await remettreANu(BASE_COEUR);
  await lancer("supabase/tests/run.sh", [], { DATABASE_URL: BASE_COEUR });
}

async function principal() {
  refuserBaseDistante(BASE_COEUR, "SENTIO_BASE_COEUR");
  refuserBaseDistante(BASE_VITRINE, "SENTIO_BASE_VITRINE");
  refuserBasesIdentiques();
  await exigerPostgres();

  // Exigé par toutes les suites : une suite qui tenterait de se désarmer lèvera au lieu de sauter.
  const exigeant = { SENTIO_REQUIRE_DB_TESTS: "1" };

  await creerSiAbsente(BASE_COEUR);
  await creerSiAbsente(BASE_VITRINE);

  // ══ POURQUOI CHAQUE SUITE QUI CONSOMME LA BASE LA REÇOIT NEUVE ══
  //
  // Mesuré le 2026-08-15, sur ce test précis : « EXEC-12 — refuse une capacité que le client n'a
  // pas activée ». Zéro échec sur SEIZE exécutions quand `@sentio/worker` tourne seul sur une
  // base fraîche — y compris sous charge processeur soutenue. Deux échecs sur NEUF quand il
  // tourne au sein de l'ensemble des paquets, en parallèle comme en série.
  //
  // Le mécanisme exact n'est pas encore établi : aucun autre paquet ne se connecte à Postgres
  // pendant ses tests (`packages/db` n'a pas de client, le test de battement de
  // `packages/runtime` ne lit pas `DATABASE_URL`). La piste ouverte est l'ordre d'exécution des
  // fichiers, que vitest ajuste d'après les durées précédentes : le test n'exécute qu'UN travail
  // et suppose que c'est le sien, ce qui cesse d'être vrai si un fichier joué avant lui en a
  // laissé un autre exigible.
  //
  // On ne relance donc pas jusqu'à ce que ce soit vert — c'est exactement ce que le dépôt
  // s'interdit. On adopte la seule configuration prouvée stable, et on écrit ce qu'on sait :
  // la fragilité du test reste à corriger, elle est notée à l'étape 3 du plan
  // (`docs/29-plan-jusquau-premier-client.md`), qui rouvre justement la chaîne mission → travail.

  etape("tests — paquets qui n'ouvrent aucune connexion");
  await lancer(
    "pnpm",
    [
      "-r",
      "--filter=!@sentio/vitrine",
      "--filter=!@sentio/worker",
      "--filter=!@sentio/runtime",
      "--if-present",
      "run",
      "test",
    ],
    { ...exigeant, DATABASE_URL: BASE_COEUR },
  );

  for (const paquet of ["@sentio/runtime", "@sentio/worker"]) {
    etape(`base du cœur remise à neuf, puis ${paquet} seul`);
    await preparerCoeur();
    await lancer("pnpm", ["--filter", paquet, "run", "test"], {
      ...exigeant,
      DATABASE_URL: BASE_COEUR,
    });
  }

  // La vitrine reconstruit elle-même son schéma (`drop schema public cascade`) : elle n'a besoin
  // que d'une base à elle. C'est aussi pour ça qu'elle ne doit jamais recevoir celle du cœur.
  etape(`vitrine, sur sa base à elle (${nomDeBase(BASE_VITRINE)})`);
  await lancer("pnpm", ["--filter", "@sentio/vitrine", "run", "test"], {
    ...exigeant,
    DATABASE_URL: BASE_VITRINE,
  });

  // Les fonctions s'exécutent sous Deno. Six tests de parité — dont la boucle complète et le refus
  // d'une signature invalide AVANT toute écriture — se désarment eux aussi sans base.
  etape("fonctions sous Deno — lint, types, tests de parité compris");
  await preparerCoeur();
  await lancer("pnpm", ["run", "functions:verify"], { DATABASE_URL: BASE_COEUR });

  console.log("\n✅ vérifié contre une vraie base — rien n'a été sauté.");
}

principal().catch((erreur) => {
  if (erreur instanceof Refus) {
    console.error(`\n✋ ${erreur.message}\n`);
  } else {
    console.error(`\n❌ ${erreur.message}\n`);
  }
  process.exitCode = 1;
});
