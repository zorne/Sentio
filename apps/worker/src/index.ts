/**
 * Exécution en arrière-plan.
 *
 * En V1 : un point d'entrée signé, déclenché par un battement planifié (lot 3).
 * Ce module ne communique avec `apps/web` que **par la base et la file**, jamais par un appel
 * direct — c'est ce qui permettra d'en faire un service autonome sans rien réécrire
 * (`docs/02-architecture.md`).
 *
 * Ce qu'il contient aujourd'hui : le **câblage** du noyau. `@sentio/core` déclare des ports ;
 * les adaptateurs ci-dessous les branchent sur Postgres. Le noyau ignore la base, la base ignore
 * le noyau, et c'est ici que les deux se rencontrent — à un seul endroit.
 */

export * from "./heartbeat/index.js";
export * from "./step-context.js";
export * from "./next-step.js";
export * from "./adapters/ledger.js";
export * from "./adapters/approvals.js";
export * from "./adapters/autonomy.js";
export * from "./adapters/journal.js";
export * from "./adapters/sending.js";
export * from "./adapters/reputation.js";
