import { USAGE_METRICS, type UsageMetric } from "./metrics.js";

/**
 * Valeurs de départ des trois formules — **utilisées uniquement par le seed** (`FOND-33`).
 *
 * À l'exécution, les quotas se lisent dans la table `plan`, jamais ici : ouvrir Growth doit être
 * une modification de données, pas un déploiement (`docs/03-modele-de-donnees.md`).
 *
 * ⚠️ Les valeurs chiffrées ci-dessous sont **provisoires** : aucune n'est tranchée dans la
 * documentation. Elles sont ajustables à tout moment en base sans redéploiement — c'est
 * précisément ce que cette architecture garantit.
 */

export type PlanTier = "start" | "growth" | "scale";

export interface PlanSeed {
  tier: PlanTier;
  /** Seul Start est commercialisable au lancement (`projet.md` §28). */
  commercialisable: boolean;
  /** Priorité dans la file d'exécution : c'est la promesse « priorité d'exécution ». */
  jobPriority: number;
  quotas: Record<UsageMetric, number>;
}

export const PLAN_SEEDS: readonly PlanSeed[] = [
  {
    tier: "start",
    commercialisable: true,
    jobPriority: 100,
    quotas: {
      [USAGE_METRICS.activeEmployees]: 1,
      [USAGE_METRICS.tasksPerPeriod]: 300,
      [USAGE_METRICS.outboundMessagesPerPeriod]: 500,
      [USAGE_METRICS.outboundMessagesPerDay]: 30,
      [USAGE_METRICS.inferenceTokensPerPeriod]: 2_000_000,
    },
  },
  {
    tier: "growth",
    commercialisable: false,
    jobPriority: 200,
    quotas: {
      [USAGE_METRICS.activeEmployees]: 3,
      [USAGE_METRICS.tasksPerPeriod]: 1_500,
      [USAGE_METRICS.outboundMessagesPerPeriod]: 2_500,
      [USAGE_METRICS.outboundMessagesPerDay]: 100,
      [USAGE_METRICS.inferenceTokensPerPeriod]: 10_000_000,
    },
  },
  {
    tier: "scale",
    commercialisable: false,
    jobPriority: 300,
    quotas: {
      [USAGE_METRICS.activeEmployees]: 10,
      [USAGE_METRICS.tasksPerPeriod]: 6_000,
      [USAGE_METRICS.outboundMessagesPerPeriod]: 10_000,
      [USAGE_METRICS.outboundMessagesPerDay]: 400,
      [USAGE_METRICS.inferenceTokensPerPeriod]: 40_000_000,
    },
  },
];
