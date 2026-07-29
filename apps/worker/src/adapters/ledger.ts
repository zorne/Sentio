/**
 * Le compteur de consommation, branché sur Postgres.
 *
 * `@sentio/core` déclare le port, il ne sait pas qui le remplit (`docs/02-architecture.md`).
 * L'adaptateur vit ici, dans le composant qui connaît à la fois le noyau et la base — c'est ce
 * qui permet au noyau d'être testé sans infrastructure, et à la base d'ignorer le noyau.
 *
 * ⚠️ Deux plafonds différents, à ne pas confondre :
 *   • celui d'une ENTREPRISE — `usage_counter` comparé à `plan_quota`, donc **lu en données** ;
 *   • celui d'une ENVELOPPE — `provider_quota`, le quota partagé de la plateforme, découpé pour
 *     qu'une journée de trafic sur la vitrine n'empêche pas les clients payants d'être servis.
 */

import type { InferenceEnvelope, UsageMetric } from "@sentio/config";
import type { UsageLedger } from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { TenantId } from "@sentio/domain";

/**
 * Bornes de la période d'une métrique.
 *
 * Une métrique « par jour » se compte sur la journée civile ; les autres sur la période
 * d'abonnement en cours. Sans cette distinction, un plafond journalier serait comparé au
 * compteur du mois, et ne se déclencherait jamais.
 */
export function periodFor(metric: UsageMetric, on: Date): { start: Date; end: Date } {
  if (metric.endsWith("_per_day")) {
    const start = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }
  const start = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), 1));
  const end = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth() + 1, 1));
  return { start, end };
}

export class PostgresUsageLedger implements UsageLedger {
  constructor(private readonly sql: SqlClient) {}

  async tenantUsage(tenantId: TenantId, metric: UsageMetric, on: Date): Promise<number> {
    const { start } = periodFor(metric, on);
    const rows = await this.sql.query<{ value: string }>(
      `select value from usage_counter
        where tenant_id = $1 and metric = $2 and period_start = $3`,
      [tenantId, metric, start],
    );
    return Number(rows[0]?.value ?? 0);
  }

  /**
   * Le plafond vient de la formule **en base**. Aucune condition « si formule = Start » n'existe
   * ici : ouvrir Growth reste une modification de données (`docs/03-modele-de-donnees.md`).
   * `null` signifie « aucun quota défini », ce qui n'est pas zéro.
   */
  async tenantLimit(tenantId: TenantId, metric: UsageMetric): Promise<number | null> {
    const rows = await this.sql.query<{ quota_limit: string }>(
      `select q.quota_limit
         from subscription s
         join plan_quota q on q.plan_id = s.plan_id
        where s.tenant_id = $1 and s.status = 'active' and q.metric = $2
        limit 1`,
      [tenantId, metric],
    );
    const limit = rows[0]?.quota_limit;
    return limit === undefined ? null : Number(limit);
  }

  async recordTenantUsage(
    tenantId: TenantId,
    metric: UsageMetric,
    amount: number,
    on: Date,
  ): Promise<void> {
    const { start, end } = periodFor(metric, on);
    // Incrément atomique : deux exécutants peuvent compter en même temps sans se perdre.
    await this.sql.query(
      `insert into usage_counter (tenant_id, metric, period_start, period_end, value)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, metric, period_start)
       do update set value = usage_counter.value + excluded.value, updated_at = now()`,
      [tenantId, metric, start, end, amount],
    );
  }

  async envelopeUsage(envelope: InferenceEnvelope): Promise<number> {
    const rows = await this.sql.query<{ consumed: string }>(
      `select coalesce(sum(consumed), 0) as consumed
         from provider_quota
        where envelope = $1 and now() >= window_start and now() < window_end`,
      [envelope],
    );
    return Number(rows[0]?.consumed ?? 0);
  }

  async recordEnvelopeUsage(
    envelope: InferenceEnvelope,
    providerKey: string,
    amount: number,
  ): Promise<void> {
    const updated = await this.sql.query<{ provider_key: string }>(
      `update provider_quota set consumed = consumed + $3
        where provider_key = $1 and envelope = $2
          and now() >= window_start and now() < window_end
        returning provider_key`,
      [providerKey, envelope, amount],
    );

    if (updated.length === 0) {
      // Pas de fenêtre ouverte : on en ouvre une pour la journée. Perdre le comptage parce que
      // personne n'avait créé la ligne reviendrait à rendre le plafond décoratif — exactement ce
      // que cette table existe pour empêcher.
      await this.sql.query(
        `insert into provider_quota (provider_key, envelope, window_start, window_end, consumed, quota_limit)
         values ($1, $2, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', $3, 0)
         on conflict (provider_key, envelope, window_start)
         do update set consumed = provider_quota.consumed + excluded.consumed`,
        [providerKey, envelope, amount],
      );
    }
  }
}
