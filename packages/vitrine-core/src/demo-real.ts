// ════════════════════════════════════════════════════════════════════
// Démo réelle Phase 1 — lance un NOUVEAU run du Sales Agent.
// Vraie base Supabase, vrai provider Gemini, vraie trace dans
// execution_event. Données de test uniquement (dataClass="test",
// ADR-003). Pour reprendre un run suspendu, voir approve-real.ts.
//
// Prérequis : .env rempli (SUPABASE_DB_URL, GEMINI_API_KEY).
// Exécuter : node --env-file=.env dist/demo-real.js
// (après: npx tsc -p packages/core/tsconfig.json)
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { ContextAssembler } from "./context/index.js";
import { RunJournal } from "./execution/index.js";
import { AgentRuntime } from "./runtime/index.js";
import {
  DEMO_TENANT_ID,
  DEMO_AGENT_INSTANCE_ID,
  SALES_AGENT_TASK,
  buildDemoRuntimeDeps,
  reflectAndRemember,
  requireEnv,
} from "./wiring.js";

async function main() {
  const db = new Client({ connectionString: requireEnv("SUPABASE_DB_URL") });
  await db.connect();

  try {
    // Task réelle en base (l'unité de travail visible du client, archi §4).
    const taskRes = await db.query(
      `insert into task (tenant_id, agent_instance_id, title, input, status)
       values ($1, $2, $3, '{}'::jsonb, 'running')
       returning id`,
      [DEMO_TENANT_ID, DEMO_AGENT_INSTANCE_ID, SALES_AGENT_TASK.task.title]
    );
    const taskId: string = taskRes.rows[0].id;

    const deps = buildDemoRuntimeDeps(db);
    const journal = new RunJournal(deps.store, DEMO_TENANT_ID, taskId);
    const runtime = new AgentRuntime(deps.gateway, new ContextAssembler(), deps.executor, journal);

    console.log("=== Run RÉEL — Sales Agent, relance prospect ===");
    console.log(`Tenant: ${DEMO_TENANT_ID}  Task: ${taskId}\n`);

    // Mémoire long terme (archi §5) : ce que l'agent a retenu des runs
    // précédents, injecté dans le contexte AVANT de commencer.
    const memoryFacts = (await deps.memory.list(DEMO_AGENT_INSTANCE_ID)).map((f) => f.fact);
    if (memoryFacts.length) {
      console.log(`Mémoire chargée (${memoryFacts.length} faits):`);
      for (const f of memoryFacts) console.log(`  - ${f}`);
      console.log();
    }

    const outcome = await runtime.run({
      tenantId: DEMO_TENANT_ID,
      taskId,
      agentInstanceId: DEMO_AGENT_INSTANCE_ID,
      identity: SALES_AGENT_TASK.identity,
      task: SALES_AGENT_TASK.task,
      tools: deps.registry.forAgent([...SALES_AGENT_TASK.toolKeys]),
      dataClass: "test", // ADR-003 : données de démo uniquement
      memoryFacts,
    });

    await db.query(`update task set status = $1, updated_at = now() where id = $2`, [
      outcome.status === "done" ? "done" : "waiting_human",
      taskId,
    ]);

    console.log("\n=== Résultat ===\n");
    console.log(
      outcome.status === "done" ? outcome.text : `En attente de validation humaine (${outcome.tool})`
    );

    const events = await deps.store.read(taskId);
    console.log(`\n=== Journal réel (${events.length} événements dans execution_event) ===`);
    for (const e of events) console.log(`  #${e.seq} ${e.kind}`);

    // Réflexion post-run (archi §8) : UNIQUEMENT si le run est terminé —
    // pas de réflexion sur une tâche encore suspendue, elle n'a pas fini
    // d'apprendre quoi que ce soit tant qu'elle attend une validation.
    if (outcome.status === "done") {
      const facts = await reflectAndRemember(deps, { taskId, finalText: outcome.text, events });
      if (facts.length) {
        console.log(`\n🧠 Mémorisé (${facts.length}):`);
        for (const f of facts) console.log(`  - ${f}`);
      }
    }

    if (outcome.status === "waiting_human") {
      console.log(
        `\n👉 Pour valider ou refuser : node --env-file=.env dist/approve-real.js ${taskId} approve|reject [--trust]`
      );
    }
    console.log(`\n✅ Démo réelle terminée. Task: ${taskId}`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("❌ Démo échouée:", err);
  process.exit(1);
});
