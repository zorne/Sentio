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

import {
  inferenceEnvelopeBudget,
  type InferenceEnvelope,
  type UsageMetric,
} from "@sentio/config";
import type { UsageLedger } from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { TenantId } from "@sentio/domain";

/** Une métrique bornée à la journée civile plutôt qu'à la période de facturation. */
function isDaily(metric: UsageMetric): boolean {
  return metric.endsWith("_per_day");
}

/**
 * Bornes par défaut d'une métrique : la journée civile, ou le mois calendaire.
 *
 * Le mois calendaire n'est qu'un **repli** : la période qui fait foi est celle de l'abonnement
 * (voir `periodOf`). Un client inscrit le 20 ne voit pas son quota se remettre à zéro le 1er.
 */
export function periodFor(metric: UsageMetric, on: Date): { start: Date; end: Date } {
  if (isDaily(metric)) {
    const start = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()));
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }
  return {
    start: new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), 1)),
    end: new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth() + 1, 1)),
  };
}

export class PostgresUsageLedger implements UsageLedger {
  constructor(private readonly sql: SqlClient) {}

  /**
   * La période réellement applicable.
   *
   * Une métrique « par période » se compte sur la **période d'abonnement en cours**, pas sur le
   * mois calendaire : le quota de `plan_quota` est celui d'un cycle de facturation. Les compter
   * sur des bornes différentes donnerait à un client inscrit le 20 une remise à zéro le 1er —
   * c'est-à-dire deux fois son quota le premier mois, puis un décalage permanent.
   */
  private async periodOf(
    tenantId: TenantId,
    metric: UsageMetric,
    on: Date,
  ): Promise<{ start: Date; end: Date }> {
    if (isDaily(metric)) return periodFor(metric, on);

    const rows = await this.sql.query<{ current_period_start: Date; current_period_end: Date }>(
      `select current_period_start, current_period_end
         from subscription
        where tenant_id = $1 and status = 'active'
          and $2 >= current_period_start and $2 < current_period_end
        limit 1`,
      [tenantId, on],
    );
    const row = rows[0];
    if (row === undefined) return periodFor(metric, on);
    return { start: new Date(row.current_period_start), end: new Date(row.current_period_end) };
  }

  async tenantUsage(tenantId: TenantId, metric: UsageMetric, on: Date): Promise<number> {
    const { start } = await this.periodOf(tenantId, metric, on);
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
   *
   * ⚠️ Deux absences très différentes, et les confondre ouvrait un trou :
   *
   *   • **aucun abonnement actif** → plafond **0**. Un abonnement résilié, impayé, ou jamais
   *     souscrit ne donne pas droit à un travail illimité : c'est exactement l'inverse. Renvoyer
   *     « pas de quota défini » ici laissait un client résilié consommer sans aucune borne, aux
   *     frais de tous les autres — le quota du fournisseur étant unique et partagé.
   *   • **abonnement actif, mais métrique absente de la formule** → `null`, c'est-à-dire
   *     « aucun plafond défini pour cette métrique ». Cas normal d'une métrique introduite avant
   *     d'être semée.
   */
  async tenantLimit(tenantId: TenantId, metric: UsageMetric): Promise<number | null> {
    const rows = await this.sql.query<{ quota_limit: string | null }>(
      `select q.quota_limit
         from subscription s
         left join plan_quota q on q.plan_id = s.plan_id and q.metric = $2
        where s.tenant_id = $1 and s.status = 'active'
        limit 1`,
      [tenantId, metric],
    );

    const row = rows[0];
    if (row === undefined) return 0; // Pas d'abonnement actif : rien ne travaille.
    return row.quota_limit === null ? null : Number(row.quota_limit);
  }

  async recordTenantUsage(
    tenantId: TenantId,
    metric: UsageMetric,
    amount: number,
    on: Date,
  ): Promise<void> {
    const { start, end } = await this.periodOf(tenantId, metric, on);
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
      // Pas de fenêtre ouverte : on en ouvre une. Perdre le comptage parce que personne n'avait
      // créé la ligne reviendrait à rendre le plafond décoratif — exactement ce que cette table
      // existe pour empêcher.
      //
      // ⚠️ LA FENÊTRE EST MENSUELLE, ET CE N'EST PAS UN DÉTAIL DE STOCKAGE.
      //
      // `ModelGateway.assertEnvelopeHasRoom` compare la consommation rendue par `envelopeUsage`
      // à `tokensPerMonth * part` — un budget MENSUEL. `envelopeUsage` ne somme que les lignes
      // dont la fenêtre est ouverte à l'instant. Si cette fenêtre est journalière, on compare
      // donc la consommation d'un JOUR au budget d'un MOIS : la garde ne se déclenche que si une
      // seule journée épuise l'enveloppe entière du mois — 700 millions de jetons pour les
      // employés vendus. Autant dire jamais.
      //
      // C'était le cas jusqu'ici. La période de la fenêtre doit être celle du budget auquel on
      // la compare, sans quoi le plafond existe dans le code et pas dans les faits.
      //
      // La borne inscrite est celle que le Gateway applique : la part de l'enveloppe dans le
      // quota du fournisseur. Écrire 0 ferait de cette colonne un mensonge, et un jour une
      // surveillance lirait ce 0 en croyant lire un plafond.
      await this.sql.query(
        `insert into provider_quota (provider_key, envelope, window_start, window_end, consumed, quota_limit)
         values ($1, $2, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', $3, $4)
         on conflict (provider_key, envelope, window_start)
         do update set consumed = provider_quota.consumed + excluded.consumed`,
        [providerKey, envelope, amount, envelopeBudget(envelope)],
      );
    }
  }
}

/** La part de l'enveloppe dans le quota du fournisseur — la même valeur que celle du Gateway.
 *  La formule vit dans `@sentio/config` : deux copies dériveraient, et la colonne `quota_limit`
 *  finirait par contredire la garde qui la fait respecter. */
export function envelopeBudget(envelope: InferenceEnvelope): number {
  return inferenceEnvelopeBudget(envelope);
}
