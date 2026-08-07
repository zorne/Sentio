/**
 * L'environnement du worker : lu une fois, validé entièrement, ou refusé.
 *
 * ══ POURQUOI UN MODULE ENTIER POUR LIRE DES VARIABLES ══
 *
 * Parce qu'un service qui démarre à moitié configuré est pire qu'un service qui ne démarre pas.
 * Il répond, il a l'air vivant, et il ne fait rien — ou pire, il fait quelque chose de travers
 * avec une valeur que personne n'a choisie. Trois règles, et aucune n'est négociable :
 *
 *   1. **Tout est validé avant que quoi que ce soit ne démarre.** Aucun `process.env` n'est lu
 *      ailleurs que par ce fichier : une variable lue au milieu d'un traitement est une variable
 *      dont le manque se découvre en production, un mardi soir.
 *   2. **Tous les problèmes sont rendus d'un coup.** Échouer sur le premier oblige à redéployer
 *      pour découvrir le second. Une liste complète tient en une ligne de journal et fait gagner
 *      une heure.
 *   3. **Aucune valeur de secret ne sort d'ici** — ni dans un message d'erreur, ni dans un
 *      journal. Les messages ne citent que des NOMS de variables. Une chaîne de connexion citée
 *      dans une erreur finit dans un outil de suivi d'incidents, c'est-à-dire chez un tiers
 *      (`AGENTS.md`, invariant 7).
 *
 * ⚠️ Aucun défaut n'est « pratique ». Le seul défaut permis est celui qui **ferme** : le drapeau
 * d'opt-out vaut faux tant que personne ne l'a prouvé, et faux veut dire « aucune donnée réelle
 * ne part vers un modèle » (invariant 5).
 *
 * Réalise : EXEC-18
 */

import {
  DEFAULT_FEATURE_FLAGS,
  lireReglagesRuntime,
  type FeatureFlags,
  type ReglagesRuntime,
} from "@sentio/config";
import type { DataPolicy } from "@sentio/domain";

/** Un fournisseur de modèle, tel que l'environnement le décrit. */
export interface ConfigurationFournisseur {
  readonly key: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly dataPolicy: DataPolicy;
}

export interface ConfigurationWorker {
  readonly databaseUrl: string;
  readonly secretDuBattement: string;
  /** **L'ordre fait la chaîne de repli** : le principal d'abord, le secours ensuite. */
  readonly fournisseurs: readonly ConfigurationFournisseur[];
  readonly flags: FeatureFlags;
  readonly reglages: ReglagesRuntime;
  readonly port: number;
  /** Ce qui identifie cet exécutant dans les verrous de la file. Sert au diagnostic. */
  readonly nomDeLExecutant: string;
}

/** Toutes les variables lues, en un seul endroit — la liste que l'exploitation doit connaître. */
export const VARIABLES = {
  databaseUrl: "DATABASE_URL",
  secret: "SENTIO_HEARTBEAT_SECRET",
  optOutProuve: "SENTIO_OPT_OUT_PROUVE",
  port: "PORT",
  nomDeLExecutant: "SENTIO_NOM_EXECUTANT",
  principal: {
    url: "SENTIO_MODELE_PRINCIPAL_URL",
    modele: "SENTIO_MODELE_PRINCIPAL_NOM",
    cle: "SENTIO_MODELE_PRINCIPAL_CLE",
    politique: "SENTIO_MODELE_PRINCIPAL_POLITIQUE",
  },
  secours: {
    url: "SENTIO_MODELE_SECOURS_URL",
    modele: "SENTIO_MODELE_SECOURS_NOM",
    cle: "SENTIO_MODELE_SECOURS_CLE",
    politique: "SENTIO_MODELE_SECOURS_POLITIQUE",
  },
} as const;

/**
 * Un environnement inexploitable. Porte **tous** les manquements, jamais le premier seul.
 *
 * ⚠️ `manquements` ne contient que des noms de variables et des raisons. Jamais une valeur : cette
 * erreur est faite pour être journalisée.
 */
export class ConfigurationInvalide extends Error {
  constructor(readonly manquements: readonly string[]) {
    super(
      `Configuration inexploitable — ${manquements.length} problème(s) :\n  · ${manquements.join("\n  · ")}`,
    );
    this.name = "ConfigurationInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

function texte(env: Env, nom: string): string | undefined {
  const brut = env[nom];
  if (brut === undefined) return undefined;
  const propre = brut.trim();
  return propre === "" ? undefined : propre;
}

/**
 * Lit un groupe de fournisseur : les quatre variables ensemble, ou aucune.
 *
 * Un groupe à moitié rempli est refusé, jamais complété : une clé sans adresse, ou une adresse
 * sans politique de données, est une erreur de déploiement — la traiter « au mieux » ferait
 * démarrer un worker avec un fournisseur dont personne ne connaît la politique.
 */
function lireFournisseur(
  env: Env,
  cle: string,
  noms: { url: string; modele: string; cle: string; politique: string },
  manquements: string[],
): ConfigurationFournisseur | null {
  const url = texte(env, noms.url);
  const modele = texte(env, noms.modele);
  const apiKey = texte(env, noms.cle);
  const politique = texte(env, noms.politique);

  const presents = [url, modele, apiKey, politique].filter((v) => v !== undefined).length;
  if (presents === 0) return null;
  if (presents < 4) {
    manquements.push(
      `${noms.url} / ${noms.modele} / ${noms.cle} / ${noms.politique} : groupe incomplet — ` +
        "les quatre variables vont ensemble, ou aucune.",
    );
    return null;
  }

  if (politique !== "no_train" && politique !== "free") {
    manquements.push(
      `${noms.politique} : politique de données inconnue. Attendu « no_train » ou « free ». ` +
        "Une politique inventée laisserait passer une donnée réelle vers un fournisseur non conforme.",
    );
    return null;
  }

  if (!/^https:\/\//.test(url as string)) {
    // Pas de `http://` : une clé d'API en clair sur le réseau est une clé compromise.
    manquements.push(`${noms.url} : adresse non chiffrée. Seul « https:// » est accepté.`);
    return null;
  }

  return {
    key: cle,
    baseUrl: (url as string).replace(/\/+$/, ""),
    model: modele as string,
    apiKey: apiKey as string,
    dataPolicy: politique,
  };
}

/** Longueur minimale du secret du battement. Un secret court est un secret cassé. */
export const LONGUEUR_MINIMALE_DU_SECRET = 32;

/**
 * Lit et valide l'environnement. **Lève** si quoi que ce soit manque ou ne tient pas.
 *
 * L'environnement est passé en paramètre, jamais lu depuis `process.env` ici : c'est ce qui rend
 * les cas d'erreur testables sans toucher au processus.
 */
export function lireLaConfiguration(env: Env): ConfigurationWorker {
  const manquements: string[] = [];

  const databaseUrl = texte(env, VARIABLES.databaseUrl);
  if (databaseUrl === undefined) {
    manquements.push(`${VARIABLES.databaseUrl} : absente. Le worker n'a aucune base à servir.`);
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    manquements.push(`${VARIABLES.databaseUrl} : ce n'est pas une adresse Postgres.`);
  }

  const secret = texte(env, VARIABLES.secret);
  if (secret === undefined) {
    manquements.push(
      `${VARIABLES.secret} : absent. Sans lui le battement refuse tout — un point d'entrée qui ` +
        "s'ouvrirait faute de configuration serait ouvert le jour où personne ne regarde.",
    );
  } else if (secret.length < LONGUEUR_MINIMALE_DU_SECRET) {
    manquements.push(
      `${VARIABLES.secret} : trop court (${LONGUEUR_MINIMALE_DU_SECRET} caractères au minimum). ` +
        "Un secret devinable vaut un point d'entrée public, et le quota d'inférence avec.",
    );
  }

  // ⚠️ La borne est prise AVANT la lecture des fournisseurs, et pas sur la liste entière.
  // La version naïve — « signaler l'absence de fournisseur seulement si rien d'autre ne
  // manque » — masquait ce manquement dès qu'une autre variable était absente : on corrigeait
  // deux problèmes, on redéployait, et on découvrait le troisième. C'est exactement ce que la
  // règle 2 de ce module interdit, et c'est un test qui l'a attrapé.
  const avantLesFournisseurs = manquements.length;
  const fournisseurs = [
    lireFournisseur(env, "principal", VARIABLES.principal, manquements),
    lireFournisseur(env, "secours", VARIABLES.secours, manquements),
  ].filter((f): f is ConfigurationFournisseur => f !== null);
  const fournisseurDejaSignale = manquements.length > avantLesFournisseurs;

  if (fournisseurs.length === 0 && !fournisseurDejaSignale) {
    manquements.push(
      `${VARIABLES.principal.url} : aucun fournisseur de modèle configuré. Un employé sans ` +
        "modèle ne peut proposer aucune action — le worker tournerait sans jamais rien décider.",
    );
  }

  const optOut = texte(env, VARIABLES.optOutProuve);
  if (optOut !== undefined && optOut !== "true" && optOut !== "false") {
    manquements.push(
      `${VARIABLES.optOutProuve} : attendu « true » ou « false ». Toute autre valeur serait lue ` +
        "comme fausse, et une faute de frappe deviendrait silencieusement une preuve absente.",
    );
  }

  const portBrut = texte(env, VARIABLES.port);
  const port = portBrut === undefined ? 8080 : Number(portBrut);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    manquements.push(`${VARIABLES.port} : ce n'est pas un port valide.`);
  }

  let reglages: ReglagesRuntime | null = null;
  try {
    reglages = lireReglagesRuntime(env);
  } catch (erreur) {
    // `lireReglagesRuntime` refuse déjà toute valeur inexploitable, et son message ne cite que
    // le nom de la variable. On le reprend tel quel plutôt que d'en écrire un second.
    manquements.push(erreur instanceof Error ? erreur.message : String(erreur));
  }

  if (manquements.length > 0) throw new ConfigurationInvalide(manquements);

  return {
    databaseUrl: databaseUrl as string,
    secretDuBattement: secret as string,
    fournisseurs,
    flags: {
      ...DEFAULT_FEATURE_FLAGS,
      // ⚠️ Faux par défaut, et faux veut dire : aucune donnée réelle ne part vers un modèle.
      // Ce drapeau est le rempart de l'invariant 5, pas un réglage de confort.
      inferenceOptOutProven: optOut === "true",
    },
    reglages: reglages as ReglagesRuntime,
    port,
    nomDeLExecutant: texte(env, VARIABLES.nomDeLExecutant) ?? `worker-${process.pid}`,
  };
}
