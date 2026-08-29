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
 * La mission `recherche` — le maillon qui manquait entre « un client neuf, aucun lead » et
 * « la première recherche s'ouvre vraiment ».
 *
 * ══ CE QUE CETTE SUITE PROUVE, ET QUE LES AUTRES NE COUVRAIENT PAS ══
 *
 * `GisementDeProspects` ne rendait jamais que des sujets `lead` : un client sans aucun prospect
 * ne voyait jamais rien s'ouvrir, et rien ne le signalait (constat P0-1 de `docs/35`). Ici, on
 * prouve la sémantique exacte validée avant l'implémentation :
 *
 *   · pas de lead éligible + aucune recherche active → une mission `recherche` s'ouvre ;
 *   · une recherche encore active (quel que soit son état non terminal) → rien ne s'ouvre ;
 *   · une recherche terminée (`done` ou `failed`) + besoin persistant → une nouvelle est permise ;
 *   · des leads éligibles existent → priorité absolue au traitement, jamais de recherche ;
 *   · deux battements simultanés → une seule recherche (le verrou de jour existant, pas un
 *     mécanisme nouveau) ;
 *   · le jour ne sert qu'à fabriquer un identifiant technique, jamais à borner « une recherche
 *     par jour » — une recherche encore active un deuxième jour reste bloquante, une recherche
 *     terminée un deuxième jour ne bloque plus rien.
 *
 * ⚠️ UN EMPLOYÉ PAR CAS, PAS UN DE PLUS. Chaque employé consomme définitivement une identité du
 * réservoir fini de `reserve_identity()` (rien ne la libère — `…120008`), partagé par TOUTE la
 * suite du worker sur une même base. Plusieurs vérifications indépendantes sont donc regroupées
 * sous un même employé quand l'ordre des écritures ne change rien au résultat, au lieu d'ouvrir un
 * employé par assertion.
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

describeIfDatabase("La mission « recherche » — d'où vient le tout premier travail", () => {
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

  /** Une entreprise commerciale minimale : abonnement actif, objectif actif, N leads qualifiés. */
  async function entreprise(
    prospects: number,
  ): Promise<{ tenantId: TenantId; employeeId: EmployeeId }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Recherche SARL"]);
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
    // Les deux natures de travail sont servies : c'est l'arbitrage entre elles qu'on éprouve ici,
    // pas le filtrage par capacité (qui a son propre cas, plus bas).
    await sql.query(
      `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
       select $1, $2, c.id, true
         from capability c
        where c.key in ('rechercher.prospect', 'qualifier.prospect')`,
      [tenantId, employee?.id],
    );

    for (let i = 0; i < prospects; i++) {
      await sql.query(
        `insert into lead (tenant_id, company_name, email, source, qualification)
         values ($1, $2, $3, 'import_client', 'qualifie')`,
        [tenantId, `Prospect ${i}`, `contact${i}-${randomUUID().slice(0, 8)}@exemple.fr`],
      );
    }

    return { tenantId: tenantId as TenantId, employeeId: employee?.id as EmployeeId };
  }

  function deps(client: PostgresClient = sql) {
    return {
      store: new PostgresApprovisionnementStore(client),
      gisements: RegistreDeGisementsEnMemoire.commercial(client),
      journal: new PostgresJournalWriter(client),
    };
  }

  async function taches(
    tenantId: TenantId,
  ): Promise<readonly { id: string; subject_kind: string; subject_id: string; state: string }[]> {
    return sql.query(
      "select id, subject_kind, subject_id, state from task where tenant_id = $1",
      [tenantId],
    );
  }

  /** Insère directement une mission `recherche`, sans passer par le gisement — pour fixer son état. */
  async function insererRecherche(
    tenantId: TenantId,
    employeeId: EmployeeId,
    state: string,
  ): Promise<string> {
    const [tache] = await sql.query<{ id: string }>(
      `insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id, state)
       select $1, $2, (select id from objective where tenant_id = $1 and state = 'actif'),
              'recherche', $3, $4
       returning id`,
      [tenantId, employeeId, randomUUID(), state],
    );
    return tache?.id as string;
  }

  async function sujets(tenantId: TenantId, employeeId: EmployeeId, jour: string) {
    const { sujets: eligibles } = await new GisementDeProspects(sql).sujetsEligibles({
      tenantId,
      employeeId,
      limite: 50,
      jour,
    });
    return eligibles;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Client neuf
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐ client neuf, 0 lead, objectif actif : la première mission ouverte est une recherche, sans référencer un lead ni un objectif", async () => {
    const { tenantId } = await entreprise(0);

    const [avant] = await sql.query<{ n: string }>(
      "select count(*) as n from task where tenant_id = $1",
      [tenantId],
    );
    expect(Number(avant?.n)).toBe(0);

    const rapport = await approvisionnerLeJour(deps(), new Date());
    expect(rapport.ouvertes).toBe(1);

    const missions = await taches(tenantId);
    expect(missions).toHaveLength(1);
    expect(missions[0]?.subject_kind).toBe("recherche");
    expect(missions[0]?.subject_id).not.toBeNull();

    // En file, comme toute mission ouverte par l'approvisionnement.
    const [enFile] = await sql.query<{ n: string }>(
      "select count(*) as n from job where tenant_id = $1",
      [tenantId],
    );
    expect(Number(enFile?.n)).toBe(1);

    // L'identifiant est une identité technique fabriquée, jamais celle d'une vraie ligne : ni un
    // lead, ni l'objectif qu'elle sert.
    const subjectId = missions[0]?.subject_id;
    const [dansLead] = await sql.query<{ n: string }>("select count(*) as n from lead where id = $1", [
      subjectId,
    ]);
    const [dansObjectif] = await sql.query<{ n: string }>(
      "select count(*) as n from objective where id = $1",
      [subjectId],
    );
    expect(Number(dansLead?.n)).toBe(0);
    expect(Number(dansObjectif?.n)).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Une recherche active bloque toute nouvelle recherche
  // ═══════════════════════════════════════════════════════════════════════════

  it("aucune deuxième recherche tant que la première est active — pending, in_progress, waiting_approval, needs_attention", async () => {
    const { tenantId, employeeId } = await entreprise(0);

    for (const state of ["pending", "in_progress", "waiting_approval", "needs_attention"]) {
      const tacheId = await insererRecherche(tenantId, employeeId, state);
      // ⚠️ Chaque état doit bloquer SEUL. Une mission de l'itération précédente encore active
      // masquerait un mauvais classement de celui-ci (par exemple « in_progress » traité comme
      // terminal par erreur) : le test resterait vert pour la mauvaise raison. D'où le nettoyage
      // avant chaque nouvel état, plutôt qu'une accumulation sur le même employé.
      expect(await sujets(tenantId, employeeId, jourUtc(new Date()))).toHaveLength(0);
      await sql.query("delete from task where id = $1", [tacheId]);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Une recherche terminée libère une nouvelle recherche si le besoin persiste
  // ═══════════════════════════════════════════════════════════════════════════

  it("besoin persistant + recherche terminée (done, puis failed) : une nouvelle recherche reste permise", async () => {
    const { tenantId, employeeId } = await entreprise(0);

    for (const state of ["done", "failed"]) {
      await insererRecherche(tenantId, employeeId, state);
      // Un état terminal, même déjà présent d'une itération précédente, ne bloque jamais : les
      // deux itérations doivent donc, l'une comme l'autre, voir la recherche proposée.
      const eligibles = await sujets(tenantId, employeeId, jourUtc(new Date()));
      expect(eligibles).toHaveLength(1);
      expect(eligibles[0]?.kind).toBe("recherche");
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. La priorité ne se discute pas : du traitement disponible gagne toujours
  // ═══════════════════════════════════════════════════════════════════════════

  it("des leads éligibles existent : le traitement passe DEVANT, sans interdire la recherche", async () => {
    // ⚠️ CE CAS A CHANGÉ DE SENS, ET C'EST LE CŒUR DU CHANTIER DE PRIORISATION.
    //
    // Il gardait auparavant une règle en dur : « s'il reste un prospect, ne cherche jamais ».
    // Elle protégeait d'un vrai défaut — chercher au lieu de traiter — mais au prix d'un autre :
    // une employée qui ne reconstitue jamais son vivier tant qu'il lui reste un seul prospect,
    // quelle que soit la configuration approuvée par le dirigeant.
    //
    // La règle est désormais un ORDRE, pas une interdiction : le traitement passe devant, et la
    // recherche garde une part. C'est ce que `prioriserLesTravaux` répartit.
    const { tenantId, employeeId } = await entreprise(2);

    const eligibles = await sujets(tenantId, employeeId, jourUtc(new Date()));

    // Le traitement d'abord — c'est l'ordre qui porte la décision.
    expect(eligibles[0]?.kind).toBe("lead");
    expect(eligibles.filter((s) => s.kind === "lead")).toHaveLength(2);
    // Et la recherche n'est plus interdite : elle attend son tour, elle n'est plus condamnée.
    expect(eligibles.filter((s) => s.kind === "recherche")).toHaveLength(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Concurrence — le verrou de jour existant, pas un mécanisme nouveau
  // ═══════════════════════════════════════════════════════════════════════════

  it("⭐ deux battements simultanés : une seule recherche ouverte", async () => {
    const { tenantId } = await entreprise(0);

    // ⚠️ `approvisionnerLeJour` examine TOUS les employés de la base, pas seulement celui de ce
    // test (comme le vrai battement) : on ne peut donc pas sommer les rapports globaux, mais
    // seulement constater ce qui a été écrit pour CE tenant. Deux connexions distinctes, comme le
    // test « MUTATION — deux battements SIMULTANÉS » déjà existant, pour de vraies transactions
    // concurrentes plutôt qu'un seul client qui les sérialiserait.
    const second = createPostgresClient(connectionString as string);
    try {
      const maintenant = new Date();
      await Promise.all([
        approvisionnerLeJour(deps(sql), maintenant),
        approvisionnerLeJour(deps(second), maintenant),
      ]);
    } finally {
      await second.close();
    }

    const missions = await taches(tenantId);
    expect(missions).toHaveLength(1);
    expect(missions[0]?.subject_kind).toBe("recherche");

    const [lots] = await sql.query<{ n: string }>(
      "select count(*) as n from approvisionnement where tenant_id = $1",
      [tenantId],
    );
    expect(Number(lots?.n)).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Jours différents — le jour est une identité technique, jamais une cadence
  // ═══════════════════════════════════════════════════════════════════════════

  it("le jour ne borne aucune cadence : encore active il bloque le lendemain, terminée elle ne bloque plus, et l'identifiant change", async () => {
    const { tenantId, employeeId } = await entreprise(0);
    const tacheId = await insererRecherche(tenantId, employeeId, "pending"); // ouverte un jour J1 quelconque

    // Encore active : un jour différent (« lendemain ») ne débloque rien.
    const jour1 = await sujets(tenantId, employeeId, "2027-01-01");
    expect(jour1).toHaveLength(0);

    // La même recherche se termine — sans succès, le besoin persiste.
    await sql.query("update task set state = 'failed' where id = $1", [tacheId]);

    // Un jour différent, la recherche redevient possible, avec un identifiant qui n'est PAS celui
    // qu'un même jour aurait donné (déterminisme par jour, jamais un identifiant fixe qui
    // condamnerait `task_sujet_unique` pour toujours face à une recherche déjà `done`/`failed`).
    const jour2a = await sujets(tenantId, employeeId, "2027-02-01");
    const jour2b = await sujets(tenantId, employeeId, "2027-02-02");
    expect(jour2a).toHaveLength(1);
    expect(jour2b).toHaveLength(1);
    expect(jour2a[0]?.id).not.toBe(jour2b[0]?.id);

    // Même jour interrogé deux fois → même identifiant (déterminisme).
    const jour2aBis = await sujets(tenantId, employeeId, "2027-02-01");
    expect(jour2aBis[0]?.id).toBe(jour2a[0]?.id);
  });
});
