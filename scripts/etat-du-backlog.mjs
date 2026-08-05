/**
 * L'état d'avancement du backlog, **déduit du dépôt** — jamais tenu à la main.
 *
 * Pourquoi générer plutôt que cocher : une liste de cases cochées à la main devient fausse au
 * premier oubli, et personne ne s'en aperçoit. Ici, **un fichier déclare ce qu'il réalise** :
 *
 *     Réalise : METIER-09, METIER-10
 *
 * Le marqueur et la preuve sont donc le même geste. Supprimer le fichier retire la tâche de
 * l'état ; la renommer la suit. Rien à tenir à jour ailleurs.
 *
 * ⚠️ **Une simple mention en prose ne compte pas**, et c'est indispensable : l'en-tête de
 * `supabase/functions/diagnostic/handler.ts` cite `ACQUIS-17` précisément pour dire qu'elle
 * **manque**. Un compteur qui lit les citations marquerait cette tâche comme faite — d'où la
 * déclaration explicite, qui ne peut pas se confondre avec un renvoi.
 *
 *     pnpm run backlog:etat        # régénère docs/etat-backlog.md
 *     pnpm run backlog:verifier    # échoue si le fichier n'est plus à jour
 *
 * ⚠️ Ce que ça ne mesure pas : la qualité. « Faite » veut dire *implémentée et tracée*, pas
 * *vérifiée* — ce sont les tests et `pnpm run verify` qui répondent de ça
 * ([`docs/adr/0024`](../docs/adr/0024-verification-automatique.md)).
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(REPO_ROOT, "docs", "backlog-v1.csv");
const SORTIE = join(REPO_ROOT, "docs", "etat-backlog.md");

/** Où l'on cherche les preuves. La documentation en est **exclue** : citer n'est pas faire. */
const RACINES = [
  "packages",
  "apps",
  "scripts",
  "supabase/migrations",
  "supabase/functions",
  "supabase/tests",
  ".github",
];

// .next : sortie de construction de la vitrine Next.js — jamais commitée (.gitignore), donc
// jamais une preuve stable. Sans cette exclusion, une déclaration s'y retrouve recopiée par le
// bundler et « prouve » une tâche avec un lien qui casse au prochain `rm -rf .next`.
const EXCLUS = ["node_modules", "_generated", ".svelte-kit", ".next", "/build/", "dist"];
// .tsx : la vitrine est passée de SvelteKit à Next.js/React (fusion du dépôt employer-ia) sans
// que cette liste ne bouge — aucun composant React ne pouvait donc jamais déclarer une tâche.
const EXTENSIONS = [".ts", ".tsx", ".svelte", ".sql", ".mjs", ".js", ".sh", ".yml", ".yaml", ".toml"];

/** Deux fichiers de racine portent aussi une déclaration : l'espace de travail et le CLI. */
const FICHIERS_EXPLICITES = ["pnpm-workspace.yaml", "supabase/config.toml"];

const PREFIXES = ["FOND", "NOYAU", "METIER", "ACQUIS", "RECRUT", "EXEC", "DASH", "EVOL", "CONF", "TEST"];
const PREFIXE = PREFIXES.join("|");

/** La déclaration, telle qu'elle s'écrit dans un en-tête : `Réalise : ACQUIS-13, ACQUIS-14`. */
const DECLARATION = new RegExp(`Réalise\\s*:\\s*((?:(?:${PREFIXE})-\\d{1,2})(?:\\s*,\\s*(?:${PREFIXE})-\\d{1,2})*)`, "g");

/** Les lots, dans l'ordre où ils sont exécutés (adr/0020). */
const ORDRE_DES_LOTS = [
  "Fondations (Lot 0)",
  "Noyau (Lot 1)",
  "Métier Commercial (Lot 2)",
  "Acquisition (Lot 4)",
  "Recrutement (Lot 5)",
  "Dashboard (Lot 6)",
  "Exécution (Lot 3)",
  "Évolution (Lot 7)",
  "Conformité (Lot 8)",
  "Vérification",
];

async function fichiers(racine) {
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
      if (EXCLUS.some((exclu) => `${chemin}/`.includes(exclu))) continue;
      if (entree.isDirectory()) {
        if (entree.name === "node_modules") continue;
        await parcourir(chemin);
        continue;
      }
      if (EXTENSIONS.some((extension) => entree.name.endsWith(extension))) trouves.push(chemin);
    }
  }
  await parcourir(join(REPO_ROOT, racine));
  return trouves;
}

/**
 * Les tâches **déclarées** par un texte. Rien d'autre n'est lu : ni les citations en prose, ni les
 * renvois du genre « ce qui manque : … ».
 */
export function tachesDeclarees(texte) {
  const trouves = new Set();
  for (const [, liste] of texte.matchAll(DECLARATION)) {
    for (const id of liste.split(",")) {
      const [prefixe, numero] = id.trim().split("-");
      trouves.add(`${prefixe}-${String(Number(numero)).padStart(2, "0")}`);
    }
  }
  return trouves;
}

async function lireBacklog() {
  const contenu = await readFile(CSV, "utf8");
  const lignes = contenu.split("\n").filter((ligne) => ligne.trim() !== "");
  return lignes.slice(1).map((ligne) => {
    const [id, titre, categorie, charge, priorite] = ligne.split(";");
    return { id, titre, categorie, charge, priorite: (priorite ?? "").trim() };
  });
}

async function collecterPreuves(connus) {
  /** @type {Map<string, string[]>} */
  const preuves = new Map();
  const aVerifier = [
    ...(await Promise.all(RACINES.map((racine) => fichiers(racine)))).flat(),
    ...FICHIERS_EXPLICITES.map((chemin) => join(REPO_ROOT, chemin)),
  ];
  for (const fichier of aVerifier) {
      const contenu = await readFile(fichier, "utf8");
      for (const id of tachesDeclarees(contenu)) {
        // Une déclaration qui ne désigne aucune tâche du backlog est une faute de frappe : elle
        // disparaîtrait en silence de l'état, ce qui est exactement le genre d'oubli qu'on refuse.
        if (!connus.has(id)) {
          throw new Error(
            `${relative(REPO_ROOT, fichier)} déclare « ${id} », qui n'existe pas dans ` +
              `docs/backlog-v1.csv. Corriger l'identifiant, ou ajouter la tâche au backlog.`,
          );
        }
      const chemin = relative(REPO_ROOT, fichier);
      const liste = preuves.get(id) ?? [];
      if (!liste.includes(chemin)) liste.push(chemin);
      preuves.set(id, liste);
    }
  }
  // Le chemin le plus court d'abord : c'est presque toujours le fichier principal, les autres
  // étant des tests ou des adaptateurs.
  for (const liste of preuves.values()) liste.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return preuves;
}

function tableauDunLot(taches, preuves) {
  const lignes = [
    "| | Tâche | Priorité | Preuve dans le dépôt |",
    "|---|---|---|---|",
  ];
  for (const tache of taches) {
    const trouvees = preuves.get(tache.id) ?? [];
    const etat = trouvees.length > 0 ? "✅" : "☐";
    const preuve =
      trouvees.length === 0
        ? "—"
        : trouvees
            .slice(0, 2)
            .map((chemin) => `[\`${chemin}\`](../${chemin})`)
            .join(" · ");
    lignes.push(`| ${etat} | **${tache.id}** ${tache.titre} | ${tache.priorite} | ${preuve} |`);
  }
  return lignes.join("\n");
}

function rendre(taches, preuves) {
  const lots = [...new Set(taches.map((tache) => tache.categorie))].sort((a, b) => {
    const rang = (categorie) => {
      const index = ORDRE_DES_LOTS.findIndex((connu) => categorie.startsWith(connu.split(" (")[0]));
      return index === -1 ? ORDRE_DES_LOTS.length : index;
    };
    return rang(a) - rang(b) || a.localeCompare(b);
  });

  const faites = (liste) => liste.filter((tache) => (preuves.get(tache.id) ?? []).length > 0).length;
  const total = taches.length;
  const totalFaites = faites(taches);

  const entete = [
    "# État du backlog — **fichier généré**",
    "",
    "> ⚠️ **Ne pas modifier à la main.** Produit par `pnpm run backlog:etat` à partir du dépôt ;",
    "> `pnpm run backlog:verifier` échoue s'il n'est plus à jour, et l'intégration continue le lance.",
    ">",
    "> **Une tâche est « faite » quand un fichier du dépôt le déclare** — une ligne `Réalise : ID`",
    "> dans son en-tête. Le marqueur et la preuve sont donc le même geste : supprimer le fichier",
    "> retire la tâche de l'état, et une mention en prose ne compte pas — l'en-tête de la fonction de",
    "> diagnostic cite `ACQUIS-17` précisément pour dire qu'elle manque.",
    ">",
    "> **« Faite » veut dire implémentée et tracée, pas vérifiée** — c'est `pnpm run verify` qui répond",
    "> de la qualité ([`adr/0024`](adr/0024-verification-automatique.md)). La liste des tâches, elle,",
    "> vit dans [`backlog-v1.csv`](backlog-v1.csv) ; l'ordre des lots dans",
    "> [`12-roadmap.md`](12-roadmap.md) et [`20-plan-action.md`](20-plan-action.md).",
    "",
    "---",
    "",
    "## Avancement",
    "",
    `**${totalFaites} tâches sur ${total}** portent une preuve dans le dépôt.`,
    "",
    "| Lot | Fait | Total | |",
    "|---|---|---|---|",
  ];

  for (const lot of lots) {
    const liste = taches.filter((tache) => tache.categorie === lot);
    const fait = faites(liste);
    const part = Math.round((fait / liste.length) * 20);
    entete.push(
      `| ${lot} | ${fait} | ${liste.length} | \`${"█".repeat(part)}${"·".repeat(20 - part)}\` |`,
    );
  }

  const corps = lots.map((lot) => {
    const liste = taches.filter((tache) => tache.categorie === lot);
    return `\n---\n\n## ${lot}\n\n${tableauDunLot(liste, preuves)}`;
  });

  return `${entete.join("\n")}${corps.join("\n")}\n`;
}

async function main() {
  const verifier = process.argv.includes("--verifier");
  const taches = await lireBacklog();
  const preuves = await collecterPreuves(new Set(taches.map((tache) => tache.id)));
  const attendu = rendre(taches, preuves);

  if (!verifier) {
    await writeFile(SORTIE, attendu, "utf8");
    const faites = taches.filter((tache) => (preuves.get(tache.id) ?? []).length > 0).length;
    process.stdout.write(`docs/etat-backlog.md régénéré — ${faites}/${taches.length} tâches tracées.\n`);
    return;
  }

  let actuel = "";
  try {
    actuel = await readFile(SORTIE, "utf8");
  } catch {
    actuel = "";
  }

  if (actuel !== attendu) {
    process.stderr.write(
      "docs/etat-backlog.md n'est plus à jour : le dépôt a avancé, l'état non.\n" +
        "  → `pnpm run backlog:etat`, puis committer le fichier régénéré.\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("État du backlog : à jour.\n");
}

main().catch((erreur) => {
  process.stderr.write(`${erreur instanceof Error ? erreur.stack : String(erreur)}\n`);
  process.exitCode = 1;
});
