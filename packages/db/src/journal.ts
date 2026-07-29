import type { ExecutionEvent } from "@sentio/domain";

import { DataAccessError, type SqlClient } from "./client.js";
import type { TenantScope } from "./tenant-scope.js";

/**
 * Le journal d'exécution.
 *
 * ⚠️ Il n'hérite **pas** de `TenantScopedRepository`, et c'est délibéré : ce dernier expose
 * `update`, que la table refuse de toute façon par trigger. Offrir une méthode dont on sait
 * qu'elle échouera toujours est une invitation à l'essayer, puis à contourner le trigger.
 *
 * Ce repository n'expose donc que ce que le journal accepte : ajouter, et lire.
 * La purge de rétention à 30 jours n'est pas ici — c'est une opération d'exploitation, appelée
 * par le battement planifié (`purge_execution_events()`, `docs/adr/0012`).
 */
export class ExecutionJournal {
  constructor(
    private readonly sql: SqlClient,
    private readonly scope: TenantScope,
  ) {}

  /**
   * Ajoute un événement.
   *
   * `idempotencyKey` est **obligatoire pour toute action à effet extérieur** (AGENTS.md,
   * invariant 3). L'unicité est garantie par la base : un rejeu lève une violation d'unicité au
   * lieu d'envoyer un second email. Les événements sans effet extérieur — un raisonnement, une
   * lecture — passent `null` explicitement, pour que l'absence de clé soit un choix visible et
   * non un oubli.
   */
  async append(event: {
    taskId: string | null;
    employeeId: string | null;
    kind: string;
    idempotencyKey: string | null;
    payload?: unknown;
  }): Promise<ExecutionEvent> {
    if (event.kind.trim() === "") {
      throw new DataAccessError("Un événement de journal sans nature n'est pas exploitable.");
    }

    const rows = await this.sql.query<ExecutionEvent>(
      `insert into "execution_event"
         ("tenant_id", "task_id", "employee_id", "kind", "idempotency_key", "payload")
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [
        this.scope.tenantId,
        event.taskId,
        event.employeeId,
        event.kind,
        event.idempotencyKey,
        JSON.stringify(event.payload ?? {}),
      ],
    );

    const appended = rows[0];
    if (appended === undefined) {
      throw new DataAccessError("Ajout au journal sans ligne retournée.");
    }
    return appended;
  }

  /** Les événements d'une tâche, dans l'ordre où ils se sont produits. */
  async forTask(taskId: string): Promise<ExecutionEvent[]> {
    return this.sql.query<ExecutionEvent>(
      `select * from "execution_event"
       where "tenant_id" = $1 and "task_id" = $2
       order by "created_at" asc`,
      [this.scope.tenantId, taskId],
    );
  }
}
