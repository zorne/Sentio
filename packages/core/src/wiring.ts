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
import { GroqProvider } from "./gateway/providers/groq.js";
import { ToolRegistry, ToolExecutor } from "./tools/index.js";
import type { PolicyEngine, ToolAuditSink } from "./tools/index.js";
import type { ExecutionStore, ExecutionEvent, StoredExecutionEvent } from "./execution/index.js";
import { createReadLeadsTool } from "./tools/impl/crm-read-leads.js";
import type { LeadRepository, LeadRow } from "./tools/impl/crm-read-leads.js";
import { createUpdateLeadNotesTool } from "./tools/impl/crm-update-lead.js";
import type { LeadWriteRepository } from "./tools/impl/crm-update-lead.js";
import { AutonomyPolicyEngine, DEFAULT_AUTONOMY } from "./policy/index.js";
import type { AutonomyResolver, AutonomyConfig, StandingApprovalStore, EffectClass } from "./policy/index.js";
import { Resend } from "resend";
import { createSendMailTool } from "./tools/impl/mail-send.js";
import type { MailTransport, OutgoingEmail } from "./tools/impl/mail-send.js";
import { reflect } from "./memory/index.js";
import type { MemoryStore, MemoryFact } from "./memory/index.js";
import { createProvisionTenantTool } from "./tools/impl/platform-create-tenant.js";
import type { TenantProvisioner } from "./tools/impl/platform-create-tenant.js";
import { createFindLeadsTool } from "./tools/impl/prospecting-find-leads.js";
import type {
  LeadWriter,
  ProspectCandidate,
  ProspectingSearchInput,
  ProspectSearchProvider,
} from "./tools/impl/prospecting-find-leads.js";

export const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001"; // migration 0003
export const DEMO_AGENT_INSTANCE_ID = "00000000-0000-0000-0000-000000000002"; // migration 0005

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante: ${name}. Vérifiez .env.`);
  return v;
}

class PgLeadRepository implements LeadRepository, LeadWriteRepository, LeadWriter {
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

  /** Ecrit les prospects trouvés par prospecting.find_leads. Ignore les
   *  doublons (même email pour le même tenant) plutôt que d'échouer sur
   *  une contrainte — la prospection réelle retombe souvent sur des
   *  profils déjà connus. */
  async insertMany(
    tenantId: string,
    leads: Array<{ name: string; company: string; email: string; notes: string }>
  ): Promise<number> {
    let added = 0;
    for (const lead of leads) {
      const exists = await this.db.query(`select 1 from lead where tenant_id = $1 and email = $2`, [
        tenantId,
        lead.email,
      ]);
      if ((exists.rowCount ?? 0) > 0) continue;
      await this.db.query(
        `insert into lead (tenant_id, name, company, email, notes) values ($1, $2, $3, $4, $5)`,
        [tenantId, lead.name, lead.company, lead.email, lead.notes]
      );
      added++;
    }
    return added;
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

/** Transport mail RÉEL via Resend. L'effet reste "irreversible" côté
 *  policy (mail-send.ts) : même branché ici, l'agent ne peut envoyer
 *  qu'après validation humaine explicite (confirm) — ce transport ne
 *  change que ce qui se passe APRÈS l'accord, jamais le fait qu'un
 *  accord soit requis. */
class ResendMailTransport implements MailTransport {
  private readonly client: Resend;
  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }
  async send(email: OutgoingEmail, tenantId: string): Promise<{ messageId: string }> {
    // Le tenant démo contient des prospects fictifs (marc@zenith.fr...) —
    // jamais de vrai envoi vers ces adresses, même avec Resend configuré.
    if (tenantId === DEMO_TENANT_ID) {
      console.log(`  [mail SIMULÉ — tenant démo, jamais de vrai envoi] → ${email.to} : "${email.subject}"`);
      return { messageId: "simulated-demo-tenant" };
    }
    const { data, error } = await this.client.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "SENTIA <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      text: email.body,
    });
    if (error) throw new Error(`Échec envoi Resend : ${error.message}`);
    return { messageId: data?.id ?? "unknown" };
  }
}

/** Recherche B2B RÉELLE via Apollo.io — People Search API. Retourne les
 *  meilleurs candidats ; l'outil (prospecting-find-leads.ts) filtre ceux
 *  sans email connu avant de les ajouter au CRM. */
class ApolloSearchProvider implements ProspectSearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(input: ProspectingSearchInput): Promise<ProspectCandidate[]> {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": this.apiKey },
      body: JSON.stringify({
        person_titles: input.jobTitles,
        q_keywords: input.keywords,
        per_page: input.limit ?? 10,
      }),
    });
    if (!res.ok) {
      throw new Error(`Apollo API a répondu ${res.status} — vérifiez APOLLO_API_KEY.`);
    }
    const data = (await res.json()) as {
      people?: Array<{
        first_name?: string;
        last_name?: string;
        title?: string;
        email?: string;
        organization?: { name?: string };
      }>;
    };
    return (data.people ?? []).map((p) => ({
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Inconnu",
      title: p.title,
      company: p.organization?.name,
      email: p.email,
    }));
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

/** Mémoire long terme (migration 0007) — faits structurés par agent_instance. */
class PgMemoryStore implements MemoryStore {
  constructor(private readonly db: Client) {}

  async list(agentInstanceId: string, limit = 20): Promise<MemoryFact[]> {
    const res = await this.db.query(
      `select id, fact, source_task_id, created_at from agent_memory
       where agent_instance_id = $1 order by created_at desc limit $2`,
      [agentInstanceId, limit]
    );
    return res.rows.map((r) => ({
      id: r.id,
      fact: r.fact,
      sourceTaskId: r.source_task_id,
      createdAt: r.created_at,
    }));
  }

  async remember(params: {
    tenantId: string;
    agentInstanceId: string;
    fact: string;
    sourceTaskId?: string;
  }): Promise<void> {
    await this.db.query(
      `insert into agent_memory (tenant_id, agent_instance_id, fact, source_task_id)
       values ($1, $2, $3, $4)`,
      [params.tenantId, params.agentInstanceId, params.fact, params.sourceTaskId ?? null]
    );
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

// ─── BYOK : résout les clés IA du tenant. En Phase 1 démo, on lit les
// clés du fondateur depuis .env plutôt que tenant_ai_credential (aucun
// vrai onboarding client encore) — assumé, à remplacer en Phase 2/3.
//
// Ordre de fallback (ADR-016) : Gemini (no-train, primaire) → Groq (free,
// quota indépendant ~72x plus large, secours). GROQ_API_KEY est optionnel :
// si absent, on tourne avec Gemini seul (dégradation propre). ─────────
const credentialResolver: CredentialResolver = {
  async resolve(): Promise<TenantCredential[]> {
    const creds: TenantCredential[] = [
      { provider: "gemini", dataPolicy: "no_train", apiKey: requireEnv("GEMINI_API_KEY") },
    ];
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      creds.push({ provider: "groq", dataPolicy: "free", apiKey: groqKey });
    }
    return creds;
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
  memory: MemoryStore;
}

/** Construit tout le câblage Postgres+Gemini pour le tenant de démo. */
export function buildDemoRuntimeDeps(db: Client): DemoRuntimeDeps {
  const repo = new PgLeadRepository(db);
  // Providers branchés en dur : le gateway choisira parmi CEUX pour lesquels
  // le tenant a une credential (ADR-016). Register est idempotent.
  const gateway = new ModelGateway(credentialResolver)
    .register(new GeminiProvider())
    .register(new GroqProvider());
  // RESEND_API_KEY optionnel — dégradation propre (comme APOLLO_API_KEY/
  // GROQ_API_KEY) : sans clé, l'envoi reste simulé, jamais de crash.
  const mailTransport = process.env.RESEND_API_KEY
    ? new ResendMailTransport(process.env.RESEND_API_KEY)
    : new NoopMailTransport();

  const registry = new ToolRegistry()
    .register(createReadLeadsTool(repo))
    .register(createUpdateLeadNotesTool(repo))
    .register(createSendMailTool(mailTransport));

  // APOLLO_API_KEY optionnel — dégradation propre (comme GROQ_API_KEY) :
  // si absent, l'outil n'est simplement pas enregistré, pas de crash.
  const apolloKey = process.env.APOLLO_API_KEY;
  if (apolloKey) {
    registry.register(createFindLeadsTool(new ApolloSearchProvider(apolloKey), repo));
  }

  const approvals = new PgStandingApprovalStore(db);
  const policy = new AutonomyPolicyEngine(new PgAutonomyResolver(db), approvals);
  const executor = new ToolExecutor(policy, consoleAudit);
  const store = new PgExecutionStore(db);
  const memory = new PgMemoryStore(db);

  return { db, gateway, registry, policy, executor, store, approvals, memory };
}

/** L'identité et les outils de l'agent Sales démo — partagés entre le
 *  premier run et toute reprise après validation. */
export const SALES_AGENT_TASK = {
  identity: {
    name: "Employé Commercial",
    role: "Prospection & qualification",
    systemPrompt:
      "Tu relances les prospects. S'il y a peu ou pas de leads pertinents " +
      "(crm.read_leads), cherche-en de nouveaux avec prospecting.find_leads " +
      "avant de continuer. Consulte les leads, choisis le plus pertinent à " +
      "relancer, consigne ton analyse dans ses notes (crm.update_lead_notes), " +
      "puis envoie-lui un email de relance (mail.send).",
  },
  task: { title: "Relancer le prospect le plus pertinent", input: {} },
  toolKeys: ["crm.read_leads", "crm.update_lead_notes", "mail.send", "prospecting.find_leads"] as const,
};

/** Réflexion post-run (archi §8), factorisée entre demo-real.ts et
 *  approve-real.ts.
 *
 *  TOLÉRANTE À L'ÉCHEC PAR DESSEIN : la mémoire est un bonus, jamais
 *  une contrainte sur le succès de la tâche. Un quota Gemini épuisé
 *  APRÈS que le vrai travail a été fait ne doit pas transformer une
 *  tâche accomplie en échec vu du client. On loggue et on continue. */
export async function reflectAndRemember(
  deps: DemoRuntimeDeps,
  params: { taskId: string; finalText: string; events: StoredExecutionEvent[] }
): Promise<string[]> {
  try {
    const facts = await reflect(deps.gateway, {
      tenantId: DEMO_TENANT_ID,
      dataClass: "test",
      finalText: params.finalText,
      events: params.events,
    });
    for (const fact of facts) {
      await deps.memory.remember({
        tenantId: DEMO_TENANT_ID,
        agentInstanceId: DEMO_AGENT_INSTANCE_ID,
        fact,
        sourceTaskId: params.taskId,
      });
    }
    return facts;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.warn(`⚠️  Réflexion post-run ignorée (tâche déjà terminée): ${e.message.slice(0, 120)}`);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════
// Agent d'accueil — un agent DIFFÉRENT des agents clients : son travail
// est d'interviewer un visiteur et de créer son tenant + son premier
// Employé IA. Pas de tenant existant à ce stade (poule et œuf), donc pas
// de Task/journal ici — un simple aller-retour de conversation, pas une
// exécution autonome en arrière-plan (archi §3a s'applique aux agents
// CLIENTS ; l'agent d'accueil est un outil de la plateforme elle-même).
// ════════════════════════════════════════════════════════════════════

export const ONBOARDING_SYSTEM_PROMPT = [
  "Tu es l'assistant d'accueil de la plateforme SENTIA.",
  "Ton rôle : interviewer un visiteur pour comprendre son entreprise, puis créer",
  "pour lui un premier Employé IA Commercial personnalisé.",
  "Pose des questions courtes, une à la fois, jusqu'à avoir : le nom de l'entreprise,",
  "un email de contact, le secteur d'activité, à quoi ressemble un bon prospect pour",
  "lui, le ton de communication souhaité, et son niveau d'autonomie préféré",
  "(cautious = prudent, balanced = équilibré, autonomous = autonome).",
  "Une fois TOUTES ces informations recueillies, appelle l'outil",
  "platform.create_tenant_agent — une seule fois, jamais avant d'avoir tout.",
].join(" ");

/** Provisionnement Postgres réel : crée le tenant + son agent Sales. */
class PgTenantProvisioner implements TenantProvisioner {
  constructor(private readonly db: Client) {}

  async createTenantWithSalesAgent(params: {
    companyName: string;
    contactEmail: string;
    systemPrompt: string;
    autonomy: Record<string, string>;
  }): Promise<{ tenantId: string; agentInstanceId: string }> {
    const tenantRes = await this.db.query(
      `insert into tenant (name) values ($1) returning id`,
      [params.companyName]
    );
    const tenantId: string = tenantRes.rows[0].id;

    const defRes = await this.db.query(`select id from agent_definition where key = 'sales'`);
    const definitionId: string = defRes.rows[0].id;

    const instanceRes = await this.db.query(
      `insert into agent_instance (tenant_id, definition_id, name, config, autonomy)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        tenantId,
        definitionId,
        `Employé Commercial (${params.companyName})`,
        JSON.stringify({ systemPrompt: params.systemPrompt, contactEmail: params.contactEmail }),
        JSON.stringify(params.autonomy),
      ]
    );
    return { tenantId, agentInstanceId: instanceRes.rows[0].id };
  }
}

export interface OnboardingDeps {
  gateway: ModelGateway;
  tools: Array<ReturnType<typeof createProvisionTenantTool>>;
}

/**
 * Câblage de l'agent d'accueil. Volontairement SANS Groq : contrairement
 * à la démo (données de test), une interview réelle contient de vraies
 * informations d'un vrai prospect (nom d'entreprise, email) — la règle
 * d'or (ADR-004) exige un provider no-train. On ne branche que Gemini,
 * jamais de repli vers un tier gratuit qui pourrait entraîner dessus.
 */
export function buildOnboardingDeps(db: Client): OnboardingDeps {
  const onboardingCredentialResolver: CredentialResolver = {
    async resolve(): Promise<TenantCredential[]> {
      return [{ provider: "gemini", dataPolicy: "no_train", apiKey: requireEnv("GEMINI_API_KEY") }];
    },
  };
  const gateway = new ModelGateway(onboardingCredentialResolver).register(new GeminiProvider());
  const tools = [createProvisionTenantTool(new PgTenantProvisioner(db))];
  return { gateway, tools };
}
