/**
 * Le journal, branché sur Postgres.
 *
 * `packages/db` porte déjà l'écriture (`ExecutionJournal`, avec sa portée d'entreprise
 * obligatoire). Cet adaptateur ne fait que présenter cette écriture sous la forme du port du
 * noyau — et il crée un journal **par entreprise**, jamais un journal global : la portée reste
 * obligatoire jusqu'au dernier maillon (`docs/adr/0013`).
 */

import type { JournalWriter } from "@sentio/core";
import { ExecutionJournal, TenantScope, type SqlClient } from "@sentio/db";
import type { TenantId } from "@sentio/domain";

export class PostgresJournalWriter implements JournalWriter {
  private readonly journals = new Map<string, ExecutionJournal>();

  constructor(private readonly sql: SqlClient) {}

  async append(entry: {
    tenantId: TenantId;
    taskId: string | null;
    employeeId: string | null;
    kind: string;
    payload?: unknown;
    idempotencyKey?: string | null;
  }): Promise<void> {
    await this.journalFor(entry.tenantId).append({
      taskId: entry.taskId,
      employeeId: entry.employeeId,
      kind: entry.kind,
      payload: entry.payload ?? {},
      idempotencyKey: entry.idempotencyKey ?? null,
    });
  }

  private journalFor(tenantId: TenantId): ExecutionJournal {
    const existing = this.journals.get(tenantId);
    if (existing !== undefined) return existing;

    const journal = new ExecutionJournal(this.sql, TenantScope.of(tenantId));
    this.journals.set(tenantId, journal);
    return journal;
  }
}
