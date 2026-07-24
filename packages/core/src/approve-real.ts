// ════════════════════════════════════════════════════════════════════
// Reprise après validation humaine — la moitié manquante du HITL.
// Une tâche suspendue en waiting_human reste bloquée tant que personne
// n'appelle ceci. Reprend EXACTEMENT où le run s'est arrêté (archi §7).
//
// Usage :
//   node --env-file=.env dist/approve-real.js <taskId> approve [--trust]
//   node --env-file=.env dist/approve-real.js <taskId> reject
//
// --trust : n'accorde PAS qu'une validation ponctuelle, mais permanente
// (confirm_once, ADR-010) — les prochaines actions de cette classe
// d'effet s'exécuteront seules, sans redemander.
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { ContextAssembler } from "./context/index.js";
import { RunJournal } from "./execution/index.js";
import { AgentRuntime } from "./runtime/index.js";
import type { ApprovalDecision } from "./runtime/index.js";
import {
  DEMO_TENANT_ID,
  DEMO_AGENT_INSTANCE_ID,
  SALES_AGENT_TASK,
  buildDemoRuntimeDeps,
  requireEnv,
} from "./wiring.js";

async function main() {
  const [taskId, action, ...flags] = process.argv.slice(2);
  if (!taskId || (action !== "approve" && action !== "reject")) {
    console.error("Usage: node dist/approve-real.js <taskId> approve|reject [--trust]");
    process.exit(1);
  }

  const decision: ApprovalDecision =
    action === "approve"
      ? { action: "approve", trustFuture: flags.includes("--trust") }
      : { action: "reject" };

  const db = new Client({ connectionString: requireEnv("SUPABASE_DB_URL") });
  await db.connect();

  try {
    const deps = buildDemoRuntimeDeps(db);
    // RunJournal.resume() repart du dernier seq persisté — la reprise ne
    // rejoue jamais un numéro d'événement déjà utilisé.
    const journal = await RunJournal.resume(deps.store, DEMO_TENANT_ID, taskId);
    const runtime = new AgentRuntime(deps.gateway, new ContextAssembler(), deps.executor, journal);

    console.log(`=== Reprise de la tâche ${taskId} — décision: ${action}${decision.action === "approve" && decision.trustFuture ? " (+ validation permanente)" : ""} ===\n`);

    const outcome = await runtime.resume(
      {
        tenantId: DEMO_TENANT_ID,
        taskId,
        agentInstanceId: DEMO_AGENT_INSTANCE_ID,
        identity: SALES_AGENT_TASK.identity,
        task: SALES_AGENT_TASK.task,
        tools: deps.registry.forAgent([...SALES_AGENT_TASK.toolKeys]),
        dataClass: "test",
      },
      decision,
      deps.approvals
    );

    await db.query(`update task set status = $1, updated_at = now() where id = $2`, [
      outcome.status === "done" ? "done" : "waiting_human",
      taskId,
    ]);

    console.log("\n=== Résultat ===\n");
    console.log(
      outcome.status === "done" ? outcome.text : `Encore en attente (${outcome.tool}) — cas inattendu`
    );

    const events = await deps.store.read(taskId);
    console.log(`\n=== Journal réel (${events.length} événements au total) ===`);
    for (const e of events) console.log(`  #${e.seq} ${e.kind}`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("❌ Reprise échouée:", err);
  process.exit(1);
});
