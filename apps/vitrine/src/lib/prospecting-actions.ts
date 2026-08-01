// ════════════════════════════════════════════════════════════════════
// Server Actions — configuration + démarrage/arrêt de la prospection
// automatique, et consultation des décisions en attente. Réutilise
// launchSalesRunInternal (agent-actions.ts) plutôt que dupliquer le
// câblage AgentRuntime.
// ════════════════════════════════════════════════════════════════════

"use server";

import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { isAuthorizedForTenant } from "./tenant-access";
import { launchSalesRunInternal } from "./agent-actions";

export async function saveProspectingConfigAndStart(
  tenantId: string,
  agentInstanceId: string,
  params: { criteria: string; offer: string }
): Promise<{ taskId: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) throw new Error("Non autorisé.");
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    await db.query(
      `update agent_instance
       set config = config || jsonb_build_object('prospectingCriteria', $2::text, 'prospectingOffer', $3::text),
           is_active = true
       where id = $1`,
      [agentInstanceId, params.criteria, params.offer]
    );
    revalidatePath("/dashboard");
    return await launchSalesRunInternal(db, tenantId, agentInstanceId);
  } finally {
    await db.end();
  }
}

export async function setAgentActive(
  tenantId: string,
  agentInstanceId: string,
  active: boolean
): Promise<void> {
  if (!(await isAuthorizedForTenant(tenantId))) throw new Error("Non autorisé.");
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    await db.query(`update agent_instance set is_active = $2 where id = $1`, [agentInstanceId, active]);
    revalidatePath("/dashboard");
  } finally {
    await db.end();
  }
}

export interface PendingDecisionRow {
  task_id: string;
  title: string;
  created_at: string;
  notification_id: string;
  read_at: string | null;
}

export async function listPendingDecisions(tenantId: string): Promise<PendingDecisionRow[]> {
  if (!(await isAuthorizedForTenant(tenantId))) throw new Error("Non autorisé.");
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    const { rows } = await db.query<PendingDecisionRow>(
      `select t.id as task_id, t.title, t.created_at, n.id as notification_id, n.read_at
       from task t join notification n on n.task_id = t.id
       where t.tenant_id = $1 and t.status = 'waiting_human'
       order by t.created_at desc`,
      [tenantId]
    );
    return rows;
  } finally {
    await db.end();
  }
}

export async function markNotificationsRead(tenantId: string): Promise<void> {
  if (!(await isAuthorizedForTenant(tenantId))) throw new Error("Non autorisé.");
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    await db.query(
      `update notification set read_at = now() where read_at is null and tenant_id = $1`,
      [tenantId]
    );
  } finally {
    await db.end();
  }
}
