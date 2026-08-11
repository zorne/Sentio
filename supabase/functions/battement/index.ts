/**
 * L'hôte **Deno** de l'exécutant — jumeau de `apps/worker`.
 *
 * ══ CE QUI EST ICI, ET CE QUI N'Y EST PAS ══
 *
 * Ici : `Deno.env`, `Deno.serve`, et le pilote Postgres de Deno. **Rien d'autre.**
 * Pas une ligne de logique métier, pas une décision, pas une requête — tout cela vit dans
 * `@sentio/runtime`, que les deux hôtes montent à l'identique. Un test de parité le vérifie sur
 * les comportements qui comptent.
 *
 * C'est la promesse de [`adr/0021`](../../../docs/adr/0021-execution-serveur-en-ue.md) (règle 4)
 * tenue jusqu'au bout : migrer, c'est réécrire un adaptateur, jamais le cœur.
 *
 * ══ UN SEUL TRAVAIL PAR INVOCATION ══
 *
 * `travauxMaxParBattement = 1`, et c'est le résultat direct de la mesure de `D16` : ce n'est pas
 * notre code qui remplit un battement, c'est le lissage de débit du fournisseur — 30 secondes
 * entre deux appels de modèle. Un battement qui enchaînerait dix pas dormirait 4 min 30 et
 * dépasserait la durée autorisée. Un travail par invocation, et le planificateur bat plus souvent
 * ([`adr/0028`](../../../docs/adr/0028-executant-en-fonction-serveur.md)).
 *
 * ⚠️ **Aucun moteur métier n'est enregistré**, comme côté Node : une proposition d'action est
 * refusée tant qu'il n'y en a pas. L'exécutant approvisionne, décide et journalise ; il n'agit
 * pas encore.
 *
 * Réalise : EXEC-19
 */

import {
  ConfigurationInvalide,
  composerLExecutant,
  lireLaConfiguration,
  type ExecutantMonte,
} from "@sentio/runtime";

import { PostgresDeno } from "./sql.ts";

/** Journal d'exploitation : JSON sur la sortie standard, comme les autres fonctions. */
function journaliser(record: Record<string, unknown>): void {
  console.log(JSON.stringify(record));
}

/**
 * Monte l'exécutant pour **une invocation**.
 *
 * Une fonction serveur ne vit pas entre deux requêtes : monter à chaque appel n'est pas un
 * gaspillage, c'est le modèle. Le pool est paresseux — une invocation refusée à la signature
 * n'ouvre aucune connexion.
 */
export function monter(env: Record<string, string | undefined>): ExecutantMonte {
  const config = lireLaConfiguration(env);
  return composerLExecutant(config, {
    sql: PostgresDeno.ouvrir(config.databaseUrl),
    log: journaliser,
    // ⚠️ La conclusion de D16, en une ligne.
    travauxMaxParBattement: 1,
  });
}

export async function repondre(requete: Request): Promise<Response> {
  let executant: ExecutantMonte;
  try {
    executant = monter(Deno.env.toObject());
  } catch (erreur) {
    if (erreur instanceof ConfigurationInvalide) {
      // Les noms des variables manquantes, jamais leurs valeurs. Ce journal est lu par un tiers.
      journaliser({ evenement: "demarrage_refuse", manquements: erreur.manquements });
      return new Response(JSON.stringify({ erreur: "Erreur interne." }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    throw erreur;
  }

  try {
    return await executant.battement(requete);
  } finally {
    await executant.fermer();
  }
}

if (import.meta.main) Deno.serve(repondre);
