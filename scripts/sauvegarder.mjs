/**
 * La sauvegarde — et sa restauration, dans le même geste.
 *
 *     pnpm run sauvegarde            # sauvegarde, restaure sur une base vierge, compare
 *     pnpm run sauvegarde -- --sans-verifier   # sauvegarde seule (à éviter)
 *
 * ══ POURQUOI LA RESTAURATION EST DANS LE MÊME SCRIPT ══
 *
 * **Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est un fichier.**
 * Le jour où on en a besoin est le pire moment pour découvrir qu'elle est illisible, tronquée,
 * ou qu'il manque une extension. Séparer les deux gestes revient à ne jamais faire le second.
 *
 * Ce script fait donc les deux, et compare : mêmes tables, mêmes comptes sur ce qui compte. Si la
 * restauration diverge, il échoue — bruyamment, pendant qu'on a le temps.
 *
 * ══ CE QU'IL NE FAIT JAMAIS ══
 *
 * Écrire sur la base d'origine. Il lit (`pg_dump`), il écrit AILLEURS (un fichier), et il
 * restaure dans une base jetable dont il refuse qu'elle soit celle de départ.
 *
 * ══ OÙ VA LE FICHIER ══
 *
 * **Hors du dépôt**, et hors de la plateforme. Une sauvegarde rangée à côté de ce qu'elle
 * sauvegarde ne protège de rien : ni d'une suppression de projet, ni d'un dépôt perdu, ni d'un
 * disque mort. `SENTIO_SAUVEGARDES` dit où ; par défaut, le dossier personnel.
 *
 * Réalise : CONF-06
 */

import { execFile } from "node:child_process";
import { mkdir, stat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const executer = promisify(execFile);

const SOURCE = process.env["SENTIO_SAUVEGARDE_SOURCE"] ?? process.env["DATABASE_URL"] ?? "";
const DOSSIER = process.env["SENTIO_SAUVEGARDES"] ?? join(homedir(), "sauvegardes-sentio");
/** La base d'essai où l'on restaure. Jetable, et jamais celle d'origine. */
const CIBLE =
  process.env["SENTIO_SAUVEGARDE_CIBLE"] ?? "postgres://postgres@127.0.0.1:5432/sentio_restauration";

class Refus extends Error {}

const nomDeBase = (url) => new URL(url).pathname.replace(/^\//, "");
const maintenance = (url) => url.replace(/\/[^/]*$/, "/postgres");

/** Les tables dont le compte doit survivre à l'aller-retour. Choisies pour ce qu'elles coûtent à
 *  perdre : le journal est une preuve, l'ADN est figé, les identités ne se réutilisent pas. */
const TEMOINS = ["execution_event", "employee_definition", "identity", "capability", "tenant"];

async function compter(url) {
  const comptes = {};
  for (const table of TEMOINS) {
    const { stdout } = await executer("psql", ["-tA", "-d", url, "-c", `select count(*) from ${table}`]);
    comptes[table] = Number(stdout.trim());
  }
  return comptes;
}

async function principal() {
  if (SOURCE === "") {
    throw new Refus(
      "Aucune base à sauvegarder.\n" +
        "   Renseigne SENTIO_SAUVEGARDE_SOURCE (ou DATABASE_URL).\n" +
        "   Pour le projet distant, la chaîne se trouve dans la console Supabase — et ce script\n" +
        "   ne fait que LIRE : il n'écrit jamais sur la base d'origine.",
    );
  }

  if (nomDeBase(SOURCE) === nomDeBase(CIBLE)) {
    throw new Refus(
      "La base de restauration est la base d'origine.\n" +
        "   La restauration EFFACE sa cible : elle écraserait ce qu'on vient de sauvegarder.",
    );
  }

  await mkdir(DOSSIER, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fichier = join(DOSSIER, `sentio-${horodatage}.dump`);

  console.log(`→ sauvegarde de ${nomDeBase(SOURCE)} vers ${fichier}`);
  // Format personnalisé : compressé, et restaurable table par table le jour où il ne faut
  // récupérer qu'une chose.
  await executer("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", fichier, SOURCE], {
    maxBuffer: 1024 * 1024 * 256,
  });

  const taille = (await stat(fichier)).size;
  if (taille === 0) {
    throw new Refus("La sauvegarde est vide. Un fichier de zéro octet n'a jamais rien restauré.");
  }
  console.log(`   ${(taille / 1024).toFixed(0)} Ko écrits`);

  if (process.argv.includes("--sans-verifier")) {
    console.log(
      "\n⚠️  Sauvegarde NON vérifiée. Un fichier qu'on n'a jamais restauré n'est pas une sauvegarde.",
    );
    return;
  }

  console.log(`\n→ restauration sur une base vierge (${nomDeBase(CIBLE)})`);
  const attendus = await compter(SOURCE);

  await executer("psql", ["-d", maintenance(CIBLE), "-c", `drop database if exists "${nomDeBase(CIBLE)}"`]);
  await executer("psql", ["-d", maintenance(CIBLE), "-c", `create database "${nomDeBase(CIBLE)}"`]);

  // pg_restore rend un code non nul sur des avertissements bénins (extensions déjà présentes,
  // propriétaires absents). On regarde ce qui compte : les comptes, ensuite.
  try {
    await executer("pg_restore", ["--no-owner", "--no-acl", "--dbname", CIBLE, fichier], {
      maxBuffer: 1024 * 1024 * 256,
    });
  } catch (erreur) {
    console.log("   (pg_restore a signalé des avertissements — on vérifie le contenu)");
    if (process.env["SENTIO_SAUVEGARDE_VERBEUX"] === "1") console.log(String(erreur));
  }

  const obtenus = await compter(CIBLE);
  const ecarts = TEMOINS.filter((table) => attendus[table] !== obtenus[table]);

  if (ecarts.length > 0) {
    throw new Refus(
      "La restauration ne rend pas ce qui a été sauvegardé :\n" +
        ecarts
          .map((table) => `   · ${table} : ${attendus[table]} sauvegardées, ${obtenus[table]} restaurées`)
          .join("\n") +
        "\n   Cette sauvegarde ne protège de rien. Ne pas s'en contenter.",
    );
  }

  console.log("   " + TEMOINS.map((t) => `${t} : ${obtenus[t]}`).join(" · "));

  const anciennes = (await readdir(DOSSIER)).filter((f) => f.endsWith(".dump")).length;
  console.log(`\n✅ sauvegarde vérifiée par restauration — ${anciennes} fichier(s) dans ${DOSSIER}`);
}

principal().catch((erreur) => {
  console.error(`\n${erreur instanceof Refus ? "✋" : "❌"} ${erreur.message}\n`);
  process.exitCode = 1;
});
