import { randomUUID } from "node:crypto";

import type { EmployeeId, TenantId } from "@sentio/domain";
import { PostgresJournalWriter, reevaluerLesEmployes } from "@sentio/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * LADY-U — la boucle se referme, et elle s'arrête AVANT d'appliquer.
 *
 * ⚠️ Pourquoi contre un vrai Postgres. Ce qui est éprouvé ici n'est pas la logique de décision —
 * elle est unitaire, dans `packages/domain/src/reevaluation.test.ts`. C'est la **chaîne
 * complète** : des événements d'exécution réels comptés par `mesures_du_travail`, un diagnostic,
 * une composition, et une version publiée que la base garde inactive. Un double de base
 * confirmerait n'importe quoi.
 *
 * Le cas ⭐⭐ est le seul qui compte vraiment : après une réévaluation, **la configuration active
 * n'a pas bougé**. C'est §10 de la vision, et c'est ce qui sépare un employé configurable d'un
 * produit qui se réécrit tout seul pendant que son client dort.
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

describeIfDatabase("LADY-U — les résultats proposent, ils n'appliquent pas", () => {
  let sql: PostgresClient;
  let journal: PostgresJournalWriter;
  const tenants: string[] = [];

  beforeAll(() => {
    sql = createPostgresClient(connectionString as string);
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
   * Une entreprise dont le travail a **déjà produit des résultats mesurables** : un objectif posé
   * il y a 15 jours sur un horizon de 30, des missions réellement travaillées, et les issues que
   * le cas veut éprouver.
   */
  async function entrepriseEnCours(options: {
    missions: number;
    reponses: number;
    ventes: number;
  }): Promise<{ tenantId: TenantId; employeeId: EmployeeId; configuration: string }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);

    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Entreprise LADY-U"]);
    await sql.query(
      `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
       select $1, p.id, 'active', now() - interval '1 day', now() + interval '29 days'
         from plan p where p.tier = 'start'`,
      [tenantId],
    );

    // À mi-parcours : assez écoulé pour qu'un retard veuille dire quelque chose.
    const [objectif] = await sql.query<{ id: string }>(
      `insert into objective (tenant_id, metric, target_value, horizon, horizon_jours, created_at)
       values ($1, 'chiffre_affaires', 10000, 'par mois', 30, now() - interval '15 days')
       returning id`,
      [tenantId],
    );

    const [definition] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, '{}'::jsonb,
               '["relancer.prospect","qualifier.prospect","rechercher.prospect","envoyer.prospect"]'::jsonb)
       returning id`,
      [versionUnique()],
    );
    const [identity] = await sql.query<{ id: string }>("select * from reserve_identity($1)", [
      "commercial",
    ]);
    const [employee] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id, autonomy)
       values ($1, $2, $3, 'confirm') returning id`,
      [tenantId, definition?.id, identity?.id],
    );
    const employeeId = employee?.id as string;

    // La v1, telle qu'un recrutement l'aurait posée : Lady prospecte.
    const [configuration] = await sql.query<{ id: string }>(
      `insert into lady_configuration
         (tenant_id, employee_id, version, role, priorites, limites, autonomie, declencheur,
          raison, active)
       values ($1, $2, 1, 'prospection', '["approcher plus d''entreprises"]'::jsonb, '[]'::jsonb,
               'confirm', 'recrutement',
               'Au recrutement, le frein déclaré était le manque d''entreprises approchées.', true)
       returning id`,
      [tenantId, employeeId],
    );
    await sql.query(
      `insert into lady_configuration_capability (configuration_id, capability_id)
       select $1, c.id from capability c where c.key = 'relancer.prospect'`,
      [configuration?.id],
    );

    for (let i = 0; i < options.missions; i++) {
      const [task] = await sql.query<{ id: string }>(
        `insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
         values ($1, $2, $3, 'lead', $4) returning id`,
        [tenantId, employeeId, objectif?.id, randomUUID()],
      );
      // Une mission « agie » : une action a réellement été exécutée pour elle.
      await sql.query(
        `insert into execution_event (tenant_id, employee_id, task_id, kind, payload)
         values ($1, $2, $3, 'action_executee', '{}'::jsonb)`,
        [tenantId, employeeId, task?.id],
      );

      if (i < options.reponses) {
        await sql.query(
          `insert into outcome (tenant_id, task_id, kind, declared_by) values ($1, $2, 'response', 'client')`,
          [tenantId, task?.id],
        );
      }
      if (i < options.ventes) {
        await sql.query(
          `insert into outcome (tenant_id, task_id, kind, value, declared_by)
           values ($1, $2, 'sale', 500, 'client')`,
          [tenantId, task?.id],
        );
      }
    }

    return {
      tenantId: tenantId as TenantId,
      employeeId: employeeId as EmployeeId,
      configuration: configuration?.id as string,
    };
  }

  const active = async (tenantId: TenantId) =>
    (
      await sql.query<{ id: string; role: string }>(
        "select id, role from lady_configuration where tenant_id = $1 and active",
        [tenantId],
      )
    )[0];

  const enAttente = async (tenantId: TenantId) =>
    (
      await sql.query<{ id: string; role: string; declencheur: string; raison: string }>(
        `select id, role, declencheur, raison from lady_configuration
          where tenant_id = $1 and not active and refusee_le is null`,
        [tenantId],
      )
    )[0];

  it("⭐⭐ propose une version suivante SANS toucher à celle qui s'applique", async () => {
    // Des réponses arrivent, aucune ne se transforme : la mesure dit que c'est le ciblage.
    const { tenantId, configuration } = await entrepriseEnCours({
      missions: 30,
      reponses: 12,
      ventes: 0,
    });

    // ⚠️ On ne compte pas les propositions du rapport : d'autres entreprises peuvent vivre dans
    // la même base d'essai, et un compte global rendrait ce test dépendant de ses voisins.
    await reevaluerLesEmployes({ sql, journal }, new Date());

    const enPlace = await active(tenantId);
    expect(enPlace?.id).toBe(configuration);
    expect(enPlace?.role).toBe("prospection");

    const proposition = await enAttente(tenantId);
    expect(proposition).toBeDefined();
    expect(proposition?.declencheur).toBe("resultats");
    // La raison part de ce qui a été MESURÉ : c'est ce que le dirigeant doit pouvoir vérifier.
    expect(proposition?.raison.length).toBeGreaterThan(0);

    // Et le dirigeant est prévenu qu'on lui DEMANDE quelque chose — pas qu'on a changé.
    const [notif] = await sql.query<{ kind: string }>(
      "select kind from notification where tenant_id = $1 order by created_at desc limit 1",
      [tenantId],
    );
    expect(notif?.kind).toBe("proposition");
  });

  it("⭐ se tait quand le travail n'a pas encore produit de signal", async () => {
    // Trois missions travaillées : trop peu pour que le moindre taux veuille dire quelque chose.
    const { tenantId } = await entrepriseEnCours({ missions: 3, reponses: 0, ventes: 0 });

    const rapport = await reevaluerLesEmployes({ sql, journal }, new Date());

    expect(rapport.silences["signal_trop_faible"]).toBeGreaterThanOrEqual(1);
    expect(await enAttente(tenantId)).toBeUndefined();
  });

  it("⭐ ne relit pas les résultats deux fois dans la même journée", async () => {
    // Sans cette garde, un battement toutes les cinq minutes noierait le journal sous des
    // centaines de « rien à dire » — et ce qui compte deviendrait introuvable.
    const { tenantId } = await entrepriseEnCours({ missions: 30, reponses: 12, ventes: 0 });

    const jour = new Date();
    await reevaluerLesEmployes({ sql, journal }, jour);
    await reevaluerLesEmployes({ sql, journal }, jour);

    // Une seule trace pour CETTE entreprise, quoi qu'il arrive chez les voisines.
    const [trace] = await sql.query<{ n: string }>(
      `select count(*) as n from execution_event
        where tenant_id = $1 and kind in ('reevaluation_proposee', 'reevaluation_sans_suite')`,
      [tenantId],
    );
    expect(Number(trace?.n)).toBe(1);
  });

  /**
   * ⚠️ LA GARDE DOIT TENIR À TOUTE HEURE, PAS SEULEMENT EN JOURNÉE.
   *
   * Le jour de référence est calculé par Node, en UTC ; la fenêtre était bornée en base par
   * « ($jour::date)::timestamptz », qui interprète cette date dans le fuseau de la SESSION
   * Postgres. Les deux ne coïncident que si la session est en UTC.
   *
   * Le défaut se voyait donc entre minuit et 2 h locales sur un serveur en Europe/Paris, et
   * nulle part le reste du temps : le test précédent passait tout le jour et échouait la nuit.
   * Un test qui dépend de l'heure à laquelle on le lance ne prouve rien.
   *
   * Celui-ci force les deux fuseaux les plus éloignés d'UTC qui existent, UTC+14 et UTC-12. Quelle
   * que soit l'heure, **l'un des deux** décale la fenêtre au point d'en faire sortir l'événement
   * qu'on vient d'écrire. Avec le cast corrigé, aucun des deux ne bouge quoi que ce soit.
   */
  it("⭐ la garde du jour ne dépend pas du fuseau du serveur", async () => {
    for (const fuseau of ["Etc/GMT-14", "Etc/GMT+12"]) {
      const { tenantId } = await entrepriseEnCours({ missions: 30, reponses: 12, ventes: 0 });
      await sql.query(`set time zone '${fuseau}'`, []);
      try {
        const jour = new Date();
        await reevaluerLesEmployes({ sql, journal }, jour);
        await reevaluerLesEmployes({ sql, journal }, jour);

        const [trace] = await sql.query<{ n: string }>(
          `select count(*) as n from execution_event
            where tenant_id = $1 and kind in ('reevaluation_proposee', 'reevaluation_sans_suite')`,
          [tenantId],
        );
        expect(Number(trace?.n), `fuseau ${fuseau}`).toBe(1);
      } finally {
        await sql.query("set time zone 'UTC'", []);
      }
    }
  });

  it("⭐ l'accord du dirigeant, et alors seulement, applique la version", async () => {
    const { tenantId, employeeId } = await entrepriseEnCours({
      missions: 30,
      reponses: 12,
      ventes: 0,
    });

    await reevaluerLesEmployes({ sql, journal }, new Date());
    const proposition = await enAttente(tenantId);

    await sql.query("select accepter_la_configuration($1, $2)", [tenantId, proposition?.id]);

    expect((await active(tenantId))?.id).toBe(proposition?.id);

    // Les pouvoirs de l'employé suivent la version acceptée — pas une colonne réglée à côté.
    const [employe] = await sql.query<{ autonomy: string }>(
      "select autonomy from employee where id = $1",
      [employeeId],
    );
    const [conf] = await sql.query<{ autonomie: string }>(
      "select autonomie from lady_configuration where id = $1",
      [proposition?.id],
    );
    expect(employe?.autonomy).toBe(conf?.autonomie);

    // Et l'évolution n'est annoncée qu'ici, adossée à son changement enregistré.
    const [annonce] = await sql.query<{ kind: string; strategy_change_id: string | null }>(
      `select kind, strategy_change_id from notification
        where tenant_id = $1 and kind = 'evolution'`,
      [tenantId],
    );
    expect(annonce?.strategy_change_id).not.toBeNull();
  });
});
