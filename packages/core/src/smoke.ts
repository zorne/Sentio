// ════════════════════════════════════════════════════════════════════
// Smoke test Phase 1 — prouve que runtime + context + tools + execution
// + gateway s'assemblent et tournent de bout en bout. AUCUN appel réseau,
// AUCUN coût : le ModelProvider est un faux scripté. C'est un test de
// câblage, pas un test de qualité IA (celui-là viendra avec Gemini réel).
//
// Exécuter : node dist/smoke.js (après tsc -p packages/core/tsconfig.json)
// ════════════════════════════════════════════════════════════════════

import { ModelGateway } from "./gateway/index.js";
import type { GenerateRequest, GenerateResult, ModelProvider, TenantCredential, CredentialResolver } from "./gateway/index.js";
import { ContextAssembler } from "./context/index.js";
import { ToolRegistry, ToolExecutor } from "./tools/index.js";
import type { PolicyEngine, ToolAuditSink, Tool, ToolContext, PolicyDecision } from "./tools/index.js";
import { RunJournal } from "./execution/index.js";
import type { ExecutionStore, ExecutionEvent, StoredExecutionEvent } from "./execution/index.js";
import { AgentRuntime } from "./runtime/index.js";

// ─── Faux provider : simule "je lis les leads" puis "voici la fiche" ──
class FakeProvider implements ModelProvider {
  readonly name = "gemini" as const;
  private turn = 0;

  async generate(_req: GenerateRequest): Promise<GenerateResult> {
    this.turn += 1;
    if (this.turn === 1) {
      return {
        text: "",
        toolCalls: [{ name: "sheets.read_leads", input: { spreadsheetId: "fake", range: "Leads!A2:E" } }],
        usage: { inputTokens: 42, outputTokens: 8, provider: "gemini" },
      };
    }
    return {
      text:
        "Fiche RDV — Julie Martin (Acme SAS)\n" +
        "Contexte: dernier contact le 2026-06-01, intéressée par l'offre Business.\n" +
        "Points clés: relancer sur le pricing, mentionner la remise annuelle.\n" +
        "Ouverture suggérée: \"Bonjour Julie, où en êtes-vous sur votre réflexion ?\"",
      toolCalls: [],
      usage: { inputTokens: 120, outputTokens: 60, provider: "gemini" },
    };
  }
}

// ─── Faux outil : simule la lecture d'un Sheet sans appel réseau ──────
const fakeReadLeads: Tool = {
  key: "sheets.read_leads",
  description: "Lit des leads (faux, pour smoke test).",
  inputSchema: { type: "object" },
  effect: "read",
  async execute() {
    return [
      { name: "Julie Martin", company: "Acme SAS", email: "julie@acme.fr", lastContact: "2026-06-01", notes: "Intéressée par l'offre Business" },
    ];
  },
};

// ─── Fakes d'infrastructure (en mémoire) ──────────────────────────────
const credentialResolver: CredentialResolver = {
  async resolve(): Promise<TenantCredential> {
    return { provider: "gemini", dataPolicy: "no_train", apiKey: "fake-key" };
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
    console.log(`  [tool_result] ${tool.key} → ${JSON.stringify(result).slice(0, 120)}`);
  },
  async onError(tool, error) {
    console.error(`  [tool_error] ${tool.key}: ${error.message}`);
  },
};

class InMemoryExecutionStore implements ExecutionStore {
  private events: StoredExecutionEvent[] = [];
  private nextId = 1;

  async append(event: ExecutionEvent): Promise<StoredExecutionEvent> {
    const stored: StoredExecutionEvent = { ...event, id: this.nextId++, createdAt: new Date().toISOString() };
    this.events.push(stored);
    return stored;
  }

  async read(taskId: string): Promise<StoredExecutionEvent[]> {
    return this.events.filter((e) => e.taskId === taskId).sort((a, b) => a.seq - b.seq);
  }
}

// ─── Assemblage et run ─────────────────────────────────────────────────
async function main() {
  const tenantId = "tenant-demo";
  const taskId = "task-demo-1";

  const gateway = new ModelGateway(credentialResolver).register(new FakeProvider());
  const registry = new ToolRegistry().register(fakeReadLeads);
  const executor = new ToolExecutor(allowAllPolicy, consoleAudit);
  const store = new InMemoryExecutionStore();
  const journal = new RunJournal(store, tenantId, taskId);
  const runtime = new AgentRuntime(gateway, new ContextAssembler(), executor, journal);

  console.log("=== Run Sales Agent — fiche de RDV (smoke test, 0€, 0 réseau) ===\n");

  const outcome = await runtime.run({
    tenantId,
    taskId,
    agentInstanceId: "instance-demo",
    identity: {
      name: "Employé IA · Commercial",
      role: "Prospection & qualification",
      systemPrompt: "Tu prépares des fiches de brief avant les rendez-vous commerciaux.",
    },
    task: { title: "Préparer la fiche de RDV pour le prochain appel", input: {} },
    tools: registry.forAgent(["sheets.read_leads"]),
    dataClass: "test", // données de démo, pas de vrai client (ADR-003)
  });

  console.log("\n=== Résultat ===");
  console.log(outcome);

  const events = await store.read(taskId);
  console.log(`\n=== Journal (${events.length} événements, append-only) ===`);
  for (const e of events) console.log(`  #${e.seq} ${e.kind}`);

  if (outcome.status !== "done") throw new Error("Smoke test échoué : run non terminé.");
  if (!outcome.text.includes("Julie Martin")) throw new Error("Smoke test échoué : sortie inattendue.");
  console.log("\n✅ Smoke test Phase 1 OK — boucle complète assemblée et fonctionnelle.");
}

main().catch((err) => {
  console.error("❌ Smoke test échoué:", err);
  process.exit(1);
});
