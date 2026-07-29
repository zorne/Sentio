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
   * ⚠️ `revoked_at is null` est le cœur de la révocation : le client doit pouvoir revenir en
   * arrière à tout moment, et l'effet doit être immédiat. Une révocation qui ne prendrait effet
   * qu'au prochain redémarrage ne serait pas une révocation.
   */
  async hasStandingApproval(
    tenantId: TenantId,
    employeeId: EmployeeId,
    effectClass: string,
  ): Promise<boolean> {
    const rows = await this.sql.query<{ id: string }>(
      `select id from standing_approval
        where tenant_id = $1 and employee_id = $2 and effect_class = $3 and revoked_at is null
        limit 1`,
      [tenantId, employeeId, effectClass],
    );
    return rows.length > 0;
  }

  async requestApproval(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    effectClass: string;
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
