/**
 * L'hôte **Node** : il crée le pilote, et délègue tout le reste.
 *
 * La composition elle-même vit dans `@sentio/runtime` — les deux hôtes montent exactement les
 * mêmes pièces, et c'est ce qui rend la parité vérifiable ([`adr/0028`](../../../docs/adr/0028-executant-en-fonction-serveur.md)).
 * Ce fichier n'ajoute qu'une chose : `pg`.
 */

import {
  composerLExecutant,
  type ConfigurationWorker,
  type ExecutantMonte,
  type OptionsDeComposition,
} from "@sentio/runtime";

import { createPostgresClient } from "./adapters/postgres-node.js";

export type WorkerMonte = ExecutantMonte;

export function composerLeWorker(
  config: ConfigurationWorker,
  options: Omit<OptionsDeComposition, "sql" | "fermerLaBase"> = {},
): ExecutantMonte {
  const sql = createPostgresClient(config.databaseUrl);
  return composerLExecutant(config, { ...options, sql, fermerLaBase: () => sql.close() });
}
