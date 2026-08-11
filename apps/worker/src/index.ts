/**
 * `apps/worker` — l'hôte **Node** de l'exécutant.
 *
 * Tout ce qui exécute vit dans `@sentio/runtime`, qui ne connaît aucun runtime. Ici, et ici
 * seulement : le pilote Postgres de Node, le serveur `node:http`, et le processus.
 * L'hôte Deno est son jumeau — `supabase/functions/battement` ([`adr/0028`](../../../docs/adr/0028-executant-en-fonction-serveur.md)).
 */

export * from "@sentio/runtime";
export * from "./adapters/postgres-node.js";
export * from "./composition.js";
export * from "./serveur.js";
export * from "./main.js";
