/**
 * Le garde des frontières d'architecture.
 *
 * [`adr/0021`](../docs/adr/0021-execution-serveur-en-ue.md) (règle 2) et
 * [`adr/0022`](../docs/adr/0022-interface-sveltekit.md) (règles 1 à 6) posaient des règles dont la
 * seule parade écrite était **la revue** — et une règle défendue par la mémoire d'une personne seule
 * est une règle qui tombera un soir de fatigue. Ce script les rend vérifiables.
 *
 * Il ne remplace pas la revue : il tient les cas **mécaniquement décidables**, ceux qui font perdre
 * l'architecture par accident plutôt que par choix.
 *
 *     pnpm run verify:frontieres
 *
 * Chaque manquement est rendu avec son fichier, sa ligne, et ce qu'il faut faire à la place. Ajouter
 * une règle ici est préférable à l'expliquer dans une revue : la première fois qu'on l'explique, on
 * l'a déjà perdue une fois.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ fichier: string, ligne: number, regle: string, message: string }[]} */
const manquements = [];

function signaler(fichier, ligne, regle, message) {
  manquements.push({ fichier: relative(REPO_ROOT, fichier), ligne, regle, message });
}

async function fichiersDe(racine, extensions, exclus = []) {
  /** @type {string[]} */
  const trouves = [];
  async function parcourir(dossier) {
    let entrees;
    try {
      entrees = await readdir(dossier, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entree of entrees) {
      const chemin = join(dossier, entree.name);
      if (exclus.some((exclu) => chemin.includes(exclu))) continue;
      if (entree.isDirectory()) {
        if (entree.name === "node_modules" || entree.name.startsWith(".")) continue;
        await parcourir(chemin);
        continue;
      }
      if (extensions.some((extension) => entree.name.endsWith(extension))) trouves.push(chemin);
    }
  }
  await parcourir(racine);
  return trouves;
}

/** Les lignes d'un fichier, numérotées à partir de 1. */
function lignesDe(contenu) {
  return contenu.split("\n").map((texte, index) => ({ texte, numero: index + 1 }));
}

const IMPORT = /(?:^|\s)(?:import|export)\s[^;]*?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Une fonction serveur n'importe que le domaine et la configuration.
//
// C'est la règle 2 de l'adr/0021, prise à l'endroit où elle se perd : le jour où une fonction
// importera `@sentio/db` ou une bibliothèque tierce, elle cessera d'être un adaptateur, et la
// migration cessera d'être bornée.
// ─────────────────────────────────────────────────────────────────────────────

const IMPORTS_AUTORISES_FONCTIONS = ["@sentio/domain", "@sentio/config"];

async function verifierFonctions() {
  const fichiers = await fichiersDe(join(REPO_ROOT, "supabase", "functions"), [".ts"], [
    "_generated",
  ]);

  for (const fichier of fichiers) {
    const contenu = await readFile(fichier, "utf8");
    for (const { texte, numero } of lignesDe(contenu)) {
      const trouve = IMPORT.exec(texte);
      const specificateur = trouve?.[1] ?? trouve?.[2];
      if (specificateur === undefined) continue;
      if (specificateur.startsWith("./") || specificateur.startsWith("../")) continue;
      if (IMPORTS_AUTORISES_FONCTIONS.includes(specificateur)) continue;

      signaler(
        fichier,
        numero,
        "fonction = adaptateur",
        `importe « ${specificateur} ». Une fonction ne connaît que le domaine et la ` +
          `configuration : elle valide, appelle, répond. Un besoin d'infrastructure passe par un ` +
          `port de packages/, pas par un import direct (adr/0021, règle 2).`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. L'interface ne touche jamais une donnée directement.
//
// Règle 2 de l'adr/0022. Un client de base dans un fichier d'interface, et l'étanchéité entre la
// vitrine et les données ne tient plus qu'à la discipline.
// ─────────────────────────────────────────────────────────────────────────────

const DOSSIER_PORTE = join("src", "lib", "server-functions");

const TRACES_INFRASTRUCTURE = [
  { motif: /createClient\s*\(/, quoi: "un client de base de données" },
  { motif: /@supabase\//, quoi: "une bibliothèque d'accès aux données" },
  { motif: /\bSUPABASE_[A-Z_]+/, quoi: "une variable d'environnement de la plateforme" },
];

async function verifierInterface() {
  const racine = join(REPO_ROOT, "apps", "web", "src");
  const fichiers = await fichiersDe(racine, [".ts", ".svelte"]);

  for (const fichier of fichiers) {
    const contenu = await readFile(fichier, "utf8");
    const estLaPorte = fichier.includes(DOSSIER_PORTE);

    for (const { texte, numero } of lignesDe(contenu)) {
      for (const { motif, quoi } of TRACES_INFRASTRUCTURE) {
        if (motif.test(texte)) {
          signaler(
            fichier,
            numero,
            "aucune donnée depuis l'interface",
            `contient ${quoi}. L'interface parle à une fonction serveur, jamais à une table ` +
              `(adr/0022, règle 2).`,
          );
        }
      }

      // `fetch` n'est pas interdit : il est **localisé**. Une seule porte, pour qu'on sache où
      // regarder quand une donnée part quelque part.
      if (!estLaPorte && /\bfetch\s*\(/.test(texte)) {
        signaler(
          fichier,
          numero,
          "une seule porte réseau",
          `appelle « fetch ». Tout appel sortant vit dans src/lib/server-functions/ ` +
            `(adr/0022, règle 2).`,
        );
      }
    }

    // Un composant ne doit pas embarquer de code du domaine : il n'en connaît que la forme.
    // Les tests en sont exclus : ils s'exécutent sous Node, rien de ce qu'ils importent n'est
    // livré au navigateur — et un test qui ne peut pas appeler le domaine ne vérifie rien.
    if (!fichier.endsWith(".test.ts") && (fichier.endsWith(".svelte") || !estLaPorte)) {
      for (const { texte, numero } of lignesDe(contenu)) {
        const trouve = /(?:^|\s)import\s+(?!type\s)([^;]*?)from\s+["'](@sentio\/[^"']+)["']/.exec(texte);
        if (trouve !== null && !trouve[1].includes("type ")) {
          signaler(
            fichier,
            numero,
            "le domaine ne descend pas dans le navigateur",
            `importe « ${trouve[2]} » en valeur. Une règle métier ne s'exécute pas dans le ` +
              `navigateur : seuls ses types y sont connus (import type) — adr/0022, règles 3 et 5.`,
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Aucun texte visible en dehors du fichier de libellés.
//
// C'est la condition du contrôle de lexique (docs/17-lexique.md) : un texte écrit dans un composant
// échappe à tout contrôle. On repère ce qui ressemble à une phrase — deux mots ou plus — dans le
// balisage d'un composant, ou dans un attribut lu par une personne.
// ─────────────────────────────────────────────────────────────────────────────

const PHRASE = /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/;
const ATTRIBUTS_LUS = /\b(?:aria-label|title|alt|placeholder)\s*=\s*"([^"{}]*)"/g;

/**
 * Retire `<script>`, `<style>`, les commentaires et les expressions `{…}` du balisage — en
 * **conservant le nombre de lignes**, sans quoi les numéros signalés désigneraient la mauvaise ligne
 * et le message deviendrait plus agaçant qu'utile.
 */
function baliseSeule(contenu) {
  const memesLignes = (trouve) => "\n".repeat((trouve.match(/\n/g) ?? []).length);
  return contenu
    .replace(/<script[\s\S]*?<\/script>/g, memesLignes)
    .replace(/<style[\s\S]*?<\/style>/g, memesLignes)
    .replace(/<!--[\s\S]*?-->/g, memesLignes)
    .replace(/\{[\s\S]*?\}/g, (trouve) => `{}${memesLignes(trouve)}`);
}

async function verifierTextesVisibles() {
  const fichiers = await fichiersDe(join(REPO_ROOT, "apps", "web", "src"), [".svelte"]);

  for (const fichier of fichiers) {
    const contenu = await readFile(fichier, "utf8");
    const balise = baliseSeule(contenu);

    for (const { texte, numero } of lignesDe(balise)) {
      const horsBalises = texte.replace(/<[^>]*>/g, "\n");
      for (const morceau of horsBalises.split("\n")) {
        if (PHRASE.test(morceau.trim())) {
          signaler(
            fichier,
            numero,
            "les textes visibles vivent dans un seul endroit",
            `contient du texte en dur : « ${morceau.trim().slice(0, 40)} ». Le déplacer dans ` +
              `src/lib/labels.ts, seul endroit que le contrôle de lexique sait lire ` +
              `(docs/17-lexique.md, CONF-08).`,
          );
        }
      }
    }

    for (const { texte, numero } of lignesDe(contenu)) {
      for (const trouve of texte.matchAll(ATTRIBUTS_LUS)) {
        if (PHRASE.test(trouve[1] ?? "")) {
          signaler(
            fichier,
            numero,
            "les textes visibles vivent dans un seul endroit",
            `écrit un texte lu par une personne dans un attribut : « ${trouve[1]} ». Le déplacer ` +
              `dans src/lib/labels.ts.`,
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Le domaine ne fait aucune entrée/sortie.
//
// L'invariant le plus ancien du dépôt (AGENTS.md, section 3). Il tenait par la relecture.
// ─────────────────────────────────────────────────────────────────────────────

const ENTREES_SORTIES = [
  { motif: /\bfetch\s*\(/, quoi: "un appel réseau" },
  { motif: /from\s+["']node:/, quoi: "un module de plateforme" },
  { motif: /\bprocess\.env\b/, quoi: "une lecture d'environnement" },
  { motif: /\bnew Date\s*\(\s*\)/, quoi: "une lecture d'horloge" },
  { motif: /\bMath\.random\s*\(/, quoi: "une source de hasard" },
];

async function verifierDomainePur() {
  const fichiers = await fichiersDe(join(REPO_ROOT, "packages", "domain", "src"), [".ts"]);

  for (const fichier of fichiers) {
    if (fichier.endsWith(".test.ts")) continue;
    const contenu = await readFile(fichier, "utf8");
    for (const { texte, numero } of lignesDe(contenu)) {
      if (texte.trimStart().startsWith("*") || texte.trimStart().startsWith("//")) continue;
      for (const { motif, quoi } of ENTREES_SORTIES) {
        if (motif.test(texte)) {
          signaler(
            fichier,
            numero,
            "packages/domain ne fait aucune entrée/sortie",
            `contient ${quoi}. Le domaine reste pur : c'est ce qui le rend testable sans ` +
              `infrastructure, et rejouable à l'identique (AGENTS.md, section 3).`,
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Le Model Gateway est le SEUL chemin vers un fournisseur d'inférence.
//
// `NOYAU-04` : « aucun appel ne se fait ailleurs ». C'est le Gateway qui tient le routage par
// classe de données, les plafonds par entreprise, le découpage en enveloppes et le comptage du
// coût. Un appel qui le contourne ne contourne pas une couche technique : il contourne
// l'invariant 5 d'`AGENTS.md` — une donnée réelle qui part chez un fournisseur non prouvé
// « sans entraînement ».
//
// La règle vise l'exécution (`apps/worker`) et les adaptateurs de fournisseur eux-mêmes sont
// dans `packages/core/src/model/`, seul endroit autorisé à parler HTTP à un modèle.
// ─────────────────────────────────────────────────────────────────────────────

const TRACES_FOURNISSEUR = [
  { motif: /\bfetch\s*\(/, quoi: "un appel réseau direct" },
  { motif: /["'`]https?:\/\/[^"'`]*\b(openai|anthropic|googleapis|generativelanguage|groq|mistral|cohere)\b/i, quoi: "une adresse de fournisseur d'inférence" },
  { motif: /from\s+["'](openai|@anthropic-ai\/|@google\/gen|@google-cloud\/vertex|groq-sdk|@mistralai\/|cohere-ai)/, quoi: "un SDK de fournisseur d'inférence" },
  { motif: /\b(OPENAI|ANTHROPIC|GEMINI|GOOGLE_API|GROQ|MISTRAL|COHERE)_[A-Z_]*KEY\b/, quoi: "une clé de fournisseur d'inférence" },
];

async function verifierAppelsModele() {
  const fichiers = await fichiersDe(join(REPO_ROOT, "apps", "worker", "src"), [".ts"]);

  for (const fichier of fichiers) {
    const contenu = await readFile(fichier, "utf8");
    for (const { texte, numero } of lignesDe(contenu)) {
      if (texte.trimStart().startsWith("*") || texte.trimStart().startsWith("//")) continue;
      for (const { motif, quoi } of TRACES_FOURNISSEUR) {
        if (motif.test(texte)) {
          signaler(
            fichier,
            numero,
            "le Gateway est le seul chemin vers un fournisseur",
            `contient ${quoi}. L'exécution passe par \`ModelGateway.complete()\`, jamais par un ` +
              `fournisseur en direct : lui seul tient le routage par classe de données, les ` +
              `plafonds, les enveloppes et le comptage du coût (NOYAU-04, AGENTS.md invariant 5).`,
          );
        }
      }
    }
  }
}

async function main() {
  await verifierFonctions();
  await verifierInterface();
  await verifierTextesVisibles();
  await verifierDomainePur();
  await verifierAppelsModele();

  if (manquements.length === 0) {
    process.stdout.write("Frontières d'architecture : rien à signaler.\n");
    return;
  }

  process.stderr.write(`\n${manquements.length} frontière(s) franchie(s) :\n\n`);
  for (const { fichier, ligne, regle, message } of manquements) {
    process.stderr.write(`  ${fichier}:${ligne}\n    [${regle}] ${message}\n\n`);
  }
  process.exitCode = 1;
}

main().catch((erreur) => {
  process.stderr.write(`${erreur instanceof Error ? erreur.stack : String(erreur)}\n`);
  process.exitCode = 1;
});
