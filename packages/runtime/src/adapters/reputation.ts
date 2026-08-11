/**
 * METIER-21 — le retour du service d'expédition, et ce qu'on en fait.
 *
 * Deux gestes, dans cet ordre, et jamais l'un sans l'autre :
 *
 *   1. **fermer l'adresse** — un rebond définitif ou une plainte valent exclusion définitive.
 *      Réessayer une adresse morte abîme la réputation à chaque tentative, et réécrire à
 *      quelqu'un qui a signalé le message est la faute la plus coûteuse qui soit ;
 *   2. **réévaluer le domaine** — si les taux dépassent, on suspend. L'envoi s'arrête alors tout
 *      seul, et **ne redémarre pas tout seul** : c'est `peut_envoyer()` qui refusera, et il faudra
 *      une décision humaine pour lever la suspension (`docs/adr/0017`).
 *
 * La fenêtre d'observation est de sept jours : assez large pour que les taux veuillent dire
 * quelque chose, assez courte pour qu'un incident ancien n'empêche pas de repartir.
 */

import { evaluateReputation, suppressionFor } from "@sentio/capabilities";
import type { SqlClient } from "@sentio/db";

export type DeliveryFeedbackKind = "bounce" | "complaint" | "unsubscribe";

export interface DeliveryFeedback {
  readonly tenantId: string;
  /** L'identifiant rendu par le service au moment de l'envoi (migration 0040). */
  readonly providerMessageId: string;
  readonly kind: DeliveryFeedbackKind;
  readonly email: string;
}

export interface FeedbackOutcome {
  /** Le message a-t-il été retrouvé ? Un retour orphelin est une anomalie, pas un silence. */
  readonly matched: boolean;
  readonly suspended: boolean;
  readonly detail: string;
}

const STATUS_OF: Record<DeliveryFeedbackKind, string> = {
  bounce: "rebond",
  complaint: "plainte",
  unsubscribe: "repondu",
};

export class PostgresDeliveryFeedback {
  constructor(private readonly sql: SqlClient) {}

  async apply(feedback: DeliveryFeedback): Promise<FeedbackOutcome> {
    const [message] = await this.sql.query<{ id: string; sending_domain_id: string }>(
      `update outbound_message set status = $3
        where tenant_id = $1 and provider_message_id = $2
        returning id, sending_domain_id`,
      [feedback.tenantId, feedback.providerMessageId, STATUS_OF[feedback.kind]],
    );

    // 1. Fermer l'adresse — même si le message n'a pas été retrouvé. Une exclusion vaut toujours
    //    mieux qu'un envoi de plus, et un retour orphelin reste un refus exprimé par quelqu'un.
    const suppression = suppressionFor({ kind: feedback.kind, email: feedback.email });
    await this.sql.query(
      `insert into suppression (tenant_id, pattern, kind, reason)
       values ($1, $2, $3, $4)
       on conflict (tenant_id, pattern) do nothing`,
      [feedback.tenantId, suppression.pattern, suppression.kind, suppression.reason],
    );

    if (message === undefined) {
      return { matched: false, suspended: false, detail: "retour sans message correspondant" };
    }

    // 2. Réévaluer le domaine sur les sept derniers jours.
    const suspended = await this.reassess(feedback.tenantId, message.sending_domain_id);
    return {
      matched: true,
      suspended: suspended !== null,
      detail: suspended ?? "sous les limites",
    };
  }

  /** Renvoie la raison de la suspension si elle vient d'être posée, `null` sinon. */
  async reassess(tenantId: string, sendingDomainId: string): Promise<string | null> {
    const [tally] = await this.sql.query<{ sent: string; bounced: string; complained: string }>(
      `select count(*) as sent,
              count(*) filter (where status = 'rebond') as bounced,
              count(*) filter (where status = 'plainte') as complained
         from outbound_message
        where tenant_id = $1 and sending_domain_id = $2
          and sent_at >= now() - interval '7 days'`,
      [tenantId, sendingDomainId],
    );

    const verdict = evaluateReputation({
      sent: Number(tally?.sent ?? 0),
      bounced: Number(tally?.bounced ?? 0),
      complained: Number(tally?.complained ?? 0),
    });
    if (!verdict.suspend) return null;

    // `suspended_at is null` : on ne réécrit pas la raison d'une suspension déjà en cours, sinon
    // on perdrait celle qui l'a réellement déclenchée.
    await this.sql.query(
      `update sending_domain
          set suspended_at = now(), suspension_reason = $3
        where tenant_id = $1 and id = $2 and suspended_at is null`,
      [tenantId, sendingDomainId, verdict.reason],
    );
    return verdict.reason;
  }
}
