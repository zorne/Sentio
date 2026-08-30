import { randomUUID } from "node:crypto";

import { REGLAGES_RUNTIME_PAR_DEFAUT } from "@sentio/config";
import { CapabilityRegistry } from "@sentio/core";
import type { EmployeeId, TenantId } from "@sentio/domain";
import { PostgresJournalWriter, reprendreLesMissionsDebloquees } from "@sentio/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * La reprise d'une mission mise de côté faute d'outil.
 *
 * ══ LE DOMMAGE QUE CE FICHIER GARDE ══
 *
 * Une mission qu'aucune capacité activée ne peut servir s'arrête en `needs_attention` et sort de la
 * file. Rien ne l'y remettait : le dirigeant activait la capacité manquante, et il ne se passait
 * rien. Pire, l'exclusion du gisement portant sur TOUS les états, le prospect de cette mission
 * n'était plus jamais proposé — le vivier se vidait définitivement, une mission à la fois.
 *
 * Ce fichier éprouve la reprise ET ses trois sûretés. La deuxième est la plus importante : relancer
 * une mission arrêtée sur un effet irréversible dont l'issue est inconnue irait contre le
 * « personne ne doit deviner » de `adr/0026`.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

describeIfDatabase("La reprise après qu'un outil est apparu", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await sql.withTransaction(async (tx) => {
        await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
        await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
        await tx.query("delete from tenant where id = $1", [tenantId]);
      });
    }
    await sql.close();
  });

  /** Un registre qui sert `qualifier.prospect`, comme la composition par défaut. */
  function registreQuiSert(cles: readonly string[]): CapabilityRegistry {
    const registry = new CapabilityRegistry();
    for (const cle of cles) {
      registry.registerContract({ key: cle, effectClass: "internal_write", description: "essai" });
      registry.registerEngine({ engineKey: "base", capabilityKey: cle, execute: async () => ({}) });
    }
    return registry;
  }

  function deps(registry: CapabilityRegistry) {
    return { sql, journal: new PostgresJournalWriter(sql), registry, reglages: REGLAGES_RUNTIME_PAR_DEFAUT };
  }

  /** Une entreprise avec une mission bloquée, dans l'état exact que produit le runtime. */
  async function entrepriseAvecMissionBloquee(options: {
    motif: string;
    capaciteActivee: string | null;
    sujet?: string;
  }): Promise<{ tenantId: TenantId; employeeId: EmployeeId; taskId: string }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Reprise SARL"]);
    await sql.query(
      `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
       select $1, p.id, 'active', now() - interval '1 day', now() + interval '29 days'
         from plan p where p.tier = 'start'`,
      [tenantId],
    );
    await sql.query(
      `insert into objective (tenant_id, metric, target_value, horizon)
       values ($1, 'chiffre_affaires', 5000, 'mois')`,
      [tenantId],
    );
    const [def] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, '{}'::jsonb, '["qualifier.prospect"]'::jsonb) returning id`,
      [versionUnique()],
    );
    const [ident] = await sql.query<{ id: string }>("select * from reserve_identity($1)", ["commercial"]);
    const [emp] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, def?.id, ident?.id],
    );
    const employeeId = emp?.id as string;

    if (options.capaciteActivee !== null) {
      await sql.query(
        `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
         select $1, $2, c.id, true from capability c where c.key = $3`,
        [tenantId, employeeId, options.capaciteActivee],
      );
    }

    const [lead] = await sql.query<{ id: string }>(
      `insert into lead (tenant_id, company_name, email, source, qualification)
       values ($1, 'Bloquée', $2, 'import_client', 'nouveau') returning id`,
      [tenantId, `bloquee-${randomUUID().slice(0, 8)}@exemple.fr`],
    );
    const [tache] = await sql.query<{ id: string }>(
      `insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id, state)
       select $1, $2, (select id from objective where tenant_id = $1 and state = 'actif'),
              $3, $4, 'needs_attention'
       returning id`,
      [tenantId, employeeId, options.sujet ?? "lead", lead?.id],
    );
    const taskId = tache?.id as string;

    // L'événement qui porte le motif — c'est lui, et lui seul, que la reprise relit.
    await sql.query(
      `insert into execution_event (tenant_id, task_id, employee_id, kind, payload)
       values ($1, $2, $3, 'attention_requise', jsonb_build_object('motif', $4::text))`,
      [tenantId, taskId, employeeId, options.motif],
    );
    // La mission est hors de la file, comme `mettreDeCote` la laisse.
    await sql.query("delete from job where tenant_id = $1", [tenantId]);

    return { tenantId: tenantId as TenantId, employeeId: employeeId as EmployeeId, taskId };
  }

  async function etat(taskId: string): Promise<string> {
    const [t] = await sql.query<{ state: string }>("select state from task where id = $1", [taskId]);
    return t?.state as string;
  }

  /**
   * ⚠️ La reprise est GLOBALE — comme l'approvisionnement, elle examine toutes les entreprises.
   * Les cas de ce fichier laissent donc des missions bloquées derrière eux, et compter les
   * reprises du RAPPORT mesurerait le voisin autant que soi. On vérifie donc l'effet sur LA
   * mission du cas, jamais le total : c'est la seule assertion qui reste vraie quel que soit
   * l'ordre d'exécution.
   */
  async function repriseJournalisee(taskId: string): Promise<boolean> {
    const [e] = await sql.query<{ n: string }>(
      "select count(*) as n from execution_event where task_id = $1 and kind = 'reprise_apres_outil'",
      [taskId],
    );
    return Number(e?.n ?? 0) > 0;
  }

  async function enFile(taskId: string): Promise<number> {
    const [j] = await sql.query<{ n: string }>(
      "select count(*) as n from job where task_id = $1",
      [taskId],
    );
    return Number(j?.n ?? 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Le cas nominal
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐ la capacité est activée et servie : la mission retourne en file", async () => {
    const { taskId } = await entrepriseAvecMissionBloquee({
      motif: "capacite_absente",
      capaciteActivee: "qualifier.prospect",
    });

    await reprendreLesMissionsDebloquees(deps(registreQuiSert(["qualifier.prospect"])));

    expect(await etat(taskId)).toBe("pending");
    expect(await enFile(taskId)).toBe(1);
    expect(await repriseJournalisee(taskId)).toBe(true);
  });

  it("la reprise est journalisée — « elle est repartie toute seule » doit s'expliquer", async () => {
    const { tenantId, taskId } = await entrepriseAvecMissionBloquee({
      motif: "capacite_absente",
      capaciteActivee: "qualifier.prospect",
    });

    await reprendreLesMissionsDebloquees(deps(registreQuiSert(["qualifier.prospect"])));

    const [evenement] = await sql.query<{ kind: string; payload: Record<string, unknown> }>(
      `select kind, payload from execution_event
        where tenant_id = $1 and task_id = $2 and kind = 'reprise_apres_outil'`,
      [tenantId, taskId],
    );
    expect(evenement?.kind).toBe("reprise_apres_outil");
    expect(evenement?.payload["motif"]).toBe("capacite_absente");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Les trois sûretés
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐⭐ ne relance JAMAIS une mission arrêtée sur une vérification humaine", async () => {
    // ⚠️ LA SÛRETÉ LA PLUS IMPORTANTE DE CE MODULE. `needs_attention` couvre aussi le cas où un
    // effet irréversible a été engagé et son issue est inconnue. La rejouer irait contre le
    // « personne ne doit deviner » d'`adr/0026` — et l'effet pourrait avoir lieu deux fois.
    const { taskId } = await entrepriseAvecMissionBloquee({
      motif: "verification_humaine",
      capaciteActivee: "qualifier.prospect",
    });

    await reprendreLesMissionsDebloquees(deps(registreQuiSert(["qualifier.prospect"])));

    expect(await etat(taskId)).toBe("needs_attention");
    expect(await enFile(taskId)).toBe(0);
    expect(await repriseJournalisee(taskId)).toBe(false);
  });

  it("⭐ ne relance pas tant que la cause est TOUJOURS là — sinon c'est une boucle", async () => {
    // Sans ce contrôle, une mission encore bloquée serait reprise à chaque cycle, échouerait, et
    // reviendrait : une boucle qui ne coûte aucun appel de modèle, mais qui ne finit jamais.
    const { taskId } = await entrepriseAvecMissionBloquee({
      motif: "capacite_absente",
      capaciteActivee: null,
    });

    await reprendreLesMissionsDebloquees(deps(registreQuiSert(["qualifier.prospect"])));

    expect(await etat(taskId)).toBe("needs_attention");
    expect(await repriseJournalisee(taskId)).toBe(false);
  });

  it("⭐ une capacité activée mais qu'AUCUN MOTEUR ne sert ne débloque rien", async () => {
    // ⚠️ C'est ici que la reprise et le filtre du pas doivent dire la même chose. Si la reprise
    // se fiait à `capability.disponible` plutôt qu'au registre de cet hôte, elle relancerait une
    // mission que le pas suivant rebloquerait aussitôt.
    const { taskId } = await entrepriseAvecMissionBloquee({
      motif: "capacite_absente",
      capaciteActivee: "qualifier.prospect",
    });

    // Le registre de cet hôte ne sert PAS `qualifier.prospect`.
    await reprendreLesMissionsDebloquees(deps(registreQuiSert(["rechercher.prospect"])));

    expect(await etat(taskId)).toBe("needs_attention");
    expect(await repriseJournalisee(taskId)).toBe(false);
  });

  it("⭐ une capacité inapplicable au sujet ne débloque rien", async () => {
    // La mission porte sur une `recherche` ; `qualifier.prospect` exige un prospect.
    const { taskId } = await entrepriseAvecMissionBloquee({
      motif: "capacite_absente",
      capaciteActivee: "qualifier.prospect",
      sujet: "recherche",
    });

    await reprendreLesMissionsDebloquees(deps(registreQuiSert(["qualifier.prospect"])));

    expect(await etat(taskId)).toBe("needs_attention");
    expect(await repriseJournalisee(taskId)).toBe(false);
  });

  it("⭐ la borne tient : au plus `reprisesMaxParCycle` par passage", async () => {
    // ⚠️ CETTE BORNE EXISTE CONTRE UNE FACTURE SURPRISE. Un dirigeant qui active une capacité peut
    // débloquer des centaines de missions ; les reprendre ensemble ferait de la réparation un
    // incident.
    const plafond = REGLAGES_RUNTIME_PAR_DEFAUT.reprisesMaxParCycle;
    for (let i = 0; i < plafond + 3; i++) {
      await entrepriseAvecMissionBloquee({
        motif: "capacite_absente",
        capaciteActivee: "qualifier.prospect",
      });
    }

    const rapport = await reprendreLesMissionsDebloquees(deps(registreQuiSert(["qualifier.prospect"])));

    expect(rapport.examinees).toBeLessThanOrEqual(plafond);
  });
});
