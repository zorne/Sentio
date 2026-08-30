/**
 * `@sentio/runtime` — l'exécution d'un employé, **sans hôte**.
 *
 * ══ POURQUOI CE PAQUET EXISTE ══
 *
 * Il portait un autre nom : c'était `apps/worker`. Le jour où l'exécutant a dû tourner aussi sous
 * Deno ([`adr/0028`](../../../docs/adr/0028-executant-en-fonction-serveur.md)), il a fallu choisir
 * entre recopier la boucle dans une fonction serveur — donc en avoir deux versions, et un jour
 * deux comportements — ou l'extraire. Elle est extraite.
 *
 * Ce qui vit ici ne connaît **aucun runtime** : pas de `process`, pas de `Deno`, pas de serveur
 * HTTP, pas de pilote de base. Il reçoit un `SqlClient`, une horloge, un environnement — et il
 * travaille. C'est ce qui rend les deux hôtes possibles sans duplication :
 *
 *   · `apps/worker` — l'hôte Node : pilote `pg`, `node:http`, `process.env` ;
 *   · `supabase/functions/battement` — l'hôte Deno : pilote Deno, `Deno.serve`, `Deno.env`.
 *
 * Les deux montent **exactement les mêmes** pièces. Un test de parité le vérifie.
 */

export * from "./heartbeat/index.js";
export * from "./step-context.js";
export * from "./next-step.js";
export * from "./suite-du-run.js";
export * from "./attelage.js";
export * from "./battement.js";
export * from "./reprise.js";
export * from "./progression.js";
export * from "./reevaluation.js";
export * from "./reflexion.js";
export * from "./boucle.js";
export * from "./configuration.js";
export * from "./composition.js";
export * from "./adapters/capacites.js";
export * from "./adapters/moteurs.js";
export * from "./adapters/file-de-travaux.js";
export * from "./adapters/approvisionnement.js";
export * from "./adapters/prospects.js";
export * from "./adapters/ledger.js";
export * from "./adapters/approvals.js";
export * from "./adapters/autonomy.js";
export * from "./adapters/effects.js";
export * from "./adapters/journal.js";
export * from "./adapters/sending.js";
export * from "./adapters/reputation.js";
