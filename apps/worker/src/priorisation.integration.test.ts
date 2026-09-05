import { randomUUID } from "node:crypto";

import type { EmployeeId, TenantId } from "@sentio/domain";
import {
  GisementDeProspects,
  PostgresApprovisionnementStore,
  PostgresJournalWriter,
  RegistreDeGisementsEnMemoire,
  approvisionnerLeJour,
  jourUtc,
} from "@sentio/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * Lady décide de son travail — contre une vraie base.
 *
 * ══ CE QUE CE FICHIER PROUVE, ET QU'AUCUN AUTRE NE POUVAIT PROUVER ══
 *
 * `priorisation.test.ts` (`@sentio/core`) éprouve la formule sur des entrées fabriquées : c'est là
 * que vivent les bornes et le déterminisme. Ce fichier-ci éprouve autre chose, et de plus décisif :
 * que la chaîne **configuration approuvée → priorités écrites en base → travail réellement ouvert**
 * tient de bout en bout. Un double la confirmerait toujours ; seule la base peut dire si les
 * phrases écrites par `composer()` se relisent, et si un travail sans capacité est bien écarté.
 *
 * ⚠️ Deux natures de travail seulement (`lead`, `recherche`) : les deux réellement ouvrables
 * aujourd'hui. Rien ici ne repose sur un couple hypothétique.
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

/** Les phrases exactes de `PRIORITE_PAR_DOMAINE` — celles qu'un vrai `composer()` écrirait. */
const PRIORITE_RECHERCHE = "élargir le nombre d'entreprises approchées";
const PRIORITE_EVALUATION = "n'engager la conversation qu'avec les entreprises qui correspondent";

describeIfDatabase("Lady décide de son travail", () => {
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

  /**
   * Une entreprise dont la configuration est réellement publiée et active.
   *
   * ⚠️ On écrit une vraie `lady_configuration`, pas un raccourci : c'est précisément le champ
   * gouverné dont on veut prouver qu'il pilote le comportement.
   */
  async function entreprise(options: {
    prospects: number;
    priorites: readonly string[];
    capacites: readonly string[];
  }): Promise<{ tenantId: TenantId; employeeId: EmployeeId }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Décision SARL"]);
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

    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, '{}'::jsonb, '["rechercher.prospect","qualifier.prospect"]'::jsonb)
       returning id`,
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
    const employeeId = employee?.id as EmployeeId;

    await sql.query(
      `insert into lady_configuration
         (tenant_id, employee_id, version, role, priorites, limites, autonomie, declencheur, raison)
       values ($1, $2, 1, 'prospection', $3::jsonb, '[]'::jsonb, 'confirm', 'recrutement',
               'Configuration d''essai pour la priorisation.')`,
      [tenantId, employeeId, JSON.stringify(options.priorites)],
    );
    await sql.query(
      `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
       select $1, $2, c.id, true from capability c where c.key = any($3)`,
      [tenantId, employeeId, options.capacites],
    );

    for (let i = 0; i < options.prospects; i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Prospect ${i}`, `p${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }

    return { tenantId: tenantId as TenantId, employeeId };
  }

  async function eligibles(tenantId: TenantId, employeeId: EmployeeId, limite = 10) {
    return new GisementDeProspects(sql).sujetsEligibles({
      tenantId,
      employeeId,
      limite,
      jour: jourUtc(new Date()),
    });
  }

  function compter(sujets: readonly { kind: string }[], kind: string): number {
    return sujets.filter((sujet) => sujet.kind === kind).length;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. La configuration approuvée change réellement le travail ouvert
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐⭐ deux configurations opposées produisent deux ordres de travail opposés", async () => {
    // ⚠️ LE TEST QUI DIT SI LE CHANTIER A ATTEINT SON BUT, sur la vraie chaîne.
    //
    // Avant, ces deux entreprises recevaient rigoureusement le même travail : `priorites` était
    // affiché au dirigeant, lu par le modèle, et ignoré par tout ce qui décide. Le champ existait
    // sans rien piloter — un réglage qui ne réglait rien.
    const capacites = ["rechercher.prospect", "qualifier.prospect"];
    const traiteDAbord = await entreprise({
      prospects: 8,
      priorites: [PRIORITE_EVALUATION, PRIORITE_RECHERCHE],
      capacites,
    });
    const chercheDAbord = await entreprise({
      prospects: 8,
      priorites: [PRIORITE_RECHERCHE, PRIORITE_EVALUATION],
      capacites,
    });

    const a = await eligibles(traiteDAbord.tenantId, traiteDAbord.employeeId);
    const b = await eligibles(chercheDAbord.tenantId, chercheDAbord.employeeId);

    expect(a.sujets[0]?.kind).toBe("lead");
    expect(b.sujets[0]?.kind).toBe("recherche");

    // ⚠️ Et quand le budget ne suffit QUE pour un seul travail, c'est bien la configuration qui
    // décide lequel. À budget large, les deux entreprises ouvrent la même chose — le budget non
    // consommé est rendu, jamais perdu (une seule recherche est ouvrable à la fois) : la priorité
    // se lit alors dans l'ordre, pas dans les comptes. C'est sur un budget contraint que le
    // partage devient visible, et c'est le cas qui compte pour un client aux quotas serrés.
    const aContraint = await eligibles(traiteDAbord.tenantId, traiteDAbord.employeeId, 1);
    const bContraint = await eligibles(chercheDAbord.tenantId, chercheDAbord.employeeId, 1);

    expect(compter(aContraint.sujets, "lead")).toBe(1);
    expect(compter(aContraint.sujets, "recherche")).toBe(0);
    expect(compter(bContraint.sujets, "recherche")).toBe(1);
    expect(compter(bContraint.sujets, "lead")).toBe(0);
  });

  it("le rang retenu est celui de la configuration, et il se relit dans la justification", async () => {
    const { tenantId, employeeId } = await entreprise({
      prospects: 3,
      priorites: [PRIORITE_RECHERCHE, PRIORITE_EVALUATION],
      capacites: ["rechercher.prospect", "qualifier.prospect"],
    });

    const { justification } = await eligibles(tenantId, employeeId);
    const recherche = justification?.parts.find((part) => part.kind === "recherche");
    const lead = justification?.parts.find((part) => part.kind === "lead");

    expect(recherche?.rang).toBe(0);
    expect(recherche?.couple).toEqual({ domaine: "recherche_selection", objet: "prospect" });
    expect(lead?.rang).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Une capacité retirée retire le travail — pas seulement sa priorité
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐ un travail qu'aucune capacité activée ne sert est ÉCARTÉ, quel que soit son rang", async () => {
    // La recherche est la priorité n°1 du dirigeant — mais la capacité n'est pas activée. Ouvrir
    // la mission quand même consommerait un créneau pour produire un échec certain.
    const { tenantId, employeeId } = await entreprise({
      prospects: 5,
      priorites: [PRIORITE_RECHERCHE, PRIORITE_EVALUATION],
      capacites: ["qualifier.prospect"],
    });

    const { sujets, justification } = await eligibles(tenantId, employeeId);

    expect(compter(sujets, "recherche")).toBe(0);
    expect(compter(sujets, "lead")).toBe(5);
    expect(justification?.ecartes).toEqual([
      {
        kind: "recherche",
        couples: [{ domaine: "recherche_selection", objet: "prospect" }],
        raison: "aucune_capacite_active",
      },
    ]);
  });

  it("⭐ une capacité DÉSACTIVÉE écarte son travail aussi sûrement qu'une capacité absente", async () => {
    // `enabled = false` est le geste du dirigeant qui retire un pouvoir sans le supprimer. Le
    // lire comme « présente » rendrait ce geste sans effet, en silence.
    const { tenantId, employeeId } = await entreprise({
      prospects: 5,
      priorites: [PRIORITE_RECHERCHE, PRIORITE_EVALUATION],
      capacites: ["rechercher.prospect", "qualifier.prospect"],
    });

    const avant = await eligibles(tenantId, employeeId);
    expect(compter(avant.sujets, "recherche")).toBe(1);

    await sql.query(
      `update employee_capability set enabled = false
        where tenant_id = $1 and employee_id = $2
          and capability_id = (select id from capability where key = 'rechercher.prospect')`,
      [tenantId, employeeId],
    );

    const apres = await eligibles(tenantId, employeeId);
    expect(compter(apres.sujets, "recherche")).toBe(0);
    expect(apres.justification?.ecartes.map((e) => e.kind)).toEqual(["recherche"]);
  });

  it("aucune capacité activée : rien n'est ouvert, et les DEUX manques sont journalisés", async () => {
    const { tenantId, employeeId } = await entreprise({
      prospects: 5,
      priorites: [PRIORITE_EVALUATION],
      capacites: [],
    });

    const { sujets, justification } = await eligibles(tenantId, employeeId);

    expect(sujets).toEqual([]);
    // ⚠️ La trace des deux travaux écartés est la matière première d'un futur « il me manque un
    // outil » : sans elle, un employé sans capacité serait indistinguable d'un employé sans travail.
    expect(justification?.ecartes.map((e) => e.kind).sort()).toEqual(["lead", "recherche"]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. La décision est journalisée — elle doit se relire des mois plus tard
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐ le journal garde POURQUOI ce travail a été choisi, pas seulement lequel", async () => {
    const { tenantId } = await entreprise({
      prospects: 4,
      priorites: [PRIORITE_EVALUATION, PRIORITE_RECHERCHE],
      capacites: ["rechercher.prospect", "qualifier.prospect"],
    });

    await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
        journal: new PostgresJournalWriter(sql),
      },
      new Date(),
    );

    const [evenement] = await sql.query<{ payload: Record<string, unknown> }>(
      `select payload from execution_event
        where tenant_id = $1 and kind = 'approvisionnement_ouverture'
        order by seq desc limit 1`,
      [tenantId],
    );

    const priorisation = evenement?.payload["priorisation"] as
      | { parts: { kind: string; rang: number | null; score: number; creneaux: number }[] }
      | undefined;

    expect(priorisation).toBeDefined();
    // Chaque facteur reste lisible séparément : un score agrégé dirait « lead a gagné » sans dire
    // si c'est le dirigeant qui l'a voulu ou le retard qui l'a imposé.
    const lead = priorisation?.parts.find((part) => part.kind === "lead");
    expect(lead?.rang).toBe(0);
    expect(lead?.creneaux).toBeGreaterThan(0);
    expect(typeof lead?.score).toBe("number");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Déterminisme sur la vraie chaîne
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐ deux lectures du même état rendent exactement la même décision", async () => {
    // Sans cette garantie, « pourquoi Lady a-t-elle travaillé ceci ? » n'aurait pas de réponse
    // vérifiable : deux battements sur le même état pourraient ouvrir des missions différentes.
    const { tenantId, employeeId } = await entreprise({
      prospects: 6,
      priorites: [PRIORITE_EVALUATION, PRIORITE_RECHERCHE],
      capacites: ["rechercher.prospect", "qualifier.prospect"],
    });

    const premier = await eligibles(tenantId, employeeId);
    for (let i = 0; i < 5; i += 1) {
      expect(await eligibles(tenantId, employeeId)).toEqual(premier);
    }
  });

  it("une configuration sans priorités n'empêche rien : les deux travaux restent ouvrables", async () => {
    // Poids plancher pour les deux, jamais zéro — sinon un employé dont la configuration ne cite
    // aucun domaine ne travaillerait jamais.
    const { tenantId, employeeId } = await entreprise({
      prospects: 4,
      priorites: [],
      capacites: ["rechercher.prospect", "qualifier.prospect"],
    });

    const { sujets, justification } = await eligibles(tenantId, employeeId);

    expect(sujets.length).toBeGreaterThan(0);
    for (const part of justification?.parts ?? []) {
      expect(part.rang).toBeNull();
      expect(part.poidsConfiguration).toBeGreaterThan(0);
    }
  });
});
