/** Réalise : NOYAU-19 */

import type { ExecutionEvent } from "@sentio/domain";

import { DataAccessError, type SqlClient } from "./client.js";
import { rowToDomain } from "./naming.js";
import type { TenantScope } from "./tenant-scope.js";

/**
 * Rend une ligne de journal au domaine, en réparant le seul champ que la traduction de noms ne
 * peut pas réparer.
 *
 * `seq` est un `bigint`, et node-postgres rend les `bigint` en **texte** — parce qu'un `int8`
 * dépasse `Number.MAX_SAFE_INTEGER`. `rowToDomain` ne touche qu'aux clés, à raison : il ne sait
 * rien du sens des valeurs. Ici, on le sait. Sans cette conversion, `seq` vaudrait `"12"` et la
 * reconstruction d'un run refuserait le journal entier pour rang illisible.
 *
 * Le dépassement lève au lieu d'arrondir : un rang tronqué casserait l'ordre total sur lequel
 * repose toute la reprise, et le ferait sans bruit.
 */
function toExecutionEvent(row: Record<string, unknown>): ExecutionEvent {
  const event = rowToDomain<ExecutionEvent>(row);
  const seq = Number(event.seq);
  if (!Number.isSafeInteger(seq)) {
    throw new DataAccessError(
      `Rang de journal inexploitable (« ${String(event.seq)} ») : l'ordre du journal ne peut plus être garanti.`,
    );
  }
  return { ...event, seq };
}

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
    /** Le pas de run auquel l'événement appartient (EXEC-07). Nul hors d'un pas. */
    stepId?: string | null;
  }): Promise<ExecutionEvent> {
    if (event.kind.trim() === "") {
      throw new DataAccessError("Un événement de journal sans nature n'est pas exploitable.");
    }

    const rows = await this.sql.query<Record<string, unknown>>(
      `insert into "execution_event"
         ("tenant_id", "task_id", "employee_id", "kind", "idempotency_key", "payload", "step_id")
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        this.scope.tenantId,
        event.taskId,
        event.employeeId,
        event.kind,
        event.idempotencyKey,
        JSON.stringify(event.payload ?? {}),
        event.stepId ?? null,
      ],
    );

    const appended = rows[0];
    if (appended === undefined) {
      throw new DataAccessError("Ajout au journal sans ligne retournée.");
    }
    return toExecutionEvent(appended);
  }

  /** Les événements d'UN pas de run, dans l'ordre — la chaîne explicative (EXEC-07). */
  async forStep(taskId: string, stepId: string): Promise<ExecutionEvent[]> {
    const rows = await this.sql.query<Record<string, unknown>>(
      `select * from "execution_event"
       where "tenant_id" = $1 and "task_id" = $2 and "step_id" = $3
       order by "seq" asc`,
      [this.scope.tenantId, taskId, stepId],
    );
    return rows.map(toExecutionEvent);
  }

  /**
   * Les événements d'une tâche, dans l'ordre où ils se sont produits.
   *
   * `order by "seq"`, et surtout **pas** `created_at` : celui-ci vaut `now()`, c'est-à-dire
   * l'heure de DÉBUT DE TRANSACTION. Tous les événements écrits par un même pas de run le
   * partagent à la microseconde près, et l'ordre retombait alors sur l'ordre physique des
   * lignes — c'est-à-dire sur rien. Une reprise après interruption pouvait relire « action
   * exécutée » avant « action décidée » (EXEC-02).
   */
  async forTask(taskId: string): Promise<ExecutionEvent[]> {
    const rows = await this.sql.query<Record<string, unknown>>(
      `select * from "execution_event"
       where "tenant_id" = $1 and "task_id" = $2
       order by "seq" asc`,
      [this.scope.tenantId, taskId],
    );
    return rows.map(toExecutionEvent);
  }
}
