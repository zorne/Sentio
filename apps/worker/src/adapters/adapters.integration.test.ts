import { randomUUID } from "node:crypto";

import { INFERENCE_ENVELOPES, USAGE_METRICS, type FeatureFlags } from "@sentio/config";
import { ModelGateway, PolicyEngine, TaskDeferred, type ModelProvider } from "@sentio/core";
import { createPostgresClient, type PostgresClient } from "../adapters/postgres-node.js";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresApprovalStore } from "@sentio/runtime";
import { PostgresJournalWriter } from "@sentio/runtime";
import { PostgresUsageLedger, periodFor } from "@sentio/runtime";
import { PostgresDeliveryFeedback } from "@sentio/runtime";
import { PostgresOutboundMessages, PostgresSendingGuard } from "@sentio/runtime";

/** Versions et clés uniques par appel. `Date.now()` collisionne dès que deux fixtures naissent
 *  dans la même milliseconde — ce qui arrive tout le temps entre deux suites. */
let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);


/**
 * Le lot 1 branché sur une **vraie** base.
 *
 * Les tests du noyau tournent contre des doublures : ils prouvent la règle, pas la requête. Trois
 * bugs réels ont déjà vécu sous une suite verte qui ne parlait qu'à un client factice
 * (`packages/db/src/repository.integration.test.ts`). Ce fichier ferme la même porte pour le
 * Model Gateway et le Policy Engine : quotas lus dans `plan_quota`, compteurs écrits dans
 * `usage_counter`, décisions journalisées dans `execution_event`.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

const FLAGS: FeatureFlags = {
  inferenceOptOutProven: true,
  publicDiagnosticEnabled: false,
  checkoutEnabled: false,
};

describeIfDatabase("Le noyau contre un vrai Postgres", () => {
  let sql: PostgresClient;
  let ledger: PostgresUsageLedger;
  let journal: PostgresJournalWriter;
  let approvals: PostgresApprovalStore;

  const tenantId = randomUUID() as TenantId;
  const jetables: TenantId[] = [];
  let employeeId: EmployeeId;
  let taskId: TaskId;

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    ledger = new PostgresUsageLedger(sql);
    journal = new PostgresJournalWriter(sql);
    approvals = new PostgresApprovalStore(sql);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise noyau"]);
    await sql.query(
      `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
       select $1, id, 'active', now(), now() + interval '30 days' from plan where tier = 'start'`,
      [tenantId],
    );

    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [versionUnique()],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    employeeId = employee?.id as EmployeeId;

    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, subject_kind, subject_id) " +
        "values ($1, $2, 'lead', gen_random_uuid()) returning id",
      [tenantId, employeeId],
    );
    taskId = task?.id as TaskId;
  });

  afterAll(async () => {
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = any($1)", [
        [tenantId, ...jetables],
      ]);
      await tx.query("delete from tenant where id = any($1)", [[tenantId, ...jetables]]);
    });
    await sql.close();
  });

  /**
   * Une entreprise neuve, pour les tests qui comptent des messages : le plafond du jour est
   * global à l'entreprise, donc deux tests qui partagent un tenant se marchent dessus.
   */
  async function freshTenant(): Promise<{ tenantId: TenantId; employeeId: EmployeeId }> {
    const fresh = randomUUID() as TenantId;
    await sql.query("insert into tenant (id, name) values ($1, $2)", [fresh, "Entreprise d'essai"]);
    await sql.query(
      `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
       select $1, id, 'active', now(), now() + interval '30 days' from plan where tier = 'start'`,
      [fresh],
    );
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [versionUnique()],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [fresh, definition?.id, identity?.id],
    );
    jetables.push(fresh);
    return { tenantId: fresh, employeeId: employee?.id as EmployeeId };
  }

  it("lit le plafond dans la formule, pas dans le code", async () => {
    // La valeur vient de la migration de seed : la changer ne demande aucun déploiement.
    const daily = await ledger.tenantLimit(tenantId, USAGE_METRICS.inferenceTokensPerDay);
    const period = await ledger.tenantLimit(tenantId, USAGE_METRICS.inferenceTokensPerPeriod);

    expect(daily).toBe(200000);
    expect(period).toBe(2000000);
  });

  it("compte par journée pour une métrique journalière", async () => {
    const on = new Date();
    await ledger.recordTenantUsage(tenantId, USAGE_METRICS.inferenceTokensPerDay, 120, on);
    await ledger.recordTenantUsage(tenantId, USAGE_METRICS.inferenceTokensPerDay, 30, on);

    expect(await ledger.tenantUsage(tenantId, USAGE_METRICS.inferenceTokensPerDay, on)).toBe(150);

    // Le lendemain repart de zéro : sans cela, un plafond « par jour » serait un plafond à vie.
    const demain = new Date(on.getTime() + 24 * 60 * 60 * 1000);
    expect(await ledger.tenantUsage(tenantId, USAGE_METRICS.inferenceTokensPerDay, demain)).toBe(0);
    expect(periodFor(USAGE_METRICS.inferenceTokensPerDay, on).end.getTime()).toBe(
      periodFor(USAGE_METRICS.inferenceTokensPerDay, demain).start.getTime(),
    );
  });

  it("sans abonnement actif, le plafond est zéro — pas « pas de plafond »", async () => {
    // Le trou que ce test ferme : une entreprise résiliée ou impayée n'a aucune ligne
    // d'abonnement actif. Lire « aucun quota défini » revenait à lui accorder un travail
    // ILLIMITÉ, aux frais des autres — le quota du fournisseur étant unique et partagé.
    const resilie = randomUUID() as TenantId;
    await sql.query("insert into tenant (id, name) values ($1, $2)", [resilie, "Entreprise résiliée"]);
    await sql.query(
      `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
       select $1, id, 'canceled', now() - interval '60 days', now() - interval '30 days'
         from plan where tier = 'start'`,
      [resilie],
    );

    expect(await ledger.tenantLimit(resilie, USAGE_METRICS.inferenceTokensPerDay)).toBe(0);

    const gateway = new ModelGateway({
      providers: [
        {
          key: "mistral",
          dataPolicy: "no_train",
          complete: async () => ({ turn: { role: "assistant", type: "text", text: "…" }, tokens: 1 }),
        },
      ],
      ledger,
      journal,
      flags: FLAGS,
      clock: { now: () => new Date(), sleep: async () => undefined },
    });

    await expect(
      gateway.complete({
        turns: [{ role: "user", type: "text", text: "prospecte" }],
        dataClass: "real",
        envelope: INFERENCE_ENVELOPES.soldEmployees,
        tenantId: resilie,
      }),
    ).rejects.toBeInstanceOf(TaskDeferred);

    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = $1", [resilie]);
      await tx.query("delete from tenant where id = $1", [resilie]);
    });
  });

  it("compte la période sur le cycle d'abonnement, pas sur le mois calendaire", async () => {
    // Un client inscrit le 20 verrait sinon son quota mensuel remis à zéro le 1er : deux fois son
    // quota le premier mois, puis un décalage permanent entre ce qu'il paie et ce qu'il consomme.
    const [row] = await sql.query<{ current_period_start: Date }>(
      "select current_period_start from subscription where tenant_id = $1 and status = 'active'",
      [tenantId],
    );
    const debutCycle = new Date(row?.current_period_start as unknown as string);

    await ledger.recordTenantUsage(tenantId, USAGE_METRICS.inferenceTokensPerPeriod, 7, new Date());

    const counters = await sql.query<{ period_start: Date }>(
      "select period_start from usage_counter where tenant_id = $1 and metric = $2",
      [tenantId, USAGE_METRICS.inferenceTokensPerPeriod],
    );

    expect(counters).toHaveLength(1);
    expect(new Date(counters[0]?.period_start as unknown as string).getTime()).toBe(
      debutCycle.getTime(),
    );
  });

  it("compte l'enveloppe même si personne n'a ouvert la fenêtre", async () => {
    // Un fournisseur « sans entraînement » ne peut pas exister en base sans preuve datée : la
    // contrainte `provider_no_train_needs_proof` le refuse. Le test n'en fabrique donc pas une —
    // il prend un fournisseur de secours, dont le comptage d'enveloppe est identique.
    await sql.query(
      `insert into provider_credential (provider_key, data_policy) values ('secours-test', 'free')
       on conflict (provider_key) do nothing`,
      [],
    );

    const avant = await ledger.envelopeUsage(INFERENCE_ENVELOPES.soldEmployees);
    await ledger.recordEnvelopeUsage(INFERENCE_ENVELOPES.soldEmployees, "secours-test", 40);

    expect(await ledger.envelopeUsage(INFERENCE_ENVELOPES.soldEmployees)).toBe(avant + 40);
  });

  it("ouvre une fenêtre MENSUELLE — la période du budget auquel le Gateway la compare", async () => {
    // Ce test existe à cause d'un défaut réel : la fenêtre était journalière alors que
    // `assertEnvelopeHasRoom` compare à `tokensPerMonth * part`. On mesurait donc la
    // consommation d'un jour contre le budget d'un mois, et le plafond ne se déclenchait qu'au
    // trentuple de sa valeur — c'est-à-dire jamais.
    //
    // Il ne teste pas une écriture SQL : il teste que les deux bouts parlent de la même période.
    await sql.query(
      `insert into provider_credential (provider_key, data_policy) values ('secours-fenetre', 'free')
       on conflict (provider_key) do nothing`,
      [],
    );

    // ⚠️ Sans cet effacement, le test ne prouve rien. `recordEnvelopeUsage` tente d'abord un
    // UPDATE sur une fenêtre ouverte, et n'ouvre une fenêtre que si elle échoue. Une ligne
    // laissée par une exécution précédente le ferait donc passer par l'UPDATE, sans jamais
    // exercer l'écriture qu'on vérifie ici — le test resterait vert même en repassant la
    // fenêtre au journalier. C'est arrivé, et c'est ce qui a rendu la première version décorative.
    await sql.query(`delete from provider_quota where provider_key = 'secours-fenetre'`, []);

    await ledger.recordEnvelopeUsage(INFERENCE_ENVELOPES.internal, "secours-fenetre", 7);

    const rows = await sql.query<{ jours: string; debut_du_mois: boolean }>(
      `select extract(day from (window_end - window_start))::text as jours,
              (window_start = date_trunc('month', window_start)) as debut_du_mois
         from provider_quota
        where provider_key = 'secours-fenetre' and envelope = $1
          and now() >= window_start and now() < window_end`,
      [INFERENCE_ENVELOPES.internal],
    );

    const fenetre = rows[0];
    expect(fenetre).toBeDefined();
    // Un mois fait 28 à 31 jours : on vérifie l'ordre de grandeur et l'ancrage, pas une durée fixe.
    expect(Number(fenetre?.jours)).toBeGreaterThanOrEqual(28);
    expect(fenetre?.debut_du_mois).toBe(true);
  });

  it("TEST-07 : au plafond réel de sa formule, la tâche est reportée et journalisée", async () => {
    const limit = (await ledger.tenantLimit(tenantId, USAGE_METRICS.inferenceTokensPerDay)) ?? 0;
    const on = new Date();
    const used = await ledger.tenantUsage(tenantId, USAGE_METRICS.inferenceTokensPerDay, on);
    await ledger.recordTenantUsage(
      tenantId,
      USAGE_METRICS.inferenceTokensPerDay,
      limit - used,
      on,
    );

    const provider: ModelProvider = {
      key: "mistral",
      dataPolicy: "no_train",
      complete: async () => ({
        turn: { role: "assistant", type: "text", text: "…" },
        tokens: 1,
      }),
    };
    const gateway = new ModelGateway({
      providers: [provider],
      ledger,
      journal,
      flags: FLAGS,
      clock: { now: () => new Date(), sleep: async () => undefined },
    });

    const failure = await gateway
      .complete({
        turns: [{ role: "user", type: "text", text: "prospecte" }],
        dataClass: "real",
        envelope: INFERENCE_ENVELOPES.soldEmployees,
        tenantId,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TaskDeferred);

    const events = await sql.query<{ kind: string }>(
      "select kind from execution_event where tenant_id = $1 and kind = 'tache_reportee'",
      [tenantId],
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it("suspend puis laisse passer, selon l'accord permanent réellement enregistré", async () => {
    const engine = new PolicyEngine(approvals, journal);
    const request = {
      tenantId,
      taskId,
      employeeId,
      capabilityKey: "envoyer_message",
      effectClass: "external_irreversible",
      autonomy: "confirm_once",
    } as const;

    const first = await engine.decide(request);
    expect(first.outcome).toBe("suspend");

    // Une seconde demande ne crée pas une seconde question au client.
    const second = await engine.decide(request);
    expect(second.outcome).toBe("suspend");
    const pending = await sql.query<{ id: string }>(
      "select id from approval where tenant_id = $1 and state = 'requested'",
      [tenantId],
    );
    expect(pending).toHaveLength(1);

    // L'accord NOMME la capacité : depuis EXEC-05, il n'existe plus d'accord par classe d'effet,
    // qui autorisait tout un genre d'actions d'un seul geste.
    await sql.query(
      `insert into standing_approval (tenant_id, employee_id, effect_class, capability_key)
       values ($1, $2, $3, $4)`,
      [tenantId, employeeId, "external_irreversible", "envoyer_message"],
    );
    expect((await engine.decide(request)).outcome).toBe("allow");

    // Et il ne déborde pas : une autre capacité, même classe d'effet, reste suspendue.
    expect(
      (await engine.decide({ ...request, capabilityKey: "supprimer_donnees" })).outcome,
    ).toBe("suspend");

    // Révocation : effet immédiat, sans redémarrage.
    await sql.query(
      "update standing_approval set revoked_at = now() where tenant_id = $1 and employee_id = $2",
      [tenantId, employeeId],
    );
    expect((await engine.decide(request)).outcome).toBe("suspend");
  });

  it("la garde d'envoi refuse tant que tout n'est pas réuni, puis autorise", async () => {
    const [domain] = await sql.query<{ id: string }>(
      "insert into sending_domain (tenant_id, domain) values ($1, 'client.fr') returning id",
      [tenantId],
    );
    const [lead] = await sql.query<{ id: string }>(
      `insert into lead (tenant_id, company_name, email, source, qualification)
       values ($1, 'Prospect SARL', 'contact@prospect.fr', 'import_client', 'qualifie')
       returning id`,
      [tenantId],
    );

    const guard = new PostgresSendingGuard(sql, ledger);
    const target = { tenantId, leadId: lead?.id as string, sendingDomainId: domain?.id as string };

    // Domaine non authentifié : rien ne part, même avec un prospect qualifié.
    expect(await guard.check(target)).toEqual({
      allowed: false,
      reason: "domaine_non_authentifie",
    });

    await sql.query(
      `update sending_domain
          set spf_verified_at = now(), dkim_verified_at = now(), dmarc_verified_at = now(),
              warmup_started_on = current_date
        where id = $1`,
      [domain?.id],
    );

    const verdict = await guard.check(target);
    expect(verdict).toMatchObject({ allowed: true });
    // L'adresse vient de la base, pas de l'appelant.
    expect(verdict.allowed && verdict.recipient.address).toBe("contact@prospect.fr");

    // Réservation : la seconde tentative sur la même clé repart les mains vides.
    const store = new PostgresOutboundMessages(sql);
    const claim = {
      tenantId,
      leadId: lead?.id as string,
      employeeId,
      sendingDomainId: domain?.id as string,
      subject: "Vos fenêtres",
      idempotencyKey: "envoyer.prospect:integration",
    };
    expect(await store.claim(claim)).toBe(true);
    expect(await store.claim(claim)).toBe(false);

    // Et le plafond du jour s'applique : la formule Start autorise 30 messages par jour.
    await sql.query(
      `insert into outbound_message
         (tenant_id, lead_id, employee_id, sending_domain_id, subject,
          carried_optout, carried_notice, idempotency_key)
       select $1, $2, $3, $4, 'remplissage', true, true, 'bourrage-' || g
         from generate_series(1, 30) g`,
      [tenantId, lead?.id, employeeId, domain?.id],
    );
    expect(await guard.check(target)).toEqual({
      allowed: false,
      reason: "plafond_du_jour_atteint",
    });
  });

  it("un rebond ferme l'adresse, et la garde le voit aussitôt", async () => {
    const { tenantId, employeeId } = await freshTenant();
    const [domain] = await sql.query<{ id: string }>(
      `insert into sending_domain
         (tenant_id, domain, spf_verified_at, dkim_verified_at, dmarc_verified_at, warmup_started_on)
       values ($1, 'rebonds.fr', now(), now(), now(), current_date) returning id`,
      [tenantId],
    );
    const [lead] = await sql.query<{ id: string }>(
      `insert into lead (tenant_id, company_name, email, source, qualification)
       values ($1, 'Prospect Injoignable', 'mort@prospect.fr', 'import_client', 'qualifie')
       returning id`,
      [tenantId],
    );

    const store = new PostgresOutboundMessages(sql);
    await store.claim({
      tenantId,
      leadId: lead?.id as string,
      employeeId,
      sendingDomainId: domain?.id as string,
      subject: "Bonjour",
      idempotencyKey: "envoyer.prospect:rebond",
    });
    await store.confirm({
      tenantId,
      idempotencyKey: "envoyer.prospect:rebond",
      providerMessageId: "prov_1",
    });

    const feedback = new PostgresDeliveryFeedback(sql);
    const outcome = await feedback.apply({
      tenantId,
      providerMessageId: "prov_1",
      kind: "bounce",
      email: "MORT@prospect.fr",
    });

    expect(outcome.matched).toBe(true);
    // Volume trop faible pour conclure sur les taux : on ne suspend pas, mais l'adresse est fermée.
    expect(outcome.suspended).toBe(false);

    const guard = new PostgresSendingGuard(sql, ledger);
    expect(
      await guard.check({
        tenantId,
        leadId: lead?.id as string,
        sendingDomainId: domain?.id as string,
      }),
    ).toEqual({ allowed: false, reason: "destinataire_sur_liste_d_exclusion" });
  });

  it("au-delà des seuils, le domaine se suspend tout seul — et ne repart pas tout seul", async () => {
    const { tenantId, employeeId } = await freshTenant();
    const [domain] = await sql.query<{ id: string }>(
      `insert into sending_domain
         (tenant_id, domain, spf_verified_at, dkim_verified_at, dmarc_verified_at, warmup_started_on)
       values ($1, 'sature.fr', now(), now(), now(), current_date - 30) returning id`,
      [tenantId],
    );
    const [lead] = await sql.query<{ id: string }>(
      `insert into lead (tenant_id, company_name, email, source, qualification)
       values ($1, 'Prospect Ordinaire', 'ok@prospect.fr', 'import_client', 'qualifie')
       returning id`,
      [tenantId],
    );

    // 100 messages, dont 5 rebonds : 5 % là où la limite est de 2 %.
    await sql.query(
      `insert into outbound_message
         (tenant_id, lead_id, employee_id, sending_domain_id, subject,
          carried_optout, carried_notice, idempotency_key, status)
       select $1, $2, $3, $4, 'lot', true, true, 'seuil-' || g,
              case when g <= 5 then 'rebond' else 'envoye' end
         from generate_series(1, 100) g`,
      [tenantId, lead?.id, employeeId, domain?.id],
    );

    const raison = await new PostgresDeliveryFeedback(sql).reassess(tenantId, domain?.id as string);
    expect(raison).toMatch(/rebonds/);

    const [row] = await sql.query<{ suspended_at: Date | null; suspension_reason: string }>(
      "select suspended_at, suspension_reason from sending_domain where id = $1",
      [domain?.id],
    );
    expect(row?.suspended_at).not.toBeNull();
    expect(row?.suspension_reason).toMatch(/rebonds/);

    // Et la garde refuse désormais, quoi qu'il arrive par ailleurs.
    const guard = new PostgresSendingGuard(sql, ledger);
    expect(
      await guard.check({
        tenantId,
        leadId: lead?.id as string,
        sendingDomainId: domain?.id as string,
      }),
    ).toEqual({ allowed: false, reason: "domaine_suspendu" });
  });

  it("journalise chaque décision de politique dans la bonne entreprise", async () => {
    const events = await sql.query<{ kind: string }>(
      `select kind from execution_event
        where tenant_id = $1 and kind like 'politique_%' order by created_at`,
      [tenantId],
    );

    expect(events.map((e) => e.kind)).toContain("politique_suspend");
    expect(events.map((e) => e.kind)).toContain("politique_allow");
  });
});
