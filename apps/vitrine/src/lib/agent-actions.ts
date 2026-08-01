// ════════════════════════════════════════════════════════════════════
// Server Actions — le pont entre le dashboard web et le noyau d'agent.
// Elles réutilisent EXACTEMENT le même câblage que demo-real.ts / approve-real.ts
// (wiring.ts partagé). Aucune duplication de logique métier ici (archi ADR-017).
//
// Vérification d'appartenance via tenant-access.ts (isAuthorizedForTenant)
// avant toute lecture/écriture — le tenant démo reste public, tout autre
// tenant exige une session + appartenance réelle.
// ════════════════════════════════════════════════════════════════════

"use server";

import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { ContextAssembler } from "@sentio/vitrine-core/context";
import type { AgentIdentity } from "@sentio/vitrine-core/context";
import { RunJournal } from "@sentio/vitrine-core/execution";
import { AgentRuntime } from "@sentio/vitrine-core/runtime";
import { isAuthorizedForTenant } from "./tenant-access";
import { notifyWaitingHuman } from "./notify";
import {
  DEMO_TENANT_ID,
  SALES_AGENT_TASK,
  buildDemoRuntimeDeps,
  reflectAndRemember,
} from "@sentio/vitrine-core/wiring";

/** Charge l'identité réelle de l'instance — surchargée par l'interview
 *  d'accueil (agent_instance.config.systemPrompt) si elle existe, sinon
 *  par les critères de prospection configurés par le client (archi §2
 *  principe 3 : un agent = données, pas code — la personnalisation vit
 *  en config, pas en dur), sinon le prompt par défaut de la démo. */
async function loadIdentity(db: Client, agentInstanceId: string): Promise<AgentIdentity> {
  const res = await db.query(`select config from agent_instance where id = $1`, [agentInstanceId]);
  const cfg = res.rows[0]?.config ?? {};
  if (cfg.systemPrompt) {
    return { ...SALES_AGENT_TASK.identity, systemPrompt: cfg.systemPrompt as string };
  }
  if (cfg.prospectingCriteria || cfg.prospectingOffer) {
    const prompt =
      SALES_AGENT_TASK.identity.systemPrompt +
      `\n\nCe client considère un lead qualifié si : ${cfg.prospectingCriteria ?? "non précisé"}.` +
      `\nOffre(s) à mettre en avant : ${cfg.prospectingOffer ?? "non précisé"}.`;
    return { ...SALES_AGENT_TASK.identity, systemPrompt: prompt };
  }
  return SALES_AGENT_TASK.identity;
}

/** Corps partagé d'un run du Sales Agent — pris par un `db` déjà connecté
 *  pour être réutilisé sans dupliquer le câblage AgentRuntime, depuis :
 *  le bouton dashboard (launchSalesRun), le démarrage de la prospection
 *  (prospecting-actions.ts) et la route cron (api/cron/prospect). */
export async function launchSalesRunInternal(
  db: Client,
  tenantId: string,
  agentInstanceId: string
): Promise<{ taskId: string }> {
  const taskRes = await db.query(
    `insert into task (tenant_id, agent_instance_id, title, input, status)
     values ($1, $2, $3, '{}'::jsonb, 'running') returning id`,
    [tenantId, agentInstanceId, SALES_AGENT_TASK.task.title]
  );
  const taskId: string = taskRes.rows[0].id;

  const deps = buildDemoRuntimeDeps(db);
  const journal = new RunJournal(deps.store, tenantId, taskId);
  const runtime = new AgentRuntime(deps.gateway, new ContextAssembler(), deps.executor, journal);
  const memoryFacts = (await deps.memory.list(agentInstanceId)).map((f) => f.fact);
  const identity = await loadIdentity(db, agentInstanceId);

  // Les vrais tenants (issus de l'interview) traitent de vraies infos
  // client ; le tenant démo reste des données de test (ADR-003).
  const dataClass = tenantId === DEMO_TENANT_ID ? "test" : "real";

  const outcome = await runtime.run({
    tenantId,
    taskId,
    agentInstanceId,
    identity,
    task: SALES_AGENT_TASK.task,
    tools: deps.registry.forAgent([...SALES_AGENT_TASK.toolKeys]),
    dataClass,
    memoryFacts,
  });

  await db.query(`update task set status = $1, updated_at = now() where id = $2`, [
    outcome.status === "done" ? "done" : "waiting_human",
    taskId,
  ]);

  if (outcome.status === "done") {
    const events = await deps.store.read(taskId);
    await reflectAndRemember(deps, { taskId, finalText: outcome.text, events });
  } else {
    await notifyWaitingHuman(db, { tenantId, taskId, agentInstanceId });
  }

  revalidatePath("/dashboard");
  revalidatePath("/decisions");
  return { taskId };
}

/** Lance un nouveau run du Sales Agent pour un tenant donné — équivalent
 *  du CLI `node dist/demo-real.js`, mais déclenchable depuis un bouton. */
export async function launchSalesRun(
  tenantId: string,
  agentInstanceId: string
): Promise<{ taskId: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) throw new Error("Non autorisé.");
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    return await launchSalesRunInternal(db, tenantId, agentInstanceId);
  } finally {
    await db.end();
  }
}

/** Reprise après validation — équivalent CLI `approve-real.js`. Le
 *  tenant/instance sont retrouvés depuis la task elle-même : l'appelant
 *  (bouton Approuver) n'a besoin de connaître que le taskId. */
export async function decideOnTask(
  taskId: string,
  action: "approve" | "reject",
  trustFuture = false
): Promise<void> {
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    const taskRes = await db.query(
      `select tenant_id, agent_instance_id from task where id = $1`,
      [taskId]
    );
    const taskRow = taskRes.rows[0];
    if (!taskRow) throw new Error("Tâche introuvable.");
    const tenantId: string = taskRow.tenant_id;
    const agentInstanceId: string = taskRow.agent_instance_id;
    if (!(await isAuthorizedForTenant(tenantId))) throw new Error("Non autorisé.");

    const deps = buildDemoRuntimeDeps(db);
    const journal = await RunJournal.resume(deps.store, tenantId, taskId);
    const runtime = new AgentRuntime(deps.gateway, new ContextAssembler(), deps.executor, journal);
    const memoryFacts = (await deps.memory.list(agentInstanceId)).map((f) => f.fact);
    const identity = await loadIdentity(db, agentInstanceId);
    const dataClass = tenantId === DEMO_TENANT_ID ? "test" : "real";

    const outcome = await runtime.resume(
      {
        tenantId,
        taskId,
        agentInstanceId,
        identity,
        task: SALES_AGENT_TASK.task,
        tools: deps.registry.forAgent([...SALES_AGENT_TASK.toolKeys]),
        dataClass,
        memoryFacts,
      },
      action === "approve" ? { action: "approve", trustFuture } : { action: "reject" },
      deps.approvals
    );

    await db.query(`update task set status = $1, updated_at = now() where id = $2`, [
      outcome.status === "done" ? "done" : "waiting_human",
      taskId,
    ]);

    if (outcome.status === "done") {
      const events = await deps.store.read(taskId);
      await reflectAndRemember(deps, { taskId, finalText: outcome.text, events });
    } else {
      await notifyWaitingHuman(db, { tenantId, taskId, agentInstanceId });
    }

    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/dashboard");
    revalidatePath("/decisions");
  } finally {
    await db.end();
  }
}
