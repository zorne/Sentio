/**
 * Le contrôle de déploiement de l'exécutant — **reproductible, et sans jamais voir un secret**.
 *
 *     pnpm run deploiement:verifier            # les préalables, avant de déployer
 *     pnpm run deploiement:verifier --distant  # + les invariants contre la fonction déployée
 *
 * ══ POURQUOI UN SCRIPT ET PAS UNE PROCÉDURE ÉCRITE ══
 *
 * Un déploiement qui marche une fois ne prouve rien : ce qu'il faut savoir, c'est qu'il marche
 * **encore**, après le prochain changement de schéma, la prochaine rotation de secret, la
 * prochaine migration d'hébergeur. Une procédure écrite se relit mal et se saute bien ; un script
 * échoue.
 *
 * ══ CE QU'IL NE FAIT JAMAIS ══
 *
 *   · **il ne lit aucune valeur de secret** — il vérifie que les NOMS attendus existent chez
 *     l'hébergeur (`supabase secrets list` ne rend que des noms et des empreintes), et il prend
 *     l'URL et le secret du battement dans l'environnement de l'opérateur, sans jamais les
 *     afficher ni les journaliser ;
 *   · **il ne déploie rien, ne pousse aucune migration, ne pose aucun secret.** Ces trois gestes
 *     touchent une infrastructure réelle : ils appartiennent à une personne, pas à un script — et
 *     encore moins à un agent.
 *
 * ══ CE QU'IL VÉRIFIE APRÈS DÉPLOIEMENT ══
 *
 * Exactement les invariants de sécurité vérifiés en local (`supabase/functions/battement/index.test.ts`),
 * mais contre l'URL réelle : un battement signé passe, une signature invalide est refusée, un
 * refus ne dit jamais pourquoi, et aucune réponse ne contient de secret. Plus la durée, pour la
 * comparer au local (`adr/0028`).
 */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executer = promisify(execFile);

/** Les secrets que la fonction exige pour être opérationnelle. **Des noms, jamais des valeurs.** */
const SECRETS_REQUIS = [
  "DATABASE_URL",
  "SENTIO_HEARTBEAT_SECRET",
  "SENTIO_MODELE_PRINCIPAL_URL",
  "SENTIO_MODELE_PRINCIPAL_NOM",
  "SENTIO_MODELE_PRINCIPAL_CLE",
  "SENTIO_MODELE_PRINCIPAL_POLITIQUE",
];

const constats = [];
let bloquant = 0;

function constater(ok, quoi, detail = "") {
  constats.push({ ok, quoi, detail });
  if (!ok) bloquant += 1;
}

/**
 * Isole l'objet JSON d'une sortie de CLI.
 *
 * ⚠️ `supabase … --output json` écrit d'abord des lignes de progression (« Connecting to remote
 * database… ») **sur la sortie standard**, avant le JSON. Les analyser tel quel échoue — et
 * échouait, jusqu'à ce que ce script se le fasse dire par lui-même.
 */
function jsonDeLaCli(sortie) {
  const debut = sortie.indexOf("{");
  const fin = sortie.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    return JSON.parse(sortie.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

async function supabase(args) {
  try {
    const { stdout } = await executer("supabase", args, { cwd: REPO_ROOT, maxBuffer: 8e6 });
    return { ok: true, sortie: stdout };
  } catch (erreur) {
    // ⚠️ La sortie d'erreur de la CLI peut contenir une chaîne de connexion. On ne garde que le
    // code de sortie : diagnostiquer se fait en relançant la commande à la main.
    return { ok: false, sortie: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Le schéma distant porte-t-il tout ce que le code attend ?
// ─────────────────────────────────────────────────────────────────────────────
//
// C'est le préalable qu'on oublie : la fonction se déploie en quelques secondes, et elle
// s'exécutera contre une base qui n'a pas les tables qu'elle interroge. L'échec arriverait au
// premier battement, en production, sur une trace illisible.

async function verifierLeSchema() {
  const resultat = await supabase(["migration", "list"]);
  if (!resultat.ok) {
    constater(false, "migrations", "la CLI n'a pas répondu (projet lié ? session ouverte ?)");
    return;
  }

  const rendu = jsonDeLaCli(resultat.sortie);
  if (rendu === null) {
    constater(false, "migrations", "réponse illisible de la CLI");
    return;
  }
  const migrations = rendu.migrations ?? [];

  const manquantes = migrations.filter((m) => m.local !== "" && m.remote === "").map((m) => m.local);
  constater(
    manquantes.length === 0,
    "schéma distant à jour",
    manquantes.length === 0
      ? `${migrations.length} migrations appliquées`
      : `${manquantes.length} migration(s) non appliquée(s) : ${manquantes.join(", ")} — ` +
        "`supabase db push` est un geste humain, pas un geste de script.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Les secrets attendus existent-ils ? (leurs NOMS, jamais leurs valeurs)
// ─────────────────────────────────────────────────────────────────────────────

async function verifierLesSecrets() {
  const resultat = await supabase(["secrets", "list"]);
  if (!resultat.ok) {
    constater(false, "secrets", "la CLI n'a pas répondu");
    return;
  }

  const rendu = jsonDeLaCli(resultat.sortie);
  if (rendu === null) {
    constater(false, "secrets", "réponse illisible de la CLI");
    return;
  }
  const poses = (rendu.secrets ?? []).map((secret) => secret.name);

  const absents = SECRETS_REQUIS.filter((nom) => !poses.includes(nom));
  constater(
    absents.length === 0,
    "secrets du runtime posés",
    absents.length === 0
      ? `${SECRETS_REQUIS.length} secrets présents`
      : `absents : ${absents.join(", ")} — à poser en console ou par « supabase secrets set », ` +
        "jamais depuis le dépôt ni depuis un agent.",
  );

  // ⚠️ Le drapeau d'opt-out est FERMÉ par défaut, et c'est voulu : sans preuve d'entraînement
  // désactivé, aucune donnée réelle ne part vers un modèle (invariant 5). On le signale sans le
  // refuser — c'est une décision, pas une erreur.
  const optOut = poses.includes("SENTIO_OPT_OUT_PROUVE");
  constats.push({
    ok: true,
    quoi: "opt-out d'entraînement",
    detail: optOut
      ? "SENTIO_OPT_OUT_PROUVE est posé — vérifier qu'une preuve datée existe vraiment"
      : "non posé : aucune donnée réelle ne partira vers un modèle (comportement voulu)",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. La fonction est-elle déclarée, et son code tient-il sous Deno ?
// ─────────────────────────────────────────────────────────────────────────────

async function verifierLaFonction() {
  const config = await readFile(join(REPO_ROOT, "supabase", "config.toml"), "utf8");
  const declaree = /\[functions\.battement\]/.test(config);
  constater(declaree, "fonction déclarée", declaree ? "" : "[functions.battement] absent de config.toml");

  // ⚠️ Bornée à SA section : sans le `[^[]*`, l'expression débordait sur `[functions.diagnostic]`
  // et rendait « activée » une fonction qui ne l'était pas. Trouvé en lisant la sortie du script.
  const active = /\[functions\.battement\][^[]*enabled = true/.test(config);
  constats.push({
    ok: true,
    quoi: "fonction activée",
    detail: active ? "enabled = true" : "enabled = false — elle ne sera pas servie",
  });

  const verifie = await executer("pnpm", ["run", "functions:verify"], {
    cwd: REPO_ROOT,
    maxBuffer: 3e7,
  }).then(
    () => true,
    () => false,
  );
  constater(verifie, "code de la fonction vérifié", verifie ? "lint, types et tests Deno" : "échec");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Les invariants, contre la fonction RÉELLEMENT déployée
// ─────────────────────────────────────────────────────────────────────────────
//
// Les mêmes qu'en local, sur l'URL réelle. L'opérateur fournit l'URL et le secret par
// l'environnement : ce script ne les affiche jamais, et ne les écrit nulle part.

async function verifierLeDistant() {
  const base = process.env["SENTIO_BATTEMENT_URL"];
  const secret = process.env["SENTIO_HEARTBEAT_SECRET"];

  if (base === undefined || secret === undefined) {
    constater(
      false,
      "contrôle distant",
      "SENTIO_BATTEMENT_URL et SENTIO_HEARTBEAT_SECRET doivent être dans l'environnement de " +
        "l'opérateur. Le script ne les invente pas et ne les lit nulle part ailleurs.",
    );
    return;
  }

  const { signHeartbeat, HEARTBEAT_HEADER } = await import(
    join(REPO_ROOT, "supabase", "functions", "_generated", "domain", "heartbeat-signature.ts")
  ).catch(() => ({}));

  if (signHeartbeat === undefined) {
    constater(false, "contrôle distant", "lancer « pnpm run functions:sync » d'abord");
    return;
  }

  const battre = async (entete) =>
    fetch(base, {
      method: "POST",
      ...(entete === null ? {} : { headers: { [HEARTBEAT_HEADER]: entete } }),
    });

  // a. Un battement signé passe, et on mesure combien de temps il prend réellement.
  const debut = performance.now();
  const accepte = await battre(await signHeartbeat(secret, new Date()));
  const duree = performance.now() - debut;
  const corps = await accepte.text();
  constater(accepte.status === 200, "battement signé accepté", `${accepte.status} en ${Math.round(duree)} ms`);

  // b. Aucun secret dans la réponse. Un service qui recrache sa configuration est une fuite.
  const fuite = [secret, "postgres://", "password"].some((aiguille) => corps.includes(aiguille));
  constater(!fuite, "aucun secret dans la réponse", fuite ? "UNE VALEUR SENSIBLE A FUITÉ" : "");

  // c. Signature absente, fausse, ou rejouée : refusée, et sans jamais dire pourquoi.
  const vieux = await signHeartbeat(secret, new Date(Date.now() - 3_600_000));
  for (const [nom, entete] of [
    ["sans en-tête", null],
    ["en-tête malformé", "n'importe quoi"],
    ["horodatage rejoué", vieux],
  ]) {
    const refus = await battre(entete);
    const texte = await refus.text();
    constater(
      refus.status === 401 && !texte.includes("horodatage") && !texte.includes("signature"),
      `refus : ${nom}`,
      `${refus.status}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const distant = process.argv.includes("--distant");

  await verifierLeSchema();
  await verifierLesSecrets();
  await verifierLaFonction();
  if (distant) await verifierLeDistant();

  process.stdout.write("\n── Déploiement de l'exécutant ──\n");
  for (const { ok, quoi, detail } of constats) {
    process.stdout.write(`  ${ok ? "✅" : "❌"} ${quoi}${detail === "" ? "" : ` — ${detail}`}\n`);
  }

  if (bloquant > 0) {
    process.stdout.write(
      `\n${bloquant} préalable(s) non tenu(s). Le déploiement n'est pas prêt.\n` +
        "Aucun de ces gestes n'est automatisé à dessein : pousser un schéma, poser un secret et\n" +
        "déployer touchent une infrastructure réelle, et appartiennent à une personne.\n\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("\nTous les préalables sont tenus.\n\n");
}

main().catch((erreur) => {
  process.stderr.write(`${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
  process.exitCode = 1;
});
