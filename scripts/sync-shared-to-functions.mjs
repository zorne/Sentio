/**
 * Recopie les paquets partagés vers `supabase/functions/_generated/`, en forme lisible par Deno.
 *
 * Pourquoi une recopie plutôt qu'un lien ou un paquet publié
 * ([`docs/adr/0023`](../docs/adr/0023-code-partage-vers-les-fonctions.md)) : les fonctions
 * s'exécutent sous Deno, qui résout les chemins **tels qu'ils sont écrits** — nos sources écrivent
 * `./ids.js` pour que le TypeScript compilé fonctionne sous Node, or ce fichier n'existe pas sur
 * le disque. La recopie réécrit ce seul détail, et ne touche à rien d'autre.
 *
 * Trois garde-fous, parce qu'une génération silencieuse qui dérive est pire que pas de génération :
 *
 *   1. une dépendance externe dans un paquet partagé **arrête** le script — Deno ne la résoudrait
 *      pas, et on l'apprendrait au déploiement ;
 *   2. un import réécrit qui ne désigne aucun fichier **arrête** le script ;
 *   3. la destination est effacée avant chaque exécution : elle ne contient jamais de reste.
 *
 * Le dossier produit n'est pas versionné. Il se régénère par `pnpm run functions:sync`, et il
 * disparaît le jour de la migration vers un hébergeur Node — les fonctions redevenant des routes
 * serveur, elles importeront les paquets par l'espace de travail.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Les paquets que les fonctions ont le droit d'importer. Aucun ne fait d'entrée/sortie. */
const SHARED_PACKAGES = ["domain", "config", "core", "db", "capabilities", "runtime"];

/**
 * Les imports « nus » tolérés dans un paquet partagé.
 *
 * ⚠️ Cette liste s'est ouverte le 2026-08-07, quand l'exécutant a dû tourner sous Deno
 * (`adr/0028`). Deux catégories, et rien d'autre :
 *
 *   · **les paquets partagés eux-mêmes** — ils sont résolus par l'import map de `deno.json`, donc
 *     Deno les trouve ;
 *   · **les modules `node:`** — Deno les implémente nativement. `packages/core` en utilise un
 *     seul, `node:crypto` pour un hachage.
 *
 * Toute autre dépendance externe arrête toujours le script : c'est elle qu'on ne découvrirait
 * qu'au déploiement.
 */
const IMPORTS_NUS_TOLERES = (specificateur) =>
  SHARED_PACKAGES.some((nom) => specificateur === `@sentio/${nom}`) ||
  specificateur.startsWith("node:");

const DESTINATION_ROOT = join(REPO_ROOT, "supabase", "functions", "_generated");

/** `from "./x.js"` ou `import("./x.js")` — uniquement les chemins relatifs. */
const RELATIVE_SPECIFIER = /(from\s+|import\s*\(\s*)(["'])(\.\.?\/[^"']+)\2/g;

async function collectSources(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSources(absolute, base)));
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    // Les tests restent côté Node : ils tournent sous Vitest, pas dans une fonction.
    if (entry.name.endsWith(".test.ts")) continue;
    files.push(relative(base, absolute));
  }
  return files;
}

function rewriteSpecifiers(source, filePath, packageName) {
  const rewritten = [];
  const output = source.replace(RELATIVE_SPECIFIER, (match, prefix, quote, specifier) => {
    if (!specifier.endsWith(".js")) {
      throw new Error(
        `${packageName}/${filePath} : import relatif « ${specifier} » sans extension .js. ` +
          `La convention du dépôt est d'écrire l'extension ; sans elle, Deno ne résout rien.`,
      );
    }
    const target = `${specifier.slice(0, -".js".length)}.ts`;
    rewritten.push(target);
    return `${prefix}${quote}${target}${quote}`;
  });
  return { output, rewritten };
}

function assertNoExternalDependency(source, filePath, packageName) {
  const bareImport = /(?:from\s+|import\s*\(\s*)["'](?![./])([^"']+)["']/.exec(source);
  if (bareImport !== null && !IMPORTS_NUS_TOLERES(bareImport[1])) {
    throw new Error(
      `${packageName}/${filePath} importe « ${bareImport[1]} ». Un paquet partagé avec les ` +
        `fonctions ne dépend de rien : cette dépendance ne serait pas résolue sous Deno. ` +
        `La sortir du paquet, ou ne pas partager ce fichier.`,
    );
  }
}

async function main() {
  await rm(DESTINATION_ROOT, { recursive: true, force: true });
  await mkdir(DESTINATION_ROOT, { recursive: true });

  // Le dossier est entièrement produit : rien de ce qu'il contient ne doit être versionné, et
  // personne ne doit y corriger un bogue — la source est dans `packages/`.
  await writeFile(
    join(DESTINATION_ROOT, ".gitignore"),
    [
      "# Produit par `pnpm run functions:sync` — voir ../README.md.",
      "# Ne rien modifier ici : la source vit dans packages/.",
      "*",
      "!.gitignore",
      "",
    ].join("\n"),
    "utf8",
  );

  let total = 0;
  for (const packageName of SHARED_PACKAGES) {
    const sourceRoot = join(REPO_ROOT, "packages", packageName, "src");
    if (!existsSync(sourceRoot)) {
      throw new Error(`Paquet introuvable : packages/${packageName}/src`);
    }

    const files = await collectSources(sourceRoot);
    const written = new Set(files.map((file) => file.replace(/\.ts$/, ".ts")));
    const pending = [];

    for (const file of files) {
      const source = await readFile(join(sourceRoot, file), "utf8");
      assertNoExternalDependency(source, file, packageName);
      const { output, rewritten } = rewriteSpecifiers(source, file, packageName);
      for (const target of rewritten) {
        pending.push({ file, target: resolve(dirname(join("/", file)), target).slice(1) });
      }
      const destination = join(DESTINATION_ROOT, packageName, file);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, output, "utf8");
      total += 1;
    }

    // Un import qui ne désigne rien doit échouer ici, pas au déploiement.
    for (const { file, target } of pending) {
      if (!written.has(target)) {
        throw new Error(
          `${packageName}/${file} importe « ${target} », qui n'a pas été recopié. ` +
            `Fichier de test importé depuis du code de production, ou chemin faux.`,
        );
      }
    }
  }

  process.stdout.write(
    `${total} fichiers recopiés vers supabase/functions/_generated (${SHARED_PACKAGES.join(", ")}).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
