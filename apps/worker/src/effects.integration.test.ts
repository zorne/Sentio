import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  EffetTransitoire,
  CapabilityRegistry,
  executeDecidedAction,
  idempotencyKeyFor,
  type DecisionPas,
} from "@sentio/core";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

import { PostgresEffectLedger } from "@sentio/runtime";

/** Versions uniques par appel : `Date.now()` collisionne entre deux fixtures de la même ms. */
let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

/**
 * EXEC-06 — l'unicité et la concurrence, contre un **vrai** Postgres.
 *
 * ⚠️ Ces cas ne peuvent PAS être unitaires, et c'est le cœur du sujet.
 *
 * Un registre factice rend ce qu'on lui dit de rendre : il « garantit » une unicité qu'il
 * simule. Or la propriété défendue est précisément qu'un `if` applicatif ne suffit pas — deux
 * workers le franchissent tous les deux. Seul l'index
 * `unique (tenant_id, idempotency_key)` tranche, et il n'y a qu'une façon de le prouver : lancer
 * deux exécutions réellement concurrentes sur la même base et compter les effets.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("L'exécution d'un effet, sur un vrai Postgres", () => {
  let sql: PostgresClient;
  let ledger: PostgresEffectLedger;

  const tenantA = randomUUID() as TenantId;
  const tenantB = randomUUID() as TenantId;
  let employeA: EmployeeId;
  let employeB: EmployeeId;
  let tacheA: TaskId;
  let tacheA2: TaskId;
  let tacheB: TaskId;

  async function creerEntreprise(tenantId: string, nom: string) {
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, nom]);
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [versionUnique()],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", ["commercial"]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    const [task] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, subject_kind, subject_id) " +
        "values ($1, $2, 'lead', gen_random_uuid()) returning id",
      [tenantId, employee?.id],
    );
    return { employeeId: employee?.id as EmployeeId, taskId: task?.id as TaskId };
  }

  function registre() {
    const r = new CapabilityRegistry();
    r.registerContract({
      key: "envoyer_message",
      effectClass: "external_irreversible",
      description: "Écrire à une entreprise.",
    });
    r.registerContract({
      key: "lire_prospects",
      effectClass: "read",
      description: "Regarder les prospects.",
    });
    return r;
  }

  function decision(capabilityKey: string, entree: Record<string, unknown>): DecisionPas {
    return {
      kind: "agir",
      proposition: { kind: "action", capabilityKey, input: entree, rationale: "Premier contact." },
      decision: { outcome: "allow", notify: false, basis: "accord_permanent" },
    };
  }

  function deps(moteur: () => Promise<unknown>) {
    return {
      registry: registre(),
      ledger,
      engineFor: async () => ({ execute: moteur as (input: unknown) => Promise<unknown> }),
    };
  }

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    ledger = new PostgresEffectLedger(sql);

    ({ employeeId: employeA, taskId: tacheA } = await creerEntreprise(tenantA, "Effets A"));
    ({ employeeId: employeB, taskId: tacheB } = await creerEntreprise(tenantB, "Effets B"));

    const [seconde] = await sql.query<{ id: string }>(
      "insert into task (tenant_id, employee_id, subject_kind, subject_id) " +
        "values ($1, $2, 'lead', gen_random_uuid()) returning id",
      [tenantA, employeA],
    );
    tacheA2 = seconde?.id as TaskId;
  });

  afterAll(async () => {
    await sql.withTransaction(async (tx) => {
      await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
      await tx.query("delete from execution_event where tenant_id = any($1)", [[tenantA, tenantB]]);
      await tx.query("delete from tenant where id = any($1)", [[tenantA, tenantB]]);
    });
    await sql.close();
  });

  // ── LE test de cette tranche ───────────────────────────────────────────────

  /**
   * Force une course RÉELLE : les deux workers franchissent la lecture d'état avant que l'un
   * d'eux n'engage. Sans cette barrière, `Promise.all` ne garantit rien — le premier peut avoir
   * terminé avant que le second ne commence, et le test passerait même avec une implémentation
   * qui lit puis écrit sans filet.
   */
  function avecBarriere(reel: PostgresEffectLedger, arrivees: { n: number; ouvrir?: () => void; porte: Promise<void> }) {
    return {
      statusOf: reel.statusOf.bind(reel),
      record: reel.record.bind(reel),
      reserve: async (input: Parameters<PostgresEffectLedger["reserve"]>[0]) => {
        arrivees.n += 1;
        if (arrivees.n >= 2) arrivees.ouvrir?.();
        await arrivees.porte;
        return reel.reserve(input);
      },
    };
  }

  it("deux workers concurrents sur le MÊME effet : un seul agit", async () => {
    const moteur = vi.fn(async () => ({ messageId: randomUUID() }));
    const entree = { a: "julie@exemple.fr", message: "concurrence" };

    // Deux connexions distinctes, deux exécutions lancées ensemble — la situation réelle de deux
    // battements qui se chevauchent. Aucun `if` applicatif ne les départage.
    const autreClient = createPostgresClient(connectionString as string);
    try {
      let ouvrir!: () => void;
      const porte = new Promise<void>((resolve) => {
        ouvrir = resolve;
      });
      const arrivees = { n: 0, ouvrir, porte };

      const depsA = {
        registry: registre(),
        ledger: avecBarriere(ledger, arrivees),
        engineFor: async () => ({ execute: moteur as (input: unknown) => Promise<unknown> }),
      };
      const depsB = {
        registry: registre(),
        ledger: avecBarriere(new PostgresEffectLedger(autreClient), arrivees),
        engineFor: async () => ({ execute: moteur as (input: unknown) => Promise<unknown> }),
      };

      const [a, b] = await Promise.all([
        executeDecidedAction(depsA, {
          tenantId: tenantA,
          taskId: tacheA,
          employeeId: employeA,
          decision: decision("envoyer_message", entree),
        }),
        executeDecidedAction(depsB, {
          tenantId: tenantA,
          taskId: tacheA2,
          employeeId: employeA,
          decision: decision("envoyer_message", entree),
        }),
      ]);

      // Un seul effet, quoi qu'il arrive.
      expect(moteur).toHaveBeenCalledTimes(1);

      const issues = [a.kind, b.kind].sort();
      // Le gagnant exécute ; le perdant ne devine pas — il constate.
      expect(issues).toContain("execute");
      expect(issues.filter((k) => k === "execute")).toHaveLength(1);

      // Et la base ne porte qu'UN engagement pour cette clé.
      const cle = idempotencyKeyFor({
        tenantId: tenantA,
        capabilityKey: "envoyer_message",
        effect: entree,
      });
      const engagements = await sql.query<{ n: string }>(
        "select count(*) as n from execution_event where tenant_id = $1 and idempotency_key = $2",
        [tenantA, cle],
      );
      expect(Number(engagements[0]?.n)).toBe(1);
    } finally {
      await autreClient.close();
    }
  });

  it("c'est la BASE qui refuse le doublon, pas une lecture préalable", async () => {
    const entree = { a: "marc@exemple.fr", message: "unicité" };
    const cle = idempotencyKeyFor({
      tenantId: tenantA,
      capabilityKey: "envoyer_message",
      effect: entree,
    });

    expect(
      await ledger.reserve({
        tenantId: tenantA,
        taskId: tacheA,
        employeeId: employeA,
        capabilityKey: "envoyer_message",
        idempotencyKey: cle,
      }),
    ).toBe(true);

    // Le second engagement échoue sur la contrainte d'unicité, sans que rien ne l'ait lu avant.
    expect(
      await ledger.reserve({
        tenantId: tenantA,
        taskId: tacheA2,
        employeeId: employeA,
        capabilityKey: "envoyer_message",
        idempotencyKey: cle,
      }),
    ).toBe(false);
  });

  // ── L'effet, une fois et une seule, à travers les tâches ──────────────────

  it("le même effet décidé par DEUX tâches ne part qu'une fois", async () => {
    const moteur = vi.fn(async () => ({ messageId: "m-unique" }));
    const entree = { a: "pierre@exemple.fr", message: "deux tâches" };

    const premier = await executeDecidedAction(deps(moteur), {
      tenantId: tenantA,
      taskId: tacheA,
      employeeId: employeA,
      decision: decision("envoyer_message", entree),
    });
    const second = await executeDecidedAction(deps(moteur), {
      tenantId: tenantA,
      taskId: tacheA2,
      employeeId: employeA,
      decision: decision("envoyer_message", entree),
    });

    expect(premier.kind).toBe("execute");
    expect(second.kind).toBe("deja_fait");
    expect(moteur).toHaveBeenCalledTimes(1);
  });

  it("une AUTRE entreprise n'entre pas en collision, même effet mot pour mot", async () => {
    const moteur = vi.fn(async () => ({ messageId: "m-autre" }));
    const entree = { a: "pierre@exemple.fr", message: "deux tâches" };

    const chezB = await executeDecidedAction(
      {
        registry: registre(),
        ledger,
        engineFor: async () => ({ execute: moteur as (input: unknown) => Promise<unknown> }),
      },
      {
        tenantId: tenantB,
        taskId: tacheB,
        employeeId: employeB,
        decision: decision("envoyer_message", entree),
      },
    );

    expect(chezB.kind).toBe("execute");
    expect(moteur).toHaveBeenCalledTimes(1);
  });

  // ── Les interruptions, telles que la base les enregistre ──────────────────

  it("engagé sans résultat : l'effet irréversible n'est PAS rejoué", async () => {
    const entree = { a: "orpheline@exemple.fr", message: "interrompue" };
    const cle = idempotencyKeyFor({
      tenantId: tenantA,
      capabilityKey: "envoyer_message",
      effect: entree,
    });

    // On simule exactement l'état laissé par un worker tué juste après l'engagement.
    await ledger.reserve({
      tenantId: tenantA,
      taskId: tacheA,
      employeeId: employeA,
      capabilityKey: "envoyer_message",
      idempotencyKey: cle,
    });

    const moteur = vi.fn(async () => ({ messageId: "ne-doit-pas-partir" }));
    const resultat = await executeDecidedAction(deps(moteur), {
      tenantId: tenantA,
      taskId: tacheA,
      employeeId: employeA,
      decision: decision("envoyer_message", entree),
    });

    expect(resultat.kind).toBe("verification_humaine_requise");
    expect(moteur).not.toHaveBeenCalled();
  });

  it("le journal distingue les trois états d'un effet", async () => {
    const jamais = idempotencyKeyFor({
      tenantId: tenantA,
      capabilityKey: "envoyer_message",
      effect: { a: "personne@exemple.fr" },
    });
    expect((await ledger.statusOf(tenantA, jamais)).kind).toBe("jamais_engage");

    const entree = { a: "trois-etats@exemple.fr", message: "x" };
    const cle = idempotencyKeyFor({
      tenantId: tenantA,
      capabilityKey: "envoyer_message",
      effect: entree,
    });
    await ledger.reserve({
      tenantId: tenantA,
      taskId: tacheA,
      employeeId: employeA,
      capabilityKey: "envoyer_message",
      idempotencyKey: cle,
    });
    expect((await ledger.statusOf(tenantA, cle)).kind).toBe("engage_sans_resultat");

    await ledger.record({
      tenantId: tenantA,
      taskId: tacheA,
      employeeId: employeA,
      kind: "action_executee",
      idempotencyKey: cle,
      payload: { resultat: { messageId: "m-3" } },
    });
    const apres = await ledger.statusOf(tenantA, cle);
    expect(apres.kind).toBe("deja_execute");
    if (apres.kind === "deja_execute") expect(apres.resultat).toEqual({ messageId: "m-3" });
  });

  it("un effet rejouable reprend après interruption, et finit par abandonner", async () => {
    const entree = { filtre: `actifs-${randomUUID().slice(0, 8)}` };
    const moteur = vi.fn(async () => {
      throw new EffetTransitoire("service indisponible");
    });

    let dernier = await executeDecidedAction(deps(moteur), {
      tenantId: tenantA,
      taskId: tacheA,
      employeeId: employeA,
      decision: decision("lire_prospects", entree),
    });
    expect(dernier.kind).toBe("echec_transitoire");

    for (let i = 0; i < 5 && dernier.kind === "echec_transitoire"; i++) {
      dernier = await executeDecidedAction(deps(moteur), {
        tenantId: tenantA,
        taskId: tacheA,
        employeeId: employeA,
        decision: decision("lire_prospects", entree),
      });
    }

    // Bornée : la boucle s'arrête, elle ne consomme pas le quota indéfiniment.
    expect(dernier.kind).toBe("echec_definitif");
    expect(moteur.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("l'engagement précède toujours l'effet — jamais un effet sans trace", async () => {
    const entree = { a: "trace@exemple.fr", message: "ordre" };
    const moteur = vi.fn(async () => ({ messageId: "m-ordre" }));

    await executeDecidedAction(deps(moteur), {
      tenantId: tenantA,
      taskId: tacheA,
      employeeId: employeA,
      decision: decision("envoyer_message", entree),
    });

    const cle = idempotencyKeyFor({
      tenantId: tenantA,
      capabilityKey: "envoyer_message",
      effect: entree,
    });
    const lignes = await sql.query<{ kind: string; seq: string }>(
      `select kind, seq from execution_event
        where tenant_id = $1 and (idempotency_key = $2 or payload->>'cle' = $2)
        order by seq asc`,
      [tenantA, cle],
    );

    expect(lignes.map((l) => l.kind)).toEqual(["action_engagee", "action_executee"]);
  });
});
