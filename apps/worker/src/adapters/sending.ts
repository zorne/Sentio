/**
 * La garde d'envoi et le registre des messages, branchés sur Postgres.
 *
 * La règle des sept conditions vit **en base** (`public.peut_envoyer`, migration 0038) : elle
 * n'est pas recopiée ici, sous peine d'en avoir deux versions et d'en corriger une seule. Cet
 * adaptateur ne fait que lui donner ce qu'elle ne peut pas savoir toute seule — combien de
 * messages sont déjà partis aujourd'hui, et quel plafond la formule autorise — puis traduire sa
 * réponse.
 */

import { USAGE_METRICS } from "@sentio/config";
import type { UsageLedger } from "@sentio/core";
import type { OutboundMessageStore, SendingGuard, SendingVerdict } from "@sentio/capabilities";
import type { SqlClient } from "@sentio/db";
import type { TenantId } from "@sentio/domain";

export class PostgresSendingGuard implements SendingGuard {
  constructor(
    private readonly sql: SqlClient,
    private readonly ledger: UsageLedger,
  ) {}

  async check(input: {
    tenantId: string;
    leadId: string;
    sendingDomainId: string;
  }): Promise<SendingVerdict> {
    // Un plafond absent vaut zéro : sans abonnement actif, aucun message ne part. C'est la même
    // règle que pour l'inférence, et pour la même raison.
    const cap =
      (await this.ledger.tenantLimit(
        input.tenantId as TenantId,
        USAGE_METRICS.outboundMessagesPerDay,
      )) ?? 0;

    const [today] = await this.sql.query<{ count: string }>(
      `select count(*) as count from outbound_message
        where tenant_id = $1 and sent_at >= date_trunc('day', now())`,
      [input.tenantId],
    );

    const [verdict] = await this.sql.query<{ verdict: string }>(
      "select public.peut_envoyer($1, $2, $3, $4, $5) as verdict",
      [input.tenantId, input.leadId, input.sendingDomainId, Number(today?.count ?? 0), cap],
    );

    const reason = verdict?.verdict ?? "verdict_indisponible";
    if (reason !== "ok") return { allowed: false, reason };

    // L'adresse vient de la base, jamais de l'appelant : c'est la garde qui a validé CE
    // destinataire, et c'est donc à lui, et à personne d'autre, que le message peut partir.
    const [lead] = await this.sql.query<{ email: string; contact_name: string | null }>(
      "select email, contact_name from lead where tenant_id = $1 and id = $2",
      [input.tenantId, input.leadId],
    );
    if (lead?.email === undefined || lead.email === null) {
      return { allowed: false, reason: "prospect_sans_adresse" };
    }

    return {
      allowed: true,
      recipient:
        lead.contact_name === null
          ? { address: lead.email }
          : { address: lead.email, name: lead.contact_name },
    };
  }
}

export class PostgresOutboundMessages implements OutboundMessageStore {
  constructor(private readonly sql: SqlClient) {}

  /**
   * Réserve la clé en insérant la ligne **avant** l'envoi.
   *
   * `on conflict do nothing` fait de la contrainte d'unicité le seul arbitre : deux exécutants
   * qui tenteraient le même message à la même seconde, l'un des deux repart les mains vides.
   *
   * Les deux drapeaux d'obligation sont posés à `true` sans condition, et c'est volontaire : la
   * capacité d'envoi ne réserve qu'après avoir composé un message qui les porte — sinon elle a
   * déjà levé. La contrainte `outbound_message_carries_its_duties` reste le dernier filet.
   */
  async claim(input: {
    tenantId: string;
    leadId: string;
    employeeId: string;
    sendingDomainId: string;
    subject: string;
    idempotencyKey: string;
  }): Promise<boolean> {
    const rows = await this.sql.query<{ id: string }>(
      `insert into outbound_message
         (tenant_id, lead_id, employee_id, sending_domain_id, subject,
          carried_optout, carried_notice, idempotency_key)
       values ($1, $2, $3, $4, $5, true, true, $6)
       on conflict (tenant_id, idempotency_key) do nothing
       returning id`,
      [
        input.tenantId,
        input.leadId,
        input.employeeId,
        input.sendingDomainId,
        input.subject,
        input.idempotencyKey,
      ],
    );
    return rows.length > 0;
  }
}
