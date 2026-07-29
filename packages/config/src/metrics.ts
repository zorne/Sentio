/**
 * Clés de métriques de consommation.
 *
 * Ces clés sont le contrat entre `usage_counter` (ce qui est consommé) et `plan_quota` (ce qui
 * est autorisé). Le code lit toujours un quota par sa clé — il ne teste jamais la formule
 * elle-même (`docs/03-modele-de-donnees.md`, règle : « aucune condition `si formule = Start` »).
 *
 * ⚠️ Seules les CLÉS vivent ici. Les valeurs de quota sont en base, semées par la migration
 * `…031_seed_plans.sql`, qui fait foi. Les tenir aux deux endroits donnerait deux sources de
 * vérité pour un même chiffre, et un jour deux chiffres différents.
 */
export const USAGE_METRICS = {
  /** Employés numériques simultanément actifs dans l'entreprise. */
  activeEmployees: "active_employees",
  /** Tâches exécutées sur la période de facturation. */
  tasksPerPeriod: "tasks_per_period",
  /** Messages à effet extérieur envoyés sur la période. */
  outboundMessagesPerPeriod: "outbound_messages_per_period",
  /** Messages à effet extérieur envoyés dans la journée (garde-fou de délivrabilité). */
  outboundMessagesPerDay: "outbound_messages_per_day",
  /** Jetons d'inférence consommés sur la période. */
  inferenceTokensPerPeriod: "inference_tokens_per_period",
} as const;

export type UsageMetric = (typeof USAGE_METRICS)[keyof typeof USAGE_METRICS];
