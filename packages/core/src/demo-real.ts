// ════════════════════════════════════════════════════════════════════
// Démo réelle Phase 1 — contrairement à smoke.ts (fakes, 0€, 0 réseau),
// ce script utilise : la vraie base Supabase, le vrai provider Gemini,
// et écrit réellement dans execution_event. Coût : quelques tokens
// Gemini gratuits (ADR-006). Données de test uniquement (dataClass="test",
// tenant de démo créé par la migration 0003 — ADR-003).
//
// Prérequis : .env rempli (SUPABASE_DB_URL, GEMINI_API_KEY).
// Exécuter : node --env-file=.env dist/demo-real.js
// (après: npx tsc -p packages/core/tsconfig.json)
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { ModelGateway } from "./gateway/index.js";
import type { TenantCredential, CredentialResolver } from "./gateway/index.js";
import { GeminiProvider } from "./gateway/providers/gemini.js";
import { ContextAssembler } from "./context/index.js";
import { ToolRegistry, ToolExecutor } from "./tools/index.js";
import type { PolicyEngine, ToolAuditSink, ToolContext, PolicyDecision, Tool } from "./tools/index.js";
import { RunJournal } from "./execution/index.js";
import type { ExecutionStore, ExecutionEvent, StoredExecutionEvent } from "./execution/index.js";
import { AgentRuntime } from "./runtime/index.js";
import { createReadLeadsTool } from "./tools/impl/crm-read-leads.js";
import type { LeadRepository, LeadRow } from "./tools/impl/crm-read-leads.js";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001"; // migration 0003
const DEMO_AGENT_INSTANCE_ID = "00000000-0000-0000-0000-000000000002"; // migration 0005

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante: ${name}. Vérifiez .env.`);
  return v;
}

// ─── Repository de leads : lit la vraie table `lead` (RLS contourne via
// service role implicite ici — connexion directe, pas via l'API cliente) ──
class PgLeadRepository implements LeadRepository {
  constructor(private readonly db: Client) {}

  async listForTenant(tenantId: string): Promise<LeadRow[]> {
    const res = await this.db.query(
      `select name, company, email, last_contact, notes
       from lead where tenant_id = $1 order by last_contact desc nulls last`,
      [tenantId]
    );
    return res.rows.map((r) => ({
      name: r.name,
      company: r.company,
      email: r.email,
      lastContact: r.last_contact ? new Date(r.last_contact).toISOString().slice(0, 10) : "",
      notes: r.notes,
    }));
  }
}

// ─── BYOK : résout la clé Gemini du tenant. En Phase 1 démo, on lit la
// clé du fondateur depuis .env plutôt que tenant_ai_credential (aucun
// vrai onboarding client encore) — assumé, à remplacer en Phase 2/3. ──
const credentialResolver: CredentialResolver = {
  async resolve(): Promise<TenantCredential> {
    return { provider: "gemini", dataPolicy: "no_train", apiKey: requireEnv("GEMINI_API_KEY") };
  },
};

const allowAllPolicy: PolicyEngine = {
  async check(): Promise<PolicyDecision> {
    return "allow"; // outil "read" → autonomie auto (archi §7)
  },
};

const consoleAudit: ToolAuditSink = {
  async onCall(tool, input) {
    console.log(`  [tool_call] ${tool.key}`, JSON.stringify(input));
  },
  async onResult(tool, result) {
    console.log(`  [tool_result] ${tool.key} → ${JSON.stringify(result).slice(0, 200)}`);
  },
  async onError(tool, error) {
    console.error(`  [tool_error] ${tool.key}: ${error.message}`);
  },
};

// ─── Execution Store réel : écrit dans execution_event (append-only) ──
class PgExecutionStore implements ExecutionStore {
  constructor(private readonly db: Client) {}

  async append(event: ExecutionEvent): Promise<StoredExecutionEvent> {
    const res = await this.db.query(
      `insert into execution_event (tenant_id, task_id, seq, kind, payload, usage)
       values ($1, $2, $3, $4, $5, $6)
       returning id, created_at`,
      [event.tenantId, event.taskId, event.seq, event.kind, event.payload, event.usage ?? {}]
    );
    return { ...event, id: res.rows[0].id, createdAt: res.rows[0].created_at };
  }

  async read(taskId: string): Promise<StoredExecutionEvent[]> {
    const res = await this.db.query(
      `select id, tenant_id, task_id, seq, kind, payload, usage, created_at
       from execution_event where task_id = $1 order by seq`,
      [taskId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      taskId: r.task_id,
      seq: r.seq,
      kind: r.kind,
      payload: r.payload,
      usage: r.usage,
      createdAt: r.created_at,
    }));
  }
}

async function main() {
  const db = new Client({ connectionString: requireEnv("SUPABASE_DB_URL") });
  await db.connect();

  try {
    // Task réelle en base (l'unité de travail visible du client, archi §4).
    const taskRes = await db.query(
      `insert into task (tenant_id, agent_instance_id, title, input, status)
       values ($1, $2, 'Préparer la fiche de RDV pour le prochain appel', '{}'::jsonb, 'running')
       returning id`,
      [DEMO_TENANT_ID, DEMO_AGENT_INSTANCE_ID]
    );
    const taskId: string = taskRes.rows[0].id;

    const gateway = new ModelGateway(credentialResolver).register(new GeminiProvider());
    const readLeadsTool: Tool = createReadLeadsTool(new PgLeadRepository(db));
    const registry = new ToolRegistry().register(readLeadsTool);
    const executor = new ToolExecutor(allowAllPolicy, consoleAudit);
    const store = new PgExecutionStore(db);
    const journal = new RunJournal(store, DEMO_TENANT_ID, taskId);
    const runtime = new AgentRuntime(gateway, new ContextAssembler(), executor, journal);

    console.log("=== Run RÉEL — Sales Agent, fiche de RDV ===");
    console.log(`Tenant: ${DEMO_TENANT_ID}  Task: ${taskId}\n`);

    const outcome = await runtime.run({
      tenantId: DEMO_TENANT_ID,
      taskId,
      identity: {
        name: "Employé IA · Commercial",
        role: "Prospection & qualification",
        systemPrompt:
          "Tu prépares des fiches de brief avant les rendez-vous commerciaux. " +
          "Choisis le lead le plus pertinent parmi ceux disponibles et rédige sa fiche.",
      },
      task: { title: "Préparer la fiche de RDV pour le prochain appel", input: {} },
      tools: registry.forAgent(["crm.read_leads"]),
      dataClass: "test", // ADR-003 : données de démo uniquement
    });

    await db.query(`update task set status = $1, updated_at = now() where id = $2`, [
      outcome.status === "done" ? "done" : "waiting_human",
      taskId,
    ]);

    console.log("\n=== Résultat ===\n");
    console.log(outcome.status === "done" ? outcome.text : `En attente de validation humaine (${outcome.tool})`);

    const events = await store.read(taskId);
    console.log(`\n=== Journal réel (${events.length} événements dans execution_event) ===`);
    for (const e of events) console.log(`  #${e.seq} ${e.kind}`);

    console.log(`\n✅ Démo réelle terminée. Vérifiable dans Supabase : select * from execution_event where task_id = '${taskId}';`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("❌ Démo échouée:", err);
  process.exit(1);
});
