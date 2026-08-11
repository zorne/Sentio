import { randomUUID } from "node:crypto";

import { REGLAGES_RUNTIME_PAR_DEFAUT } from "@sentio/config";
import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";
import type { EmployeeId, TenantId } from "@sentio/domain";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  GisementDeProspects,
  PostgresApprovisionnementStore,
  RegistreDeGisementsParMetier,
} from "@sentio/runtime";
import { PostgresJournalWriter } from "@sentio/runtime";
import { approvisionnerLeJour, jourUtc } from "@sentio/runtime";

/**
 * EXEC-17 — l'approvisionnement contre un **vrai** Postgres.
 *
 * ⚠️ Pourquoi rien de tout cela ne peut être unitaire.
 *
 * Ce qui est vérifié ici n'est pas du code : ce sont des **garanties de la base**. Un double les
 * confirmerait toujours, et c'est précisément ce qui rendrait le test inutile.
 *
 *   · l'index unique `(tenant_id, employee_id, subject_kind, subject_id)` — le seul rempart
 *     contre « écrire deux fois au même prospect » ;
 *   · la clé primaire `(tenant_id, employee_id, jour)` — le seul rempart contre un battement
 *     rejoué ou doublé ;
 *   · le déclencheur de quota — le seul qui protège **tous** les chemins, y compris une
 *     insertion à la main et le rôle de service qui ignore RLS ;
 *   · `peut_ouvrir_une_mission()` — six conditions, chacune devant refuser seule.
 *
 * Les cas marqués « MUTATION » attaquent délibérément les garde-fous en contournant le code
 * d'approvisionnement : ils écrivent en SQL direct, comme le ferait un script de reprise ou un
 * futur chemin qu'on n'a pas encore écrit. Un garde-fou qui ne tient que si on passe par la
 * bonne porte n'est pas un garde-fou.
 */

let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("EXEC-17 — d'où vient le travail", () => {
  let sql: PostgresClient;
  let store: PostgresApprovisionnementStore;
  let journal: PostgresJournalWriter;
  const tenants: string[] = [];

  beforeAll(async () => {
    sql = createPostgresClient(connectionString as string);
    store = new PostgresApprovisionnementStore(sql);
    journal = new PostgresJournalWriter(sql);
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

  /**
   * Une entreprise complète : abonnement actif sur une formule, un objectif actif, un employé
   * commercial, et `combienDeProspects` prospects contactables.
   */
  async function entreprise(
    options: {
      tier?: "start" | "growth" | "scale";
      prospects?: number;
      objectif?: "actif" | "atteint" | "retire" | "aucun";
      abonnement?: "active" | "canceled" | "aucun";
      profession?: string;
    } = {},
  ): Promise<{ tenantId: TenantId; employeeId: EmployeeId }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise EXEC-17"]);

    const abonnement = options.abonnement ?? "active";
    if (abonnement !== "aucun") {
      await sql.query(
        `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
         select $1, p.id, $2, now() - interval '1 day', now() + interval '29 days'
           from plan p where p.tier = $3`,
        [tenantId, abonnement, options.tier ?? "start"],
      );
    }

    const objectif = options.objectif ?? "actif";
    if (objectif !== "aucun") {
      await sql.query(
        `insert into objective (tenant_id, metric, target_value, horizon, state, achieved_at)
         values ($1, '€ de chiffre d''affaires', 5000, 'mois', $2, $3)`,
        [tenantId, objectif, objectif === "atteint" ? new Date() : null],
      );
    }

    const profession = options.profession ?? "commercial";
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ($1, $2, '{}'::jsonb) returning id`,
      [profession, versionUnique()],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
       values ($1, $2, $3, 'confirm_once') returning id`,
      [tenantId, definition?.id, identity?.id],
    );

    for (let i = 0; i < (options.prospects ?? 0); i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Entreprise ${i}`, `contact${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }

    return { tenantId: tenantId as TenantId, employeeId: employee?.id as EmployeeId };
  }

  function deps(client: PostgresClient = sql) {
    return {
      store: new PostgresApprovisionnementStore(client),
      gisements: RegistreDeGisementsParMetier.commercial(client),
      journal,
    };
  }

  /**
   * Abaisse temporairement le quota d'une formule, EN DONNÉES.
   *
   * C'est ainsi qu'un plafond se change dans ce produit — jamais par une condition sur le nom de
   * la formule (`docs/03-modele-de-donnees.md`). La valeur d'origine est remise après chaque cas
   * par `afterEach` : un quota laissé bas contaminerait tous les tests suivants, et le ferait en
   * silence.
   */
  const quotasAbaisses: string[] = [];
  async function abaisserLeQuota(tier: string, valeur: number): Promise<void> {
    quotasAbaisses.push(tier);
    await sql.query(
      `update plan_quota set quota_limit = $2
        where metric = 'tasks_per_period'
          and plan_id = (select id from plan where tier = $1)`,
      [tier, valeur],
    );
  }

  afterEach(async () => {
    const original: Record<string, number> = { start: 300, growth: 1500, scale: 6000 };
    for (const tier of quotasAbaisses.splice(0)) {
      await sql.query(
        `update plan_quota set quota_limit = $2
          where metric = 'tasks_per_period'
            and plan_id = (select id from plan where tier = $1)`,
        [tier, original[tier]],
      );
    }
  });

  async function missions(tenantId: TenantId): Promise<number> {
    const [row] = await sql.query<{ n: string }>(
      "select count(*) as n from task where tenant_id = $1",
      [tenantId],
    );
    return Number(row?.n ?? 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Le cas nominal
  // ═══════════════════════════════════════════════════════════════════════════

  it("ouvre au plus dix missions, et les met en file immédiatement", async () => {
    const { tenantId } = await entreprise({ prospects: 25 });

    const rapport = await approvisionnerLeJour(deps(), new Date());

    expect(rapport.ouvertes).toBeGreaterThanOrEqual(10);
    expect(await missions(tenantId)).toBe(REGLAGES_RUNTIME_PAR_DEFAUT.missionsMaxParJour);

    // Chaque mission est due MAINTENANT : ouverte au battement, traitée au même battement une
    // fois EXEC-12 en place. L'inverse ferait attendre un jour à chaque nouvelle mission.
    const [enFile] = await sql.query<{ n: string }>(
      `select count(*) as n from job j join task t on t.id = j.task_id
        where t.tenant_id = $1 and j.next_run_at <= now()`,
      [tenantId],
    );
    expect(Number(enFile?.n)).toBe(10);
  });

  it("n'ouvre que ce qui existe : trois prospects, trois missions", async () => {
    const { tenantId } = await entreprise({ prospects: 3 });
    await approvisionnerLeJour(deps(), new Date());
    expect(await missions(tenantId)).toBe(3);
  });

  it("ne prend jamais un prospect exclu, désinscrit, écarté ou sans adresse", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 0 });

    await sql.query(
      `insert into lead (tenant_id, company_name, email, source, qualification, qualification_reason, status) values
         ($1, 'Bonne',    'ok@exemple.fr',     'import_client', 'qualifie', null,          'nouveau'),
         ($1, 'Exclue',   'exclu@exemple.fr',  'import_client', 'qualifie', null,          'exclu'),
         ($1, 'Ecartee',  'ecarte@exemple.fr', 'import_client', 'ecarte',   'hors cible',  'nouveau'),
         ($1, 'SansMail', null,                'import_client', 'qualifie', null,          'nouveau')`,
      [tenantId],
    );
    await sql.query(
      `insert into lead (tenant_id, company_name, email, source, qualification)
       values ($1, 'Desinscrite', 'stop@exemple.fr', 'import_client', 'qualifie')`,
      [tenantId],
    );
    await sql.query(
      "insert into suppression (tenant_id, pattern, kind) values ($1, 'stop@exemple.fr', 'desinscription')",
      [tenantId],
    );

    const gisement = new GisementDeProspects(sql);
    const eligibles = await gisement.sujetsEligibles({ tenantId, employeeId, limite: 50 });

    // Un seul prospect contactable — et le filtre est en SQL, pas après coup : entre une lecture
    // et une écriture, un prospect désinscrit redeviendrait candidat.
    expect(eligibles).toHaveLength(1);
    const [bonne] = await sql.query<{ id: string }>(
      "select id from lead where tenant_id = $1 and email = 'ok@exemple.fr'",
      [tenantId],
    );
    expect(eligibles[0]?.id).toBe(bonne?.id);
  });

  it("n'ouvre rien pour un métier sans gisement, et ne retombe pas sur celui d'un autre", async () => {
    // Un employé du support servi avec des prospects travaillerait sur des sujets qui ne le
    // concernent pas — et le ferait sans que rien ne le signale.
    const { tenantId } = await entreprise({ prospects: 5, profession: "support" });
    const rapport = await approvisionnerLeJour(deps(), new Date());

    expect(await missions(tenantId)).toBe(0);
    expect(rapport.refus["metier_sans_gisement"]).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Les six conditions de `peut_ouvrir_une_mission()` — chacune refuse seule
  // ═══════════════════════════════════════════════════════════════════════════

  it("refuse sans abonnement actif — un résilié n'a pas droit à du travail illimité", async () => {
    for (const abonnement of ["aucun", "canceled"] as const) {
      const { tenantId, employeeId } = await entreprise({ prospects: 5, abonnement });
      expect(await store.verdict(tenantId, employeeId)).toBe("pas_d_abonnement_actif");
      await approvisionnerLeJour(deps(), new Date());
      expect(await missions(tenantId)).toBe(0);
    }
  });

  it("refuse sans objectif — un employé lancé sans but travaille pour personne", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 5, objectif: "aucun" });
    expect(await store.verdict(tenantId, employeeId)).toBe("aucun_objectif");
    await approvisionnerLeJour(deps(), new Date());
    expect(await missions(tenantId)).toBe(0);
  });

  it("cesse d'ouvrir quand l'objectif est atteint — sans toucher aux missions engagées", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 5 });
    await approvisionnerLeJour(deps(), new Date());
    const engagees = await missions(tenantId);
    expect(engagees).toBe(5);

    await sql.query(
      "update objective set state = 'atteint', achieved_at = now() where tenant_id = $1",
      [tenantId],
    );
    await sql.query("delete from approvisionnement where tenant_id = $1", [tenantId]);
    await sql.query(
      `insert into lead (tenant_id, company_name, email, source, qualification)
       values ($1, 'Nouvelle', $2, 'import_client', 'qualifie')`,
      [tenantId, `apres-${randomUUID().slice(0, 8)}@exemple.fr`],
    );

    expect(await store.verdict(tenantId, employeeId)).toBe("objectif_atteint");
    await approvisionnerLeJour(deps(), new Date());

    // ⚠️ LE point produit : plus rien de NEUF, mais rien d'abandonné non plus.
    expect(await missions(tenantId)).toBe(engagees);
  });

  it("cesse d'ouvrir quand l'objectif est retiré", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 5, objectif: "retire" });
    expect(await store.verdict(tenantId, employeeId)).toBe("objectif_retire");
    await approvisionnerLeJour(deps(), new Date());
    expect(await missions(tenantId)).toBe(0);
  });

  it("refuse un employé qui n'appartient pas à cette entreprise", async () => {
    const a = await entreprise();
    const b = await entreprise();
    expect(await store.verdict(a.tenantId, b.employeeId)).toBe("employe_inconnu");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MUTATIONS — attaquer les garde-fous en contournant le code
  // ═══════════════════════════════════════════════════════════════════════════

  it("MUTATION — la base refuse deux missions sur le même sujet, même insérées à la main", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 1 });
    await approvisionnerLeJour(deps(), new Date());

    const [mission] = await sql.query<{ subject_id: string }>(
      "select subject_id from task where tenant_id = $1",
      [tenantId],
    );

    // On contourne totalement l'approvisionnement : c'est exactement ce que ferait un script de
    // reprise, ou un chemin de code qu'on n'a pas encore écrit.
    await expect(
      sql.query(
        `insert into task (tenant_id, employee_id, subject_kind, subject_id)
         values ($1, $2, 'lead', $3)`,
        [tenantId, employeeId, mission?.subject_id],
      ),
    ).rejects.toThrow();

    expect(await missions(tenantId)).toBe(1);
  });

  it("MUTATION — un battement rejoué n'ouvre rien, et un second lot du jour est refusé", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 25 });

    await approvisionnerLeJour(deps(), new Date());
    const apresLePremier = await missions(tenantId);

    // Rejeu à l'identique — le cas d'un planificateur qui déclenche deux fois.
    await approvisionnerLeJour(deps(), new Date());
    await approvisionnerLeJour(deps(), new Date());
    expect(await missions(tenantId)).toBe(apresLePremier);

    expect(await store.verdict(tenantId, employeeId)).toBe("deja_approvisionne_aujourdhui");

    // Et le lot lui-même ne peut pas être doublé, quoi qu'en pense le code appelant.
    await expect(
      sql.query(
        `insert into approvisionnement (tenant_id, employee_id, jour, ouvertes, motif)
         values ($1, $2, $3, 99, 'contournement')`,
        [tenantId, employeeId, jourUtc(new Date())],
      ),
    ).rejects.toThrow();
  });

  it("MUTATION — deux battements SIMULTANÉS n'ouvrent qu'un seul lot", async () => {
    const { tenantId } = await entreprise({ prospects: 25 });

    // Deux pools distincts : deux connexions réelles, deux transactions concurrentes. Un seul
    // client partagé sérialiserait les requêtes et le test ne prouverait rien.
    const second = createPostgresClient(connectionString as string);
    try {
      await Promise.all([
        approvisionnerLeJour(deps(sql), new Date()),
        approvisionnerLeJour(deps(second), new Date()),
      ]);
    } finally {
      await second.close();
    }

    expect(await missions(tenantId)).toBe(REGLAGES_RUNTIME_PAR_DEFAUT.missionsMaxParJour);
    const [lots] = await sql.query<{ n: string }>(
      "select count(*) as n from approvisionnement where tenant_id = $1",
      [tenantId],
    );
    expect(Number(lots?.n)).toBe(1);
  });

  it("MUTATION — le quota de la formule est refusé PAR LA BASE, pas par le code", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 0 });

    // Le plafond s'abaisse en DONNÉES — jamais par une condition sur le nom de la formule
    // (`docs/03-modele-de-donnees.md`). La valeur d'origine est remise à la fin.
    await abaisserLeQuota("start", 2);

    await sql.query(
      `insert into task (tenant_id, employee_id, subject_kind, subject_id) values
         ($1, $2, 'lead', gen_random_uuid()), ($1, $2, 'lead', gen_random_uuid())`,
      [tenantId, employeeId],
    );

    // Insertion directe, hors de tout code d'approvisionnement : c'est le déclencheur qui refuse.
    await expect(
      sql.query(
        `insert into task (tenant_id, employee_id, subject_kind, subject_id)
         values ($1, $2, 'lead', gen_random_uuid())`,
        [tenantId, employeeId],
      ),
    ).rejects.toThrow(/quota_de_periode_atteint/);

    expect(await store.verdict(tenantId, employeeId)).toBe("quota_de_periode_atteint");
    expect(await store.restantDePeriode(tenantId)).toBe(0);
  });

  it("MUTATION — le quota tient même sous des insertions concurrentes", async () => {
    // Sans le verrou consultatif du déclencheur, deux transactions lisent toutes les deux
    // « plafond − 1 » et passent toutes les deux. Vérifié en le retirant : ce test devient rouge.
    const { tenantId, employeeId } = await entreprise({ prospects: 0 });
    await abaisserLeQuota("start", 3);

    const clients = [sql, createPostgresClient(connectionString as string)];
    try {
      await Promise.allSettled(
        Array.from({ length: 8 }, (_, index) =>
          clients[index % clients.length]!.query(
            `insert into task (tenant_id, employee_id, subject_kind, subject_id)
             values ($1, $2, 'lead', gen_random_uuid())`,
            [tenantId, employeeId],
          ),
        ),
      );
    } finally {
      await clients[1]!.close();
    }

    expect(await missions(tenantId)).toBe(3);
  });

  it("MUTATION — un objectif « atteint » sans date est refusé par la base", async () => {
    const { tenantId } = await entreprise();
    await expect(
      sql.query("update objective set state = 'atteint' where tenant_id = $1", [tenantId]),
    ).rejects.toThrow();
  });

  it("MUTATION — une mission sans sujet nommé est refusée", async () => {
    const { tenantId, employeeId } = await entreprise();
    await expect(
      sql.query(
        `insert into task (tenant_id, employee_id, subject_kind, subject_id)
         values ($1, $2, '   ', gen_random_uuid())`,
        [tenantId, employeeId],
      ),
    ).rejects.toThrow();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Plusieurs employés, plusieurs entreprises
  // ═══════════════════════════════════════════════════════════════════════════

  it("ne mélange jamais deux entreprises, et compte chacune pour elle-même", async () => {
    const a = await entreprise({ prospects: 12 });
    const b = await entreprise({ prospects: 4 });

    await approvisionnerLeJour(deps(), new Date());

    expect(await missions(a.tenantId)).toBe(10);
    expect(await missions(b.tenantId)).toBe(4);

    const [croisees] = await sql.query<{ n: string }>(
      `select count(*) as n from task t join lead l on l.id = t.subject_id
        where t.tenant_id <> l.tenant_id`,
      [],
    );
    expect(Number(croisees?.n)).toBe(0);
  });

  it("donne son propre plafond à chaque employé d'une même entreprise", async () => {
    const { tenantId } = await entreprise({ tier: "growth", prospects: 25 });

    // Un second employé dans la même entreprise.
    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (profession, version, dna)
       values ('commercial', $1, '{}'::jsonb) returning id`,
      [versionUnique()],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    await sql.query(
      `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
       values ($1, $2, $3, 'confirm_once')`,
      [tenantId, definition?.id, identity?.id],
    );

    await approvisionnerLeJour(deps(), new Date());

    // Dix chacun : le plafond est PAR EMPLOYÉ. Les deux se partagent le même vivier de prospects,
    // donc les vingt-cinq disponibles suffisent aux vingt missions.
    expect(await missions(tenantId)).toBe(20);
    const [parEmploye] = await sql.query<{ n: string }>(
      `select count(distinct employee_id) as n from task where tenant_id = $1`,
      [tenantId],
    );
    expect(Number(parEmploye?.n)).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Le compte rendu
  // ═══════════════════════════════════════════════════════════════════════════

  it("rend un compte rendu qui dit pourquoi, pas seulement combien", async () => {
    await entreprise({ prospects: 0, objectif: "retire" });
    const rapport = await approvisionnerLeJour(deps(), new Date());

    expect(rapport.examines).toBeGreaterThan(0);
    expect(Object.keys(rapport.refus).length).toBeGreaterThan(0);
  });

  it("inscrit le lot du jour même quand rien n'est ouvert, avec son motif", async () => {
    const { tenantId, employeeId } = await entreprise({ prospects: 0 });
    await approvisionnerLeJour(deps(), new Date());

    const [lot] = await sql.query<{ ouvertes: number; motif: string }>(
      "select ouvertes, motif from approvisionnement where tenant_id = $1 and employee_id = $2",
      [tenantId, employeeId],
    );
    expect(lot?.ouvertes).toBe(0);
    expect(lot?.motif).toContain("Aucun sujet éligible");
  });

  it("ne règle PAS la journée sur une anomalie — elle doit rester visible au battement suivant", async () => {
    // Un métier sans gisement est une anomalie de configuration, pas une réponse métier.
    const { tenantId } = await entreprise({ prospects: 5, profession: "metier-inexistant" });
    await approvisionnerLeJour(deps(), new Date());

    const [lots] = await sql.query<{ n: string }>(
      "select count(*) as n from approvisionnement where tenant_id = $1",
      [tenantId],
    );
    expect(Number(lots?.n)).toBe(0);
  });
});

describeIfDatabase("les plafonds tiennent ensemble", () => {
  let sql: PostgresClient;

  beforeAll(() => {
    sql = createPostgresClient(connectionString as string);
  });
  afterAll(async () => {
    await sql.close();
  });

  // ⚠️ CE TEST REMPLACE UNE DÉCISION PRODUIT.
  //
  // `tasks_per_period` est un quota par ENTREPRISE ; le plafond de dix missions est par EMPLOYÉ.
  // Tant que « plafond par employé × employés autorisés × 30 jours » reste sous le quota de la
  // formule, aucune règle de répartition entre employés n'est nécessaire — le premier arrivé est
  // servi, et personne n'est privé. Le jour où ce n'est plus vrai, il FAUDRA trancher qui passe
  // en premier, et ce test devient rouge avant qu'un client ne le découvre.
  it("aucune formule ne peut être saturée par ses propres employés", async () => {
    const formules = await sql.query<{ tier: string; employes: string; taches: string }>(
      `select p.tier,
              max(case when q.metric = 'active_employees' then q.quota_limit end) as employes,
              max(case when q.metric = 'tasks_per_period' then q.quota_limit end) as taches
         from plan p join plan_quota q on q.plan_id = p.id
        where p.commercialisable
        group by p.tier`,
      [],
    );

    expect(formules.length).toBeGreaterThan(0);
    for (const formule of formules) {
      const potentiel = Number(formule.employes) * REGLAGES_RUNTIME_PAR_DEFAUT.missionsMaxParJour * 30;
      expect(
        potentiel,
        `formule « ${formule.tier} » : ${potentiel} missions possibles pour un quota de ${formule.taches}`,
      ).toBeLessThanOrEqual(Number(formule.taches));
    }
  });
});
