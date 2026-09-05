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
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ fichier: string, ligne: number, regle: string, message: string }[]} */
const manquements = [];

/**
 * Un même défaut ne se signale qu'une fois par ligne et par règle. Un texte visible est souvent
 * capté deux fois — comme chaîne de caractères, puis comme contenu d'élément —, et lire deux fois
 * le même reproche fait douter du contrôle plutôt que du code.
 */
const dejaSignales = new Set();

function signaler(fichier, ligne, regle, message) {
  const empreinte = `${fichier}:${ligne}:${regle}`;
  if (dejaSignales.has(empreinte)) return;
  dejaSignales.add(empreinte);
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

/**
 * ⚠️ EXCEPTION NOMMÉE, ET UNE SEULE — le prototype d'exécutant Deno (`D16`).
 *
 * La règle générale reste entière : une fonction valide, appelle le domaine, répond. Mais
 * l'exécutant n'est pas un adaptateur d'entrée — c'est un adaptateur de SORTIE, comme
 * `apps/worker`, et un adaptateur de sortie a besoin d'un pilote de base. `adr/0021` l'avait
 * prévu (règle 3, « l'adaptateur se double ») sans dire qui le porterait.
 *
 * L'exception est **par fonction et par module**, pas par dossier : c'est ce qui empêche qu'elle
 * s'élargisse en silence. Une seconde fonction qui importerait un pilote serait refusée, et il
 * faudrait revenir ici — donc en discuter.
 */
const DEROGATIONS_PAR_FONCTION = {
  // L'exécutant est un adaptateur de SORTIE : il monte le runtime et lui fournit un pilote.
  // Ce sont les mêmes pièces que `apps/worker` — c'est précisément ce qui interdit de dupliquer
  // la logique métier pour Deno (`adr/0028`).
  battement: ["@db/postgres", "@sentio/core", "@sentio/db", "@sentio/runtime"],
};

async function verifierFonctions() {
  const fichiers = await fichiersDe(join(REPO_ROOT, "supabase", "functions"), [".ts"], [
    "_generated",
  ]);

  for (const fichier of fichiers) {
    const contenu = await readFile(fichier, "utf8");
    const fonction = relative(join(REPO_ROOT, "supabase", "functions"), fichier).split(sep)[0];
    const derogations = DEROGATIONS_PAR_FONCTION[fonction] ?? [];
    for (const { texte, numero } of lignesDe(contenu)) {
      const trouve = IMPORT.exec(texte);
      const specificateur = trouve?.[1] ?? trouve?.[2];
      if (specificateur === undefined) continue;
      if (specificateur.startsWith("./") || specificateur.startsWith("../")) continue;
      if (IMPORTS_AUTORISES_FONCTIONS.includes(specificateur)) continue;
      if (derogations.includes(specificateur)) continue;

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
// 2. L'interface ne parle jamais à un fournisseur de modèle.
//
// ⚠️ CE QUE CETTE RÈGLE REMPLACE, ET POURQUOI ELLE A CHANGÉ DE CIBLE.
//
// Elle visait `apps/web/src` — l'ancienne vitrine SvelteKit. Ce dossier a été supprimé, et
// personne n'a cherché qui le nommait : la règle a continué de tourner, de lire **zéro fichier**,
// et de répondre « rien à signaler ». Un contrôle vert parce qu'il ne regarde nulle part est pire
// qu'un contrôle absent : le second, on sait qu'on ne l'a pas.
//
// Ce qu'elle tient maintenant, c'est le critère 5 du point de bascule de `docs/27` §9 : aucun
// appel direct à un fournisseur d'inférence depuis `apps/vitrine`. C'est le pendant, côté
// interface, de la règle 5 qui tient déjà `apps/worker` — et il est plus important ici, parce que
// c'est l'interface qui reçoit ce qu'un visiteur tape.
//
// On ne reprend PAS l'indice générique `fetch(` : une interface appelle légitimement son propre
// serveur. Restent les trois motifs qui désignent réellement un fournisseur — adresse, SDK, clé.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ DÉROGATIONS NOMMÉES, FICHIER PAR FICHIER — jamais par dossier.
 *
 * C'est la même discipline que `DEROGATIONS_PAR_FONCTION` plus haut : une exception qui porte un
 * nom se relit ; une exception qui porte un dossier s'élargit toute seule. Un SECOND fichier qui
 * toucherait une clé de fournisseur serait refusé, et il faudrait revenir ici — donc en parler.
 *
 * Les deux fichiers listés ne font que **constater la présence** de la clé, jamais l'appel : le
 * conseiller passe par `buildAdvisorGateway()`. Ils disparaîtront quand `apps/vitrine` lira le
 * Gateway du cœur (`docs/27`, phase 3).
 */
const FICHIERS_TOLERES_FOURNISSEUR = [
  join("src", "app", "api", "advisor", "route.ts"),
  join("src", "lib", "diagnostic-envelope.integration.test.ts"),
];

async function verifierInterfaceSansFournisseur() {
  const racine = join(REPO_ROOT, "apps", "vitrine", "src");
  const fichiers = await fichiersDe(racine, [".ts", ".tsx"]);

  for (const fichier of fichiers) {
    if (FICHIERS_TOLERES_FOURNISSEUR.some((tolere) => fichier.endsWith(tolere))) continue;
    const contenu = await readFile(fichier, "utf8");

    for (const { texte, numero } of lignesDe(contenu)) {
      if (texte.trimStart().startsWith("*") || texte.trimStart().startsWith("//")) continue;
      for (const { motif, quoi } of TRACES_FOURNISSEUR) {
        if (quoi === "un appel réseau direct") continue;
        if (motif.test(texte)) {
          signaler(
            fichier,
            numero,
            "l'interface ne parle pas à un fournisseur",
            `contient ${quoi}. Une interface affiche et déclenche : elle ne choisit pas un ` +
              `fournisseur, ne porte pas sa clé et ne compte pas son coût. Cela vit dans ` +
              `packages/core (docs/27 §9, critère 5 ; AGENTS.md invariant 5).`,
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Le lexique et la typographie de ce qu'un client LIT.
//
// ⚠️ CE CONTRÔLE A EXISTÉ, PUIS IL A DISPARU SANS QUE PERSONNE NE LE DÉCIDE.
//
// L'ancienne vitrine tenait tout son texte dans un `labels.ts` que l'intégration continue
// relisait. Le fichier est parti avec SvelteKit, et le contrôle avec lui — `AGENTS.md` le note
// déjà : « le lexique s'applique toujours, il n'est simplement plus défendu par une machine ».
//
// Il l'est de nouveau, et sans exiger de fichier de libellés : Next.js répartit le texte dans les
// composants, et imposer un `labels.ts` à React reviendrait à décrire l'interface deux fois. On
// lit donc le texte là où il est.
//
// Deux règles, deux sources :
//
//   · LE LEXIQUE — `docs/17-lexique.md`, qui reste la source unique. Les mots sont recopiés ici
//     parce qu'un script ne lit pas un tableau Markdown de façon fiable ; le document fait foi,
//     et ce fichier le cite.
//   · LES TIRETS — demande explicite du fondateur : aucun tiret dans un texte visible. Un tiret
//     cadratin est un raccourci d'écriture ; une virgule, un deux-points ou une phrase de plus
//     disent la même chose sans faire buter l'œil. Les commentaires de code n'en sont pas
//     concernés, et ce contrôle ne les lit pas.
//
// ⚠️ DEUX ZONES EXEMPTÉES DE LEXIQUE, ET PAS UNE DE PLUS (`docs/17`, « les zones exemptées ») :
// les pages légales, où le vocabulaire juridique exact prime, et l'information de transparence du
// diagnostic, obligatoire depuis l'article 50 du règlement européen sur l'IA. Un contrôle qui
// ferait échouer l'intégration continue sur une mention légale obligatoire finirait désactivé —
// et c'est tout le contrôle qu'on perdrait.
//
// **Les tirets, eux, ne sont exemptés nulle part** : la typographie d'une page légale se lit
// autant que celle d'une page de vente.
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qui ressemble à une phrase : deux mots ou plus. */
const PHRASE = /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/;

/**
 * Retire les commentaires en **conservant le nombre de lignes** : sans ça, les numéros signalés
 * désigneraient la mauvaise ligne, et le message deviendrait plus agaçant qu'utile.
 *
 * C'est ce qui autorise les tirets cadratins dans les commentaires de ce dépôt — ils y sont
 * partout, et le fondateur les y a explicitement laissés.
 */
function sansCommentaires(contenu) {
  const memesLignes = (trouve) => "\n".repeat((trouve.match(/\n/g) ?? []).length);
  return contenu
    .replace(/\/\*[\s\S]*?\*\//g, memesLignes)
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (_, avant) => avant);
}

/** Les mots interdits de `docs/17-lexique.md`. Le document fait foi ; ceci le cite. */
const MOTS_INTERDITS =
  /\b(IA|intelligences? artificielles?|bots?|assistants?|agents?|automations?|automatisations?|automatisée?s?|GPT|prompts?|tokens?|workflows?|pipelines?|modèles?|tâches? système)\b/i;

/**
 * Le tiret cadratin et le demi-cadratin, et eux seuls.
 *
 * ⚠️ POURQUOI PAS LE TIRET COURT ISOLÉ PAR DES ESPACES.
 *
 * Il y était, et il ne signalait que des soustractions : « const SOL = H - 4 »,
 * « a.seq - b.seq », « PROFILE.length - 1 ». Trente signalements, zéro vrai. Distinguer une
 * soustraction d'une respiration typographique dans une ligne de composant demanderait
 * d'analyser le JSX, pas de le lire ligne à ligne.
 *
 * Et ça ne coûte presque rien : les quarante-neuf tirets trouvés à l'audit du 2026-08-26 étaient
 * tous des cadratins. Un contrôle qui attrape le vrai cas sans crier sur le code se garde ; un
 * contrôle qui crie se désactive.
 */
const TIRET_VISIBLE = /[—–]/;

/** Le texte d'une page légale, et la phrase de transparence du diagnostic. */
function estExempteDeLexique(fichier) {
  return (
    fichier.includes(join("app", "legal")) ||
    fichier.includes(join("components", "legal")) ||
    fichier.includes(join("components", "diagnostic"))
  );
}

/**
 * Ce qui ressemble à du code plutôt qu'à une phrase : liste de classes CSS, chemin, identifiant.
 * Sans ce filtre, `chat-bubble--assistant` serait signalé comme un manquement au lexique, le
 * contrôle crierait sur du vrai, et on le désactiverait au bout de trois jours.
 */
function ressembleADuCode(texte) {
  if (texte.includes("/") || texte.includes("_")) return true;
  if (/^[a-z0-9 -]+$/.test(texte) && texte.includes("-")) return true;
  return false;
}

/** Un mot lisible, seul, suffit : « Sentio — Dashboard » ne contient aucune PHRASE. */
const UN_MOT = /[A-Za-zÀ-ÿ]{2,}/;

/**
 * Les morceaux de texte qu'une personne lira, dans une ligne de composant.
 *
 * ⚠️ TROIS SOURCES, ET LA TROISIÈME A ÉTÉ AJOUTÉE APRÈS COUP.
 *
 * La première version ne lisait que le texte encadré par deux balises sur la MÊME ligne, plus les
 * lignes entièrement faites de texte. Elle laissait donc passer la forme la plus courante en JSX :
 * un paragraphe dont la ligne commence par du texte et se termine par une balise en ligne, comme
 * « Le lien vous connecte directement — <b>pas de mot de passe</b>. ». Quatre tirets bien visibles
 * sur le site sont passés à travers, et ils n'ont été trouvés qu'en lisant la page rendue.
 *
 * On retire donc les balises et les expressions, et **ce qui reste est du texte**. Cette
 * extraction ne vaut que pour les fichiers `.tsx` : ailleurs, une ligne dépouillée de ses
 * accolades est du code, pas une phrase.
 */
function textesVisiblesDe(ligne, estUnComposant) {
  const morceaux = [];

  if (estUnComposant) {
    const horsBalises = ligne.replace(/<[^>]*>/g, "\n").replace(/\{[^{}]*\}/g, "\n");
    for (const morceau of horsBalises.split("\n")) {
      // Une ligne de code dépouillée de ses balises reste du code. « = » et « ; » suffisent à
      // les séparer : une déclaration en porte au moins un, une phrase de paragraphe jamais.
      // Sans ce filtre, « const agentInstanceId = params.get("agent") » était signalé comme un
      // manquement au lexique, ce qui est faux — et trois faux signalements suffisent à faire
      // désactiver un contrôle.
      //
      // ⚠️ Les entités HTML d'abord, et c'est tout sauf un détail : « &apos; » se termine par un
      // point-virgule. Sans ce retrait, le filtre écartait toute phrase française contenant une
      // apostrophe — c'est-à-dire presque toutes, et il l'a fait en silence.
      const sansEntites = morceau.replace(/&[a-zA-Z]+;/g, "'");
      if (sansEntites.includes("=") || sansEntites.includes(";")) continue;
      if (UN_MOT.test(sansEntites)) morceaux.push(sansEntites);
    }
  }

  // Les attributs lus par une personne, et les chaînes qui portent du texte : titre d'onglet,
  // description, libellé de bouton, message d'erreur.
  for (const trouve of ligne.matchAll(/"([^"\\]{6,})"|'([^'\\]{6,})'|`([^`\\$]{6,})`/g)) {
    const chaine = trouve[1] ?? trouve[2] ?? trouve[3];
    if (UN_MOT.test(chaine)) morceaux.push(chaine);
  }

  return morceaux;
}

async function verifierTextesVisibles() {
  const fichiers = await fichiersDe(join(REPO_ROOT, "apps", "vitrine", "src"), [".ts", ".tsx"], [
    ".test.ts",
    ".test.tsx",
  ]);

  for (const fichier of fichiers) {
    const contenu = sansCommentaires(await readFile(fichier, "utf8"));
    const exempte = estExempteDeLexique(fichier);
    const estUnComposant = fichier.endsWith(".tsx");

    for (const { texte, numero } of lignesDe(contenu)) {
      for (const morceau of textesVisiblesDe(texte, estUnComposant)) {
        const visible = morceau.trim();
        if (visible.length < 4 || ressembleADuCode(visible)) continue;

        // ⚠️ DEUX SEUILS, ET PAS UN SEUL.
        //
        // Le lexique ne se juge que sur une PHRASE : un mot isolé est presque toujours un nom de
        // classe ou un identifiant, et le contrôle crierait sur du code. Un tiret, lui, se voit
        // dans un titre de deux mots. Exiger une phrase pour les deux laissait passer
        // « Sentio — Dashboard », qui ne contient aucun couple de mots adjacents : c'était
        // pourtant le titre d'onglet de toute l'application.
        if (TIRET_VISIBLE.test(visible)) {
          signaler(
            fichier,
            numero,
            "aucun tiret dans un texte visible",
            `écrit « ${visible.slice(0, 60)} ». Le tiret est un raccourci : une virgule, un ` +
              `deux-points ou une phrase de plus disent la même chose sans faire buter l'œil. ` +
              `Demande explicite du fondateur ; les commentaires de code n'en sont pas concernés.`,
          );
        }

        if (exempte || !PHRASE.test(visible)) continue;
        const interdit = MOTS_INTERDITS.exec(visible);
        if (interdit !== null) {
          signaler(
            fichier,
            numero,
            "le lexique est imposé",
            `écrit « ${interdit[0]} » dans « ${visible.slice(0, 50)} ». Ce mot est interdit dans ` +
              `un texte visible par un client (docs/17-lexique.md, source unique). On dit ` +
              `« employé numérique » ou « collaborateur », jamais le vocabulaire technique interne.`,
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
    // ⚠️ NUANCE ASSUMÉE, ajoutée le 2026-08-07 en écrivant la racine de composition.
    //
    // `fetch(` n'est qu'un INDICE d'appel de fournisseur, pas la faute elle-même. Le test
    // d'intégration du worker parle HTTP à SON PROPRE serveur, sur la boucle locale — il n'y a
    // là aucun fournisseur, et le contrôle criait sur le seul test qui prouve que Sentio démarre.
    //
    // On ne le contourne pas, on le resserre : l'indice générique ne s'applique plus aux
    // fichiers de test, mais les trois motifs qui désignent RÉELLEMENT un fournisseur — adresse,
    // SDK, clé — continuent de s'appliquer partout, tests compris. Une clé de fournisseur ou une
    // adresse d'API dans un test reste donc refusée, ce qui est le cas qui compte.
    const estUnTest = fichier.endsWith(".test.ts");
    for (const { texte, numero } of lignesDe(contenu)) {
      if (texte.trimStart().startsWith("*") || texte.trimStart().startsWith("//")) continue;
      for (const { motif, quoi } of TRACES_FOURNISSEUR) {
        if (estUnTest && quoi === "un appel réseau direct") continue;
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

// ─────────────────────────────────────────────────────────────────────────────
// 6. Recruter un employé, c'est choisir son autonomie — explicitement.
//
// Décision produit du fondateur (2026-08-07, `docs/adr/0026`) : le mode vendu est
// « confirmer une fois ». La colonne `employee.autonomy` a pour défaut `confirm`, volontairement
// PLUS strict : un défaut permissif ferait de l'oubli de réglage une autorisation, et la sécurité
// ne se décide pas par omission (AGENTS.md, invariant 6).
//
// Les deux ne se contredisent que si personne ne pose la valeur au moment du recrutement. C'est
// exactement ce que cette règle attrape : une insertion d'employé qui ne nomme pas `autonomy`
// livre au client un employé qui redemandera son accord à chaque envoi, sans que quiconque l'ait
// décidé. Les fixtures de test en sont exclues : le défaut prudent leur convient.
// ─────────────────────────────────────────────────────────────────────────────

async function verifierAutonomieAuRecrutement() {
  const racines = [join(REPO_ROOT, "apps"), join(REPO_ROOT, "packages"), join(REPO_ROOT, "supabase", "functions")];

  for (const racine of racines) {
    const fichiers = await fichiersDe(racine, [".ts"], [".test.ts", "_generated"]);
    for (const fichier of fichiers) {
      const contenu = await readFile(fichier, "utf8");
      // Les colonnes d'un `insert into employee (…)`, y compris écrites sur plusieurs lignes.
      for (const trouve of contenu.matchAll(/insert\s+into\s+"?employee"?\s*\(([^)]*)\)/gi)) {
        const colonnes = (trouve[1] ?? "").toLowerCase();
        if (colonnes.includes("autonomy")) continue;
        const numero = contenu.slice(0, trouve.index).split("\n").length;
        signaler(
          fichier,
          numero,
          "l'autonomie se choisit au recrutement",
          "insère un employé sans nommer `autonomy`. Le mode vendu est « confirmer une fois » " +
            "(adr/0026) ; le défaut de la base est `confirm`, plus strict à dessein. Sans choix " +
            "explicite ici, le client reçoit un employé dont personne n'a réglé l'autonomie.",
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Dans l'espace du client, chaque lecture nomme son entreprise.
//
// ⚠️ CE QUE CETTE RÈGLE A DÉJÀ ATTRAPÉ, ET POURQUOI RLS NE SUFFIT PAS.
//
// `/espace` lit par le client à SESSION, donc RLS s'applique : un inconnu ne voit rien. Ça n'a
// jamais été en cause, et ça ne l'est toujours pas.
//
// Ce qui l'était : RLS rend les lignes de TOUTES les entreprises du compte connecté. Six lectures
// n'en nommaient aucune. Un dirigeant rattaché à deux entreprises — deux sociétés, ou simplement
// deux invitations à la même adresse — voyait le nom et les chiffres de l'une avec l'employée de
// l'autre, et l'attribution changeait d'un rechargement au suivant, puisque Postgres ne promet
// aucun ordre sans `order by`.
//
// **Une garantie qui protège d'autrui ne protège pas de soi-même.** RLS répond à « qui a le droit
// de voir » ; elle ne répond pas à « laquelle des miennes je regarde ». La seconde question se
// tranche par un filtre explicite, et celui-ci se vérifie.
//
// La règle vise les tables portant une entreprise. `identity` et `tenant` en sont exclues : la
// première se lit par l'identifiant d'un employé déjà borné, la seconde par son propre `id`.
// ─────────────────────────────────────────────────────────────────────────────

const TABLES_PAR_ENTREPRISE = [
  "employee",
  "objective",
  "notification",
  "learned_fact",
  "lady_configuration",
  "lady_configuration_capability",
  "tenant_variant_preference",
  "tenant_member",
  "task",
  "outcome",
  "lead",
];

async function verifierLecturesDeLEspace() {
  const racine = join(REPO_ROOT, "apps", "vitrine", "src", "app", "espace");
  const fichiers = await fichiersDe(racine, [".ts", ".tsx"]);

  for (const fichier of fichiers) {
    const contenu = sansCommentaires(await readFile(fichier, "utf8"));

    for (const trouve of contenu.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
      const table = trouve[1];
      if (!TABLES_PAR_ENTREPRISE.includes(table)) continue;

      // La suite de la chaîne d'appels, jusqu'à la fin de l'expression : c'est là que le filtre
      // doit se trouver. On s'arrête à la première ligne qui ne prolonge pas la chaîne.
      //
      // ⚠️ UNE DÉCOUPE QUI ÉCHOUE REND LA FENÊTRE ENTIÈRE, JAMAIS RIEN. La version d'avant faisait
      // les deux d'un coup, avec `{0,600}?` suivi d'une fin obligatoire : quand aucune fin
      // n'apparaissait dans les 600 caractères, l'expression ne trouvait AUCUNE correspondance,
      // la chaîne examinée devenait vide, et une lecture parfaitement filtrée était dénoncée.
      //
      // Ça s'est produit pour de vrai : quatre lignes de commentaire et deux `.order` ajoutés à
      // une lecture correcte ont repoussé le `const` suivant au-delà de la fenêtre, et le
      // contrôle a accusé du code juste. **Un contrôle qui ment coûte plus cher que pas de
      // contrôle** : on apprend à ne plus le croire, et le jour où il a raison, on passe outre.
      const fenetre = contenu.slice(trouve.index ?? 0, (trouve.index ?? 0) + 600);
      const fin = /\n\s*(?:const|let|return|\}|\/\/)/.exec(fenetre);
      const chaine = fin === null ? fenetre : fenetre.slice(0, fin.index);
      if (/\.eq\(\s*["'`]tenant_id["'`]/.test(chaine)) continue;
      // `tenant_member` est la lecture qui ÉTABLIT l'entreprise : elle ne peut pas la présupposer.
      if (table === "tenant_member") continue;

      const numero = contenu.slice(0, trouve.index).split("\n").length;
      signaler(
        fichier,
        numero,
        "chaque lecture de l'espace nomme son entreprise",
        `lit « ${table} » sans « .eq("tenant_id", …) ». RLS borne cette lecture aux entreprises ` +
          `du compte connecté, pas à CELLE qui est affichée : un dirigeant rattaché à deux ` +
          `entreprises verrait les chiffres de l'une avec l'employée de l'autre. Le filtre ` +
          `explicite est la seule garantie contre un mélange entre ses propres entreprises.`,
      );
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 8. Dans l'espace du client, ce qui parle d'UNE employée la nomme.
//
// ⚠️ C'EST LA RÈGLE 7, UN CRAN PLUS BAS — ET ELLE A ATTRAPÉ UN VRAI DÉFAUT.
//
// La règle 7 empêche de mélanger deux entreprises d'un même dirigeant. Celle-ci empêche de
// mélanger deux employées d'une même entreprise, et le raisonnement est identique : ni RLS ni le
// filtre par entreprise ne répondent à « LAQUELLE de mes employées je regarde ».
//
// Ce qui a été trouvé : le chat de l'espace recevait l'entreprise, puis cherchait une employée
// tout seul avec un `limit 1` SANS `order by`, indépendamment de celle que la page affichait.
// Postgres ne promet aucun ordre sans `order by`. Le dirigeant pouvait donc lire la fiche de
// l'une et interroger l'état de l'autre — dans la même page, avec une attribution qui changeait
// d'un rechargement au suivant.
//
// Et les comptes eux-mêmes agrégeaient toute l'entreprise : deux employées, et chacune se serait
// attribué le travail de l'autre en répondant « voilà ce que j'ai fait ». Ce n'est pas une fuite
// vers un tiers, c'est un mensonge sur l'auteur du travail — et le produit ne tient que là-dessus.
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qui n'a de sens que rapporté à UNE employée, et le mot qui doit accompagner sa lecture. */
const CE_QUI_APPARTIENT_A_UNE_EMPLOYEE = [
  "travail_sur_la_periode",
  "bilan_de_l_employe",
  // La courbe est présentée comme le travail de l'employée : elle doit compter le sien.
  "serie_quotidienne",
  "conversation_message",
];

async function verifierCeQuiNommeSonEmployee() {
  const racine = join(REPO_ROOT, "apps", "vitrine", "src", "app", "espace");
  const fichiers = await fichiersDe(racine, [".ts", ".tsx"]);

  for (const fichier of fichiers) {
    const contenu = sansCommentaires(await readFile(fichier, "utf8"));

    for (const quoi of CE_QUI_APPARTIENT_A_UNE_EMPLOYEE) {
      for (const trouve of contenu.matchAll(new RegExp(quoi, "g"))) {
        // L'appel complet : la requête, puis le tableau de ses paramètres. C'est là que
        // l'identifiant de l'employée doit apparaître.
        const apres = contenu.slice(trouve.index ?? 0, (trouve.index ?? 0) + 700);

        // ⚠️ CE QUE CE CONTRÔLE PROUVE, ET CE QU'IL NE PROUVE PAS. Il constate que l'employée est
        // NOMMÉE près de la lecture ; il ne vérifie pas qu'elle est passée au bon paramètre. C'est
        // volontairement grossier — comme la règle 7 — parce que le défaut visé est l'OUBLI, pas
        // l'erreur d'argument, que le typage attrape déjà. Le dire ici évite qu'on lui prête une
        // garantie qu'il n'apporte pas.
        if (/employee_?[iI]d|employe\.id/.test(apres)) continue;

        const numero = contenu.slice(0, trouve.index).split("\n").length;
        signaler(
          fichier,
          numero,
          "ce qui parle d'une employée la nomme",
          `lit « ${quoi} » sans nommer l'employée. Le filtre par entreprise ne dit pas LAQUELLE ` +
            `de ses employées le dirigeant regarde : deux employées dans la même entreprise ` +
            `s'attribueraient le travail l'une de l'autre, et le chat pourrait répondre au nom ` +
            `d'une autre que celle affichée. Passez son identifiant.`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Une action serveur qui reçoit une entreprise vérifie qu'elle est la sienne.
//
// ⚠️ CE QUE LES RÈGLES 7 ET 8 NE COUVRENT PAS, ET QUI A LAISSÉ PASSER UNE FUITE.
//
// Les règles 7 et 8 vérifient qu'une lecture NOMME son entreprise et son employée. Elles ne
// vérifient pas qu'on a le DROIT de les lire — et ce sont deux questions différentes. Une lecture
// parfaitement nommée sur l'entreprise de quelqu'un d'autre passe les deux règles.
//
// Le défaut trouvé : `filDeLaConversation` était exportée d'un fichier `"use server"`, donc
// atteignable depuis le navigateur, recevait `tenantId` et `employeeId` de l'appelant, et lisait
// `conversation_message` par le pool de service — dont le rôle porte `rolbypassrls`. Deux
// identifiants suffisaient à lire le fil privé d'une autre entreprise. Sept actions du même
// fichier appelaient `isAuthorizedForTenant` en première ligne ; la huitième l'avait oublié.
//
// C'est exactement le genre de règle que l'adr/0024 veut voir passer de la mémoire à la machine :
// « toutes les autres le font » n'est pas une garantie, c'est une statistique.
//
// ⚠️ CE QUE CE CONTRÔLE PROUVE, ET CE QU'IL NE PROUVE PAS. Il constate que la vérification est
// APPELÉE dans la fonction qui reçoit l'entreprise ; il ne prouve pas qu'elle est appelée avant
// la lecture, ni qu'on a passé le bon identifiant. Comme les règles 7 et 8, il vise l'OUBLI —
// le défaut réellement observé — et pas l'erreur d'argument, que le typage attrape déjà.
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qui atteste qu'une action a vérifié l'appartenance avant d'agir. */
const GARDES_D_APPARTENANCE = ["isAuthorizedForTenant", "requireTenantAccess"];

async function verifierActionsQuiRecoiventUneEntreprise() {
  const racine = join(REPO_ROOT, "apps", "vitrine", "src");
  const fichiers = await fichiersDe(racine, [".ts"], ["test-support"]);

  for (const fichier of fichiers) {
    if (fichier.includes(".test.")) continue;
    const brut = await readFile(fichier, "utf8");
    // Seuls les fichiers d'actions serveur sont concernés : ailleurs, une fonction exportée n'est
    // pas un point d'entrée réseau, et exiger la garde y serait du bruit.
    if (!/["']use server["']/.test(brut)) continue;

    const contenu = sansCommentaires(brut);
    const DEBUT = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g;

    for (const trouve of contenu.matchAll(DEBUT)) {
      const nom = trouve[1];
      const depuis = trouve.index ?? 0;

      // Le corps s'arrête au prochain export de premier niveau, ou à la fin du fichier. C'est
      // grossier et suffisant : une garde posée après la fin de sa propre fonction serait de
      // toute façon un défaut.
      const suite = contenu.slice(depuis + 1);
      const prochain = /\nexport\s/.exec(suite);
      const corps = prochain === null ? suite : suite.slice(0, prochain.index);

      // La signature seule : de la parenthèse ouvrante à la première accolade du corps.
      const ouvre = corps.indexOf("(");
      const accolade = corps.indexOf("{", ouvre);
      const signature = accolade === -1 ? corps.slice(ouvre) : corps.slice(ouvre, accolade);
      if (!/\btenantId\b/.test(signature)) continue;

      if (GARDES_D_APPARTENANCE.some((garde) => corps.includes(garde))) continue;

      const numero = contenu.slice(0, depuis).split("\n").length;
      signaler(
        fichier,
        numero,
        "une action serveur qui reçoit une entreprise vérifie l'appartenance",
        `« ${nom} » reçoit « tenantId » de l'appelant sans appeler ${GARDES_D_APPARTENANCE.join(
          " ni ",
        )}. Une fonction exportée d'un fichier « use server » est un point d'entrée atteignable ` +
          `depuis le navigateur, et le pool de service contourne RLS : l'identifiant reçu ` +
          `désignerait l'entreprise de quelqu'un d'autre aussi bien que la sienne (adr/0014).`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Un chemin public déclare des données RÉELLES.
//
// ⚠️ CE QUE CETTE RÈGLE A ATTRAPÉ, ET POURQUOI RIEN D'AUTRE NE POUVAIT LE VOIR.
//
// Le diagnostic public et le conseiller envoyaient au modèle ce que le dirigeant venait de
// taper — nom de l'entreprise, secteur, effectif, difficultés, objectif — sous l'étiquette
// `dataClass: "test"`. Or la règle d'or du Gateway ne filtre que sur `"real"` : sous cette
// étiquette, elle ne se déclenchait **jamais**, et un fournisseur `free` — qui s'autorise à
// entraîner sur ce qu'il reçoit — recevait des données réelles.
//
// `adr/0009` le dit pourtant mot pour mot : « le diagnostic manipulant de la donnée réelle dès
// la première question ». L'étiquette contredisait la décision, en silence, et `pnpm run verify`
// restait vert — parce qu'aucun test ne pouvait constater qu'une CONSTANTE du code source était
// fausse. Un test peut vérifier que la règle d'or fonctionne quand on lui passe « real » ; il ne
// peut pas vérifier que l'appelant le lui passe. C'est exactement le trou que ce fichier comble.
//
// ⚠️ Ce contrôle vise l'ÉTIQUETTE, pas le fournisseur. Il ne dit rien de la conformité d'un
// provider — c'est le rôle d'`adr/0009` et de la règle d'or. Il dit seulement qu'un chemin public
// ne peut pas se déclarer « test ».
// ─────────────────────────────────────────────────────────────────────────────

/** Les modules dont tout appel de modèle porte de la donnée de visiteur. */
const CHEMINS_PUBLICS = [
  join("packages", "vitrine-core", "src", "diagnostic"),
  join("packages", "vitrine-core", "src", "advisor"),
];

async function verifierClasseDeDonneesPublique() {
  for (const relatif of CHEMINS_PUBLICS) {
    const fichiers = await fichiersDe(join(REPO_ROOT, relatif), [".ts"]);

    for (const fichier of fichiers) {
      if (fichier.includes(".test.")) continue;
      const contenu = sansCommentaires(await readFile(fichier, "utf8"));

      for (const trouve of contenu.matchAll(/dataClass\s*:\s*["'`](\w+)["'`]/g)) {
        if (trouve[1] === "real") continue;

        const numero = contenu.slice(0, trouve.index).split("\n").length;
        signaler(
          fichier,
          numero,
          "un chemin public déclare des données réelles",
          `déclare « dataClass: "${trouve[1]}" ». Le diagnostic et le conseiller reçoivent ce que ` +
            `le dirigeant tape sur son entreprise — donnée réelle dès la première question ` +
            `(adr/0009). Toute autre étiquette désarme la règle d'or, qui ne filtre que sur ` +
            `« real » : un fournisseur « free » recevrait alors ces données sans qu'aucune ligne ` +
            `ne s'y oppose.`,
        );
      }
    }
  }
}

async function main() {
  await verifierFonctions();
  await verifierInterfaceSansFournisseur();
  await verifierTextesVisibles();
  await verifierDomainePur();
  await verifierAppelsModele();
  await verifierAutonomieAuRecrutement();
  await verifierLecturesDeLEspace();
  await verifierCeQuiNommeSonEmployee();
  await verifierActionsQuiRecoiventUneEntreprise();
  await verifierClasseDeDonneesPublique();

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
