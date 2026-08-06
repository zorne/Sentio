/**
 * Les accords humains, branchés sur Postgres.
 *
 * C'est l'implémentation du droit d'intervention humaine sur une décision automatisée
 * (`docs/10-securite-rgpd.md`). Deux tables, deux natures :
 *   • `standing_approval` — l'accord permanent de « confirmer une fois », révocable ;
 *   • `approval` — la demande ponctuelle, qui suspend la tâche jusqu'à réponse.
 */

import type { ApprovalStore } from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

export class PostgresApprovalStore implements ApprovalStore {
  constructor(private readonly sql: SqlClient) {}

  /**
   * Un accord permanent ne vaut que s'il est **en vigueur, ici, maintenant, pour cette
   * capacité**. Quatre conditions, et chacune ferme une porte distincte :
   *
   *   · `tenant_id` — un accord d'une autre entreprise n'autorise rien ici. La condition est
   *     redondante avec `employee_id` (un employé n'appartient qu'à une entreprise), et elle
   *     reste : une redondance qui coûte un index et ferme une fuite est un bon marché.
   *   · `capability_key` — l'accord porte sur UNE capacité nommée. Accorder « écrire à un
   *     prospect » n'autorise pas « supprimer des données » (migration `20260806120002`).
   *   · `revoked_at is null` — la révocation est immédiate. Une révocation qui ne prendrait
   *     effet qu'au prochain redémarrage ne serait pas une révocation.
   *   · `expires_at` — une échéance passée ne vaut plus accord. Comparée par la BASE (`now()`),
   *     jamais par l'horloge du processus : deux workers sur des machines désynchronisées
   *     n'auraient pas la même idée de « expiré ».
   *
   * Aucune de ces conditions n'est facultative, et l'absence de ligne vaut refus — c'est le
   * comportement sûr par défaut : sans accord, on suspend, on n'agit pas.
   */
  async hasStandingApproval(
    tenantId: TenantId,
    employeeId: EmployeeId,
    capabilityKey: string,
  ): Promise<boolean> {
    const rows = await this.sql.query<{ id: string }>(
      `select id from standing_approval
        where tenant_id = $1
          and employee_id = $2
          and capability_key = $3
          and revoked_at is null
          and (expires_at is null or expires_at > now())
        limit 1`,
      [tenantId, employeeId, capabilityKey],
    );
    return rows.length > 0;
  }

  async requestApproval(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    effectClass: string;
    capabilityKey: string;
  }): Promise<string> {
    // Une demande déjà en attente pour la même tâche ne se duplique pas : le client verrait deux
    // fois la même question, et deux réponses contradictoires deviendraient possibles.
    const existing = await this.sql.query<{ id: string }>(
      `select id from approval
        where tenant_id = $1 and task_id = $2 and state = 'requested'
        limit 1`,
      [input.tenantId, input.taskId],
    );
    const found = existing[0];
    if (found !== undefined) return found.id;

    const created = await this.sql.query<{ id: string }>(
      `insert into approval (tenant_id, task_id) values ($1, $2) returning id`,
      [input.tenantId, input.taskId],
    );
    const row = created[0];
    if (row === undefined) {
      throw new Error("Demande d'accord non créée : la tâche resterait suspendue sans recours.");
    }
    return row.id;
  }
}
