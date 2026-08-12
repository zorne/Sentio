/**
 * Seuils d'exploitation. Chaque valeur est adossée à une ligne de la documentation — ne pas en
 * ajouter une qui ne le serait pas.
 */

/**
 * Rétention du journal d'exécution.
 * → `docs/adr/0012-retention-journal-30-jours.md`
 */
export const EXECUTION_EVENT_RETENTION_DAYS = 30;

/**
 * Les trois enveloppes d'inférence. Le quota du fournisseur est unique et partagé : il doit être
 * découpé, sinon une journée de trafic sur la vitrine empêche les clients payants d'être servis.
 * → `docs/11-exploitation.md`
 */
export const INFERENCE_ENVELOPES = {
  /** Employés vendus — priorité maximale, jamais entamée par le reste. */
  soldEmployees: "sold_employees",
  /** Diagnostic public — plafonnée, limitée par visiteur et par adresse. */
  publicDiagnostic: "public_diagnostic",
  /** Interne et tests — résiduelle, plafond bas. */
  internal: "internal",
} as const;

export type InferenceEnvelope = (typeof INFERENCE_ENVELOPES)[keyof typeof INFERENCE_ENVELOPES];

/**
 * Part du plafond fournisseur réservée à chaque enveloppe. La part des employés vendus est un
 * plancher réservé, pas un plafond : elle ne peut jamais être consommée par les deux autres.
 */
export const INFERENCE_ENVELOPE_SHARE: Record<InferenceEnvelope, number> = {
  [INFERENCE_ENVELOPES.soldEmployees]: 0.7,
  [INFERENCE_ENVELOPES.publicDiagnostic]: 0.25,
  [INFERENCE_ENVELOPES.internal]: 0.05,
};

/**
 * Le budget d'une enveloppe, en tokens, sur la période que compte `INFERENCE_PROVIDER_LIMITS` —
 * le mois. **C'est la seule définition de ce budget dans le dépôt** : le noyau, l'adaptateur de
 * comptage et la vitrine s'y réfèrent tous, sans quoi trois formules finiraient par diverger et
 * le plafond ne voudrait plus rien dire.
 *
 * ⚠️ Le budget et la fenêtre de comptage doivent parler de la même durée. Comparer la
 * consommation d'une journée à un budget mensuel ferait une garde trente fois trop lâche —
 * c'est-à-dire décorative.
 */
export function inferenceEnvelopeBudget(envelope: InferenceEnvelope): number {
  return Math.floor(INFERENCE_PROVIDER_LIMITS.tokensPerMonth * INFERENCE_ENVELOPE_SHARE[envelope]);
}

/**
 * Seuils d'alerte, exprimés en part du plafond. La documentation donne « 60-70 % » : on alerte au
 * milieu de la fourchette pour laisser le temps d'agir.
 * → `docs/11-exploitation.md`, section « Seuils de rupture du €0 »
 */
export const ALERT_THRESHOLDS = {
  /** Débit d'inférence, en moyenne glissante — le débit est le facteur limitant, pas le volume. */
  inferenceRatePerMinute: 0.65,
  /** Volume d'inférence mensuel. */
  inferenceTokensPerMonth: 0.65,
  /** Volume de la base par rapport à l'offre gratuite. */
  databaseSize: 0.7,
} as const;

/**
 * Limite de débit du fournisseur d'inférence principal (Mistral, tier *Experiment*).
 * → `docs/adr/0009-fournisseur-inference-ue.md`
 *
 * ⚠️ Valeur datée du 2026-07-28, à re-vérifier en console avant la mise en service.
 */
export const INFERENCE_PROVIDER_LIMITS = {
  requestsPerMinute: 2,
  tokensPerMonth: 1_000_000_000,
} as const;

/**
 * Au-delà de ce délai, une tâche en attente d'accord humain déclenche une alerte : un client qui
 * n'a pas vu la demande croit que son employé ne travaille pas.
 * → `docs/11-exploitation.md`, surveillance minimale
 */
export const APPROVAL_PENDING_ALERT_HOURS = 48;

/**
 * Seuils de délivrabilité imposés par les grandes messageries.
 * → `docs/10-securite-rgpd.md`, « Obligations d'expéditeur »
 *
 * ⚠️ Ils ne servent pas à mesurer : ils servent à **suspendre**. Au-delà, l'envoi s'arrête tout
 * seul et ne redémarre pas tout seul — c'est la réputation du client qui est en jeu, et elle se
 * répare en mois (`docs/adr/0017`).
 */
export const DELIVERABILITY_THRESHOLDS = {
  /** Part de plaintes au-delà de laquelle un domaine est suspendu. */
  complaintRate: 0.003,
  /** Part de rebonds au-delà de laquelle un domaine est suspendu. */
  bounceRate: 0.02,
  /**
   * Nombre de messages en dessous duquel on ne conclut rien.
   *
   * Sans ce plancher, un seul rebond sur deux envois donnerait 50 % et suspendrait un domaine
   * en parfaite santé — le premier jour de la montée en charge, précisément quand les volumes
   * sont les plus faibles.
   */
  minimumVolume: 20,
} as const;
