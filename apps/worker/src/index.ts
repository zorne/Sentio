/**
 * Exécution en arrière-plan.
 *
 * En V1 : un point d'entrée signé, déclenché par un battement planifié (lot 3).
 * Ce module ne communique avec `apps/web` que **par la base et la file**, jamais par un appel
 * direct — c'est ce qui permettra d'en faire un service autonome sans rien réécrire
 * (`docs/02-architecture.md`).
 */
export {};
