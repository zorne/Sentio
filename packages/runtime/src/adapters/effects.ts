/**
 * EXEC-06 — le registre des effets, branché sur Postgres.
 *
 * ⚠️ **La propriété défendue ici ne peut pas l'être en JavaScript.** Deux workers qui décident
 * simultanément d'écrire au même prospect franchissent tous les deux n'importe quel
 * `if (dejaFait)` : entre la lecture et l'écriture, l'autre passe. Seule la base peut trancher,
 * et elle le fait avec l'index `execution_event_idempotency_idx`
 * (`unique (tenant_id, idempotency_key) where idempotency_key is not null`).
 *
 * `reserve()` ne lit donc rien avant d'écrire : il **tente l'insertion** et interprète le refus.
 * C'est la différence entre « je crois que personne ne l'a fait » et « la base garantit que
 * personne d'autre ne l'aura ».
 */

import { ACTION_ENGAGEE, type EffectLedger, type EtatEffet } from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

/** Code SQLSTATE d'une violation d'unicité. */
const VIOLATION_UNICITE = "23505";

function estViolationUnicite(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === VIOLATION_UNICITE) return true;
  // Selon le pilote, l'erreur d'origine est parfois emballée.
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return cause?.code === VIOLATION_UNICITE;
}

export class PostgresEffectLedger implements EffectLedger {
  constructor(private readonly sql: SqlClient) {}

  /**
   * Ce que le journal sait de cet effet.
   *
   * Trois états, jamais deux. « Engagé sans résultat » n'est pas une variante de « pas fait » :
   * c'est l'aveu qu'on ne sait pas si le monde extérieur a bougé, et c'est lui qui interdit de
   * rejouer un effet irréversible.
   *
   * Le rattachement passe par `payload->>'cle'` : la clé d'idempotence elle-même est réservée à
   * la ligne d'engagement, puisque l'unicité refuserait qu'une seconde ligne la porte.
   */
  async statusOf(tenantId: TenantId, idempotencyKey: string): Promise<EtatEffet> {
    const rows = await this.sql.query<{ kind: string; payload: Record<string, unknown> }>(
      `select kind, payload
         from execution_event
        where tenant_id = $1
          and (idempotency_key = $2 or payload->>'cle' = $2)
        order by seq asc`,
      [tenantId, idempotencyKey],
    );

    if (rows.length === 0) return { kind: "jamais_engage" };

    const execute = rows.find((row) => row.kind === "action_executee");
    if (execute !== undefined) {
      return { kind: "deja_execute", resultat: execute.payload["resultat"] ?? null };
    }

    // Chaque échec enregistré est une tentative achevée ; l'engagement lui-même en est une.
    const tentatives = rows.filter((row) => row.kind === "action_echouee").length;
    return { kind: "engage_sans_resultat", tentatives };
  }

  /**
   * Engage l'effet. Rend `false` si un autre l'a déjà engagé.
   *
   * L'insertion est **la** vérification : on n'interroge pas la base avant, parce qu'entre la
   * question et la réponse un autre worker aurait le temps d'écrire. Une violation d'unicité
   * n'est pas une erreur ici, c'est la réponse « quelqu'un d'autre a gagné ».
   */
  async reserve(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    capabilityKey: string;
    idempotencyKey: string;
    stepId?: string;
  }): Promise<boolean> {
    try {
      await this.sql.query(
        `insert into execution_event
           (tenant_id, task_id, employee_id, kind, idempotency_key, payload, step_id)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          input.tenantId,
          input.taskId,
          input.employeeId,
          ACTION_ENGAGEE,
          input.idempotencyKey,
          JSON.stringify({ capacite: input.capabilityKey }),
          input.stepId ?? null,
        ],
      );
      return true;
    } catch (error) {
      if (estViolationUnicite(error)) return false;
      // Toute autre panne remonte : la confondre avec « déjà engagé » ferait croire à un
      // doublon évité là où il n'y a qu'une base injoignable.
      throw error;
    }
  }

  /** Le résultat ou l'échec. Sans clé propre — elle est sur l'engagement — mais rattaché par
   *  `payload.cle`, ce que `statusOf` relit. */
  async record(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    kind: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    stepId?: string;
  }): Promise<void> {
    await this.sql.query(
      `insert into execution_event (tenant_id, task_id, employee_id, kind, payload, step_id)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.tenantId,
        input.taskId,
        input.employeeId,
        input.kind,
        JSON.stringify({ ...input.payload, cle: input.idempotencyKey }),
        input.stepId ?? null,
      ],
    );
  }
}
