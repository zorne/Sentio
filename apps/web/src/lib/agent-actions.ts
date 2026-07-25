// ════════════════════════════════════════════════════════════════════
// Server Actions — le pont entre le dashboard web et le noyau d'agent.
// Elles réutilisent EXACTEMENT le même câblage que demo-real.ts / approve-real.ts
// (wiring.ts partagé). Aucune duplication de logique métier ici (archi ADR-017).
//
// ADR-018 : auth différée. Pas de vérification de session/appartenance
// ici pour l'instant — un seul tenant démo existe, aucune vraie donnée
// client. À réintroduire (comme avant ce commit, voir historique git)
// dès qu'un vrai flux d'onboarding/connexion est construit.
// ════════════════════════════════════════════════════════════════════

"use server";

import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { ContextAssembler } from "@employes-ia/core/context";
import { RunJournal } from "@employes-ia/core/execution";
import { AgentRuntime } from "@employes-ia/core/runtime";
import {
  DEMO_TENANT_ID,
  DEMO_AGENT_INSTANCE_ID,
  SALES_AGENT_TASK,
  buildDemoRuntimeDeps,
  reflectAndRemember,
} from "@employes-ia/core/wiring";

/** Lance un nouveau run du Sales Agent sur le tenant démo — équivalent
 *  du CLI `node dist/demo-real.js`, mais déclenchable depuis un bouton. */
export async function launchSalesRun(): Promise<{ taskId: string }> {
  // Connexion directe côté serveur (pas via l'API Supabase) : la
  // Server Action tourne dans un environnement de confiance, elle a
  // besoin d'écrire dans execution_event via le noyau, pas via l'API cliente.
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    const taskRes = await db.query(
      `insert into task (tenant_id, agent_instance_id, title, input, status)
       values ($1, $2, $3, '{}'::jsonb, 'running') returning id`,
      [DEMO_TENANT_ID, DEMO_AGENT_INSTANCE_ID, SALES_AGENT_TASK.task.title]
    );
    const taskId: string = taskRes.rows[0].id;

    const deps = buildDemoRuntimeDeps(db);
    const journal = new RunJournal(deps.store, DEMO_TENANT_ID, taskId);
    const runtime = new AgentRuntime(deps.gateway, new ContextAssembler(), deps.executor, journal);
    const memoryFacts = (await deps.memory.list(DEMO_AGENT_INSTANCE_ID)).map((f) => f.fact);

    const outcome = await runtime.run({
      tenantId: DEMO_TENANT_ID,
      taskId,
      agentInstanceId: DEMO_AGENT_INSTANCE_ID,
      identity: SALES_AGENT_TASK.identity,
      task: SALES_AGENT_TASK.task,
      tools: deps.registry.forAgent([...SALES_AGENT_TASK.toolKeys]),
      dataClass: "test",
      memoryFacts,
    });

    await db.query(`update task set status = $1, updated_at = now() where id = $2`, [
      outcome.status === "done" ? "done" : "waiting_human",
      taskId,
    ]);

    if (outcome.status === "done") {
      const events = await deps.store.read(taskId);
      await reflectAndRemember(deps, { taskId, finalText: outcome.text, events });
    }

    revalidatePath("/");
    return { taskId };
  } finally {
    await db.end();
  }
}

/** Reprise après validation — équivalent CLI `approve-real.js`. */
export async function decideOnTask(
  taskId: string,
  action: "approve" | "reject",
  trustFuture = false
): Promise<void> {
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    const deps = buildDemoRuntimeDeps(db);
    const journal = await RunJournal.resume(deps.store, DEMO_TENANT_ID, taskId);
    const runtime = new AgentRuntime(deps.gateway, new ContextAssembler(), deps.executor, journal);
    const memoryFacts = (await deps.memory.list(DEMO_AGENT_INSTANCE_ID)).map((f) => f.fact);

    const outcome = await runtime.resume(
      {
        tenantId: DEMO_TENANT_ID,
        taskId,
        agentInstanceId: DEMO_AGENT_INSTANCE_ID,
        identity: SALES_AGENT_TASK.identity,
        task: SALES_AGENT_TASK.task,
        tools: deps.registry.forAgent([...SALES_AGENT_TASK.toolKeys]),
        dataClass: "test",
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
    }

    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/");
  } finally {
    await db.end();
  }
}
