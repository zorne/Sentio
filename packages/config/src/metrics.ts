/**
 * Clés de métriques de consommation.
 *
 * Ces clés sont le contrat entre `usage_counter` (ce qui est consommé) et `plan` (ce qui est
 * autorisé). Le code lit toujours un quota par sa clé — il ne teste jamais la formule elle-même
 * (`docs/03-modele-de-donnees.md`, règle : « aucune condition `si formule = Start` »).
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
