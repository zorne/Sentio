// ════════════════════════════════════════════════════════════════════
// Câblage partagé Phase 1 (démo réelle) — implémentations Postgres des
// contrats du noyau. Utilisé par demo-real.ts (lance un run) ET
// approve-real.ts (reprend un run suspendu). Factorisé pour ne pas
// dupliquer le câblage entre les deux scripts.
//
// Ce fichier ne fait PAS partie du noyau (packages/core/src/*) au sens
// architectural — c'est de l'intégration Postgres, remplaçable par de
// vraies implémentations services/api plus tard (principe n°2).
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { ModelGateway } from "./gateway/index.js";
import type { TenantCredential, CredentialResolver } from "./gateway/index.js";
import { GeminiProvider } from "./gateway/providers/gemini.js";
import { ToolRegistry, ToolExecutor } from "./tools/index.js";
import type { PolicyEngine, ToolAuditSink } from "./tools/index.js";
import type { ExecutionStore, ExecutionEvent, StoredExecutionEvent } from "./execution/index.js";
import { createReadLeadsTool } from "./tools/impl/crm-read-leads.js";
import type { LeadRepository, LeadRow } from "./tools/impl/crm-read-leads.js";
import { createUpdateLeadNotesTool } from "./tools/impl/crm-update-lead.js";
import type { LeadWriteRepository } from "./tools/impl/crm-update-lead.js";
import { AutonomyPolicyEngine, DEFAULT_AUTONOMY } from "./policy/index.js";
import type { AutonomyResolver, AutonomyConfig, StandingApprovalStore, EffectClass } from "./policy/index.js";
import { createSendMailTool } from "./tools/impl/mail-send.js";
import type { MailTransport, OutgoingEmail } from "./tools/impl/mail-send.js";

export const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001"; // migration 0003
export const DEMO_AGENT_INSTANCE_ID = "00000000-0000-0000-0000-000000000002"; // migration 0005

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante: ${name}. Vérifiez .env.`);
  return v;
}

class PgLeadRepository implements LeadRepository, LeadWriteRepository {
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

  async updateNotes(tenantId: string, email: string, notes: string): Promise<boolean> {
    const res = await this.db.query(
      `update lead set notes = $3 where tenant_id = $1 and email = $2`,
      [tenantId, email, notes]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

/** Transport mail RÉEL non branché : en attendant un vrai fournisseur
 *  (Resend/SMTP), on simule l'envoi pour ne jamais écrire à quelqu'un
 *  pendant les tests. Le blocage/déblocage par l'autonomie, lui, est réel. */
class NoopMailTransport implements MailTransport {
  async send(email: OutgoingEmail): Promise<{ messageId: string }> {
    console.log(`  [mail SIMULÉ — aucun envoi réel] → ${email.to} : "${email.subject}"`);
    return { messageId: "simulated-no-send" };
  }
}

class PgAutonomyResolver implements AutonomyResolver {
  constructor(private readonly db: Client) {}

  async resolve(agentInstanceId: string): Promise<AutonomyConfig> {
    const res = await this.db.query(`select autonomy from agent_instance where id = $1`, [
      agentInstanceId,
    ]);
    return { ...DEFAULT_AUTONOMY, ...(res.rows[0]?.autonomy ?? {}) };
  }
}

class PgStandingApprovalStore implements StandingApprovalStore {
  constructor(private readonly db: Client) {}

  async hasApproval(agentInstanceId: string, effect: EffectClass): Promise<boolean> {
    const res = await this.db.query(
      `select 1 from standing_approval where agent_instance_id = $1 and effect_class = $2`,
      [agentInstanceId, effect]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async grant(params: {
    tenantId: string;
    agentInstanceId: string;
    effect: EffectClass;
    grantedBy?: string;
    firstTaskId?: string;
  }): Promise<void> {
    await this.db.query(
      `insert into standing_approval (tenant_id, agent_instance_id, effect_class, granted_by, first_task_id)
       values ($1, $2, $3, $4, $5)
       on conflict (agent_instance_id, effect_class) do nothing`,
      [params.tenantId, params.agentInstanceId, params.effect, params.grantedBy ?? null, params.firstTaskId ?? null]
    );
  }

  async revoke(agentInstanceId: string, effect: EffectClass): Promise<void> {
    await this.db.query(
      `delete from standing_approval where agent_instance_id = $1 and effect_class = $2`,
      [agentInstanceId, effect]
    );
  }
}

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

// ─── BYOK : résout la clé Gemini du tenant. En Phase 1 démo, on lit la
// clé du fondateur depuis .env plutôt que tenant_ai_credential (aucun
// vrai onboarding client encore) — assumé, à remplacer en Phase 2/3. ──
const credentialResolver: CredentialResolver = {
  async resolve(): Promise<TenantCredential> {
    return { provider: "gemini", dataPolicy: "no_train", apiKey: requireEnv("GEMINI_API_KEY") };
  },
};

export interface DemoRuntimeDeps {
  db: Client;
  gateway: ModelGateway;
  registry: ToolRegistry;
  policy: PolicyEngine;
  executor: ToolExecutor;
  store: ExecutionStore;
  approvals: StandingApprovalStore;
}

/** Construit tout le câblage Postgres+Gemini pour le tenant de démo. */
export function buildDemoRuntimeDeps(db: Client): DemoRuntimeDeps {
  const repo = new PgLeadRepository(db);
  const gateway = new ModelGateway(credentialResolver).register(new GeminiProvider());
  const registry = new ToolRegistry()
    .register(createReadLeadsTool(repo))
    .register(createUpdateLeadNotesTool(repo))
    .register(createSendMailTool(new NoopMailTransport()));

  const approvals = new PgStandingApprovalStore(db);
  const policy = new AutonomyPolicyEngine(new PgAutonomyResolver(db), approvals);
  const executor = new ToolExecutor(policy, consoleAudit);
  const store = new PgExecutionStore(db);

  return { db, gateway, registry, policy, executor, store, approvals };
}

/** L'identité et les outils de l'agent Sales démo — partagés entre le
 *  premier run et toute reprise après validation. */
export const SALES_AGENT_TASK = {
  identity: {
    name: "Employé IA · Commercial",
    role: "Prospection & qualification",
    systemPrompt:
      "Tu relances les prospects. Consulte les leads, choisis le plus " +
      "pertinent à relancer, consigne ton analyse dans ses notes " +
      "(crm.update_lead_notes), puis envoie-lui un email de relance " +
      "(mail.send).",
  },
  task: { title: "Relancer le prospect le plus pertinent", input: {} },
  toolKeys: ["crm.read_leads", "crm.update_lead_notes", "mail.send"] as const,
};
