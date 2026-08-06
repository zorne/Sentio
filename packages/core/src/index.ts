/**
 * `@sentio/core` — le noyau : Model Gateway, Policy Engine, contexte, capacités, journal.
 *
 * Ce paquet ne connaît ni base ni réseau : il déclare des **ports** (`ports.ts`) que
 * `packages/db` et `apps/worker` branchent. C'est ce qui le rend testable sans infrastructure et
 * déplaçable sans réécriture (`docs/02-architecture.md`).
 *
 * L'interface n'appelle jamais un fournisseur de modèle ni une capacité directement : elle passe
 * par ici.
 */

export * from "./errors.js";
export * from "./ports.js";
export * from "./conversation/turn.js";
export * from "./model/provider.js";
export * from "./model/gateway.js";
export * from "./model/http/openai-compatible.js";
export * from "./policy/engine.js";
export * from "./context/assemble.js";
export * from "./capability/registry.js";
export * from "./journal/vocabulaire.js";
export * from "./journal/trace.js";
export * from "./journal/run-state.js";
export * from "./journal/trace-du-pas.js";
export * from "./runtime/next-action.js";
export * from "./runtime/execute-action.js";
export * from "./idempotency.js";
