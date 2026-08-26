/**
 * L'approvisionnement, branché sur Postgres.
 *
 * `@sentio/core` déclare les ports ; il ignore qu'un sujet de mission est une ligne de `lead` et
 * qu'un verdict est une fonction PL/pgSQL. C'est ici, et ici seulement, que les deux se
 * rencontrent.
 *
 * ══ CE QUI N'EST PAS RECALCULÉ ICI ══
 *
 * Ni le verdict, ni le reste de quota. Les deux viennent de la base
 * (`peut_ouvrir_une_mission`, `missions_restantes_sur_la_periode`), qui seule peut les établir
 * sans course. Les recalculer en TypeScript tiendrait deux vérités pour un même plafond — et un
 * jour deux réponses différentes, la pire des deux gagnant au moment le plus coûteux.
 *
 * Réalise : EXEC-17
 */

import {
  choisirLesVariantes,
  empreinteStable,
  type ApprovisionnementStore,
  type GisementDeMissions,
  type RegistreDeGisements,
} from "@sentio/core";
import type { SqlClient, TransactionalSqlClient } from "@sentio/db";
import { effortRequis, PART_D_EXPLORATION } from "@sentio/domain";
import type { EmployeeId, TenantId } from "@sentio/domain";

/**
 * Le gisement du métier Commercial : les prospects que cet employé n'a pas encore pris en charge.
 *
 * ⚠️ Ce qui est filtré **en SQL**, et pourquoi pas en TypeScript : un prospect exclu, désinscrit,
 * ou déjà confié à une mission ne doit pas remonter du tout. Le filtrer après coup laisserait,
 * entre la lecture et l'écriture, une fenêtre où il redevient candidat.
 *
 * L'ordre est `created_at, id` — total et stable. Sans le départage par identifiant, deux
 * prospects importés dans la même transaction partagent `created_at` (le même piège qu'EXEC-02
 * sur le journal), et deux battements ouvriraient des missions différentes.
 */
export class GisementDeProspects implements GisementDeMissions {
  readonly nature = "lead";

  constructor(private readonly sql: SqlClient) {}

  async sujetsEligibles(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    limite: number;
  }): Promise<readonly { kind: string; id: string }[]> {
    const rows = await this.sql.query<{ id: string }>(
      `select l.id
         from lead l
        where l.tenant_id = $1
          and l.status <> 'exclu'
          and l.qualification <> 'ecarte'
          and l.email is not null
          -- Déjà confié à une mission de CET employé : il n'y a rien de neuf à ouvrir.
          and not exists (
            select 1 from task t
             where t.tenant_id = l.tenant_id
               and t.employee_id = $2
               and t.subject_kind = 'lead'
               and t.subject_id = l.id
          )
          -- Sur liste d'exclusion ou désinscrit : la garde d'envoi le refuserait de toute façon,
          -- mais ouvrir la mission aurait déjà coûté un cycle pour rien.
          and not exists (
            select 1 from suppression s
             where s.tenant_id = l.tenant_id
               and (lower(s.pattern) = lower(l.email)
                 or (s.pattern like '@%' and lower(l.email) like '%' || lower(s.pattern)))
          )
        order by l.created_at, l.id
        limit $3`,
      [input.tenantId, input.employeeId, input.limite],
    );
    return rows.map((row) => ({ kind: this.nature, id: row.id }));
  }
}

/**
 * Quel gisement pour quel métier.
 *
 * Un métier inconnu rend `null`, jamais le gisement d'un autre : un employé du support qui se
 * verrait servir des prospects travaillerait sur des sujets qui ne le concernent pas, et le
 * ferait sans que rien ne le signale.
 */
export class RegistreDeGisementsEnMemoire implements RegistreDeGisements {
  constructor(private readonly gisements: ReadonlyMap<string, GisementDeMissions>) {}

  static commercial(sql: SqlClient): RegistreDeGisementsEnMemoire {
    return new RegistreDeGisementsEnMemoire(new Map([["commercial", new GisementDeProspects(sql)]]));
  }

  pour(gisement: string): GisementDeMissions | null {
    return this.gisements.get(gisement) ?? null;
  }
}

export class PostgresApprovisionnementStore implements ApprovisionnementStore {
  constructor(private readonly sql: TransactionalSqlClient) {}

  /**
   * Tous les employés recrutés, avec leur métier.
   *
   * Aucun filtre sur l'abonnement ni sur l'objectif ici : c'est `peut_ouvrir_une_mission()` qui
   * tranche, et lui seul. Filtrer aux deux endroits ferait diverger deux règles pour une même
   * question — et masquerait la raison réelle du refus, qui est précisément ce qu'on veut lire.
   */
  async employesAExaminer(): Promise<
    readonly { tenantId: TenantId; employeeId: EmployeeId; gisement: string }[]
  > {
    const rows = await this.sql.query<{
      tenant_id: string;
      employee_id: string;
      gisement: string;
    }>(
      `select e.tenant_id, e.id as employee_id, d.gisement
         from employee e
         join employee_definition d on d.id = e.employee_definition_id
        order by e.tenant_id, e.id`,
      [],
    );
    return rows.map((row) => ({
      tenantId: row.tenant_id as TenantId,
      employeeId: row.employee_id as EmployeeId,
      gisement: row.gisement,
    }));
  }

  async verdict(tenantId: TenantId, employeeId: EmployeeId): Promise<string> {
    const rows = await this.sql.query<{ verdict: string }>(
      "select peut_ouvrir_une_mission($1, $2) as verdict",
      [tenantId, employeeId],
    );
    const verdict = rows[0]?.verdict;
    if (verdict === undefined) {
      // La fonction rend toujours un texte. Une absence signalerait un schéma incomplet — on ne
      // la traduit pas en « ok » par défaut.
      throw new Error("peut_ouvrir_une_mission n'a rien rendu : le schéma est incomplet.");
    }
    return verdict;
  }

  /**
   * Le rythme que la cible du dirigeant exige par jour ouvré.
   *
   * ⚠️ Rien n'est deviné. Le panier moyen et le taux de conversion sont des **déclarations du
   * client**, rangées dans son profil d'entreprise ; absents, on rend `null` et la cadence
   * retombe sur les bornes de la formule. Les supposer dimensionnerait un employé sur une
   * entreprise imaginaire — trop peu de travail, et le client n'atteint rien ; trop, et on brûle
   * sa réputation.
   */
  async rythmeVoulu(tenantId: TenantId): Promise<number | null> {
    const [ligne] = await this.sql.query<{
      metric: string;
      target_value: string;
      horizon_jours: number;
      panier: string | null;
      taux: string | null;
    }>(
      `select o.metric, o.target_value, o.horizon_jours,
              (select p.value #>> '{}' from company_profile p
                where p.tenant_id = o.tenant_id and p.key = 'panier_moyen'
                  and p.status = 'actif' limit 1) as panier,
              (select p.value #>> '{}' from company_profile p
                where p.tenant_id = o.tenant_id and p.key = 'taux_de_conversion'
                  and p.status = 'actif' limit 1) as taux
         from objective o
        where o.tenant_id = $1 and o.state = 'actif'
        limit 1`,
      [tenantId],
    );

    if (ligne === undefined) return null;

    const effort = effortRequis({
      metrique: ligne.metric,
      cible: Number(ligne.target_value),
      hypotheses: {
        panierMoyen: ligne.panier === null ? null : Number(ligne.panier),
        tauxDeConversion: ligne.taux === null ? null : Number(ligne.taux),
      },
      // Les jours ouvrés de l'horizon, pas les jours calendaires : Lady ne travaille pas le
      // dimanche parce que personne ne lit ses messages le dimanche.
      joursOuvres: Math.max(1, Math.round((ligne.horizon_jours * 5) / 7)),
    });

    return effort.statut === "calcule" ? effort.parJourOuvre : null;
  }

  async restantDePeriode(tenantId: TenantId): Promise<number | null> {
    const rows = await this.sql.query<{ restant: number | null }>(
      "select missions_restantes_sur_la_periode($1) as restant",
      [tenantId],
    );
    const restant = rows[0]?.restant;
    return restant === undefined || restant === null ? null : Number(restant);
  }

  /**
   * Ouvre les missions et enregistre le lot du jour, **dans une seule transaction**.
   *
   * L'ordre à l'intérieur n'est pas indifférent : le lot du jour est écrit **en premier**. Sa clé
   * primaire `(tenant_id, employee_id, jour)` est ce qui tranche la course entre deux battements
   * simultanés — celui qui perd n'ouvre rien du tout, au lieu d'ouvrir un second lot de missions.
   *
   * Chaque mission entre avec `on conflict do nothing` : un sujet déjà pris en charge est refusé
   * par l'index unique, et c'est un **résultat normal**, pas une erreur. Le compte rendu porte
   * donc le nombre réellement ouvert, jamais le nombre demandé.
   */
  async ouvrirLesMissions(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    jour: string;
    sujets: readonly { kind: string; id: string }[];
    motif: string;
  }): Promise<number | null> {
    return this.sql.withTransaction(async (tx) => {
      const lot = await tx.query<{ jour: string }>(
        `insert into approvisionnement (tenant_id, employee_id, jour, ouvertes, motif)
         values ($1, $2, $3, 0, $4)
         on conflict (tenant_id, employee_id, jour) do nothing
         returning jour`,
        [input.tenantId, input.employeeId, input.jour, input.motif],
      );
      // Un autre battement a déjà ouvert le travail du jour. On ne touche à rien.
      if (lot.length === 0) return null;

      const natures = input.sujets.map((sujet) => sujet.kind);
      const identifiants = input.sujets.map((sujet) => sujet.id);

      const creees = await tx.query<{ id: string }>(
        // L'objectif servi est écrit AVEC la mission, dans la même transaction. Il n'est pas
        // choisi ici : une entreprise n'a qu'un objectif actif (`20260815120002`), donc la
        // sous-requête en rend un ou aucun. Aucun n'est censé arriver —
        // `peut_ouvrir_une_mission()` a déjà refusé plus haut — et si cela arrivait, la
        // contrainte `not null` fait échouer l'ouverture plutôt que d'ouvrir du travail
        // rattaché à rien.
        `insert into task (tenant_id, employee_id, objective_id, subject_kind, subject_id, state)
         select $1, $2,
                (select o.id from objective o where o.tenant_id = $1 and o.state = 'actif'),
                s.kind, s.id, 'pending'
           from unnest($3::text[], $4::uuid[]) as s(kind, id)
         on conflict (tenant_id, employee_id, subject_kind, subject_id) do nothing
         returning id`,
        [input.tenantId, input.employeeId, natures, identifiants],
      );

      if (creees.length > 0) {
        // ── La FAÇON de travailler chaque mission, tirée au moment où elle s'ouvre.
        //
        // ⚠️ Ici, et pas au premier pas : le choix est dérivé de l'identifiant de la mission
        // (`choisirLesVariantes`), donc il faut que la mission existe — et l'écrire dans la même
        // transaction garantit qu'aucune mission ne tourne sans qu'on sache ce qu'elle a joué.
        // Une mission jouée dont la variante n'est pas tracée est une mesure perdue : `outcome`
        // la comptera pour personne.
        await this.attribuerLesVariantes(tx, input.tenantId, creees.map((row) => row.id));

        // La priorité vient de la formule, en données — jamais d'une condition sur son nom
        // (`FOND-17`, et la promesse « priorité d'exécution » des formules supérieures).
        await tx.query(
          `insert into job (tenant_id, task_id, priority)
           select $1, t.id, coalesce(
                    (select p.job_priority
                       from subscription sub
                       join plan p on p.id = sub.plan_id
                      where sub.tenant_id = $1 and sub.status = 'active'
                      limit 1), 0)
             from unnest($2::uuid[]) as t(id)`,
          [input.tenantId, creees.map((row) => row.id)],
        );
      }

      await tx.query(
        `update approvisionnement set ouvertes = $4
          where tenant_id = $1 and employee_id = $2 and jour = $3`,
        [input.tenantId, input.employeeId, input.jour, creees.length],
      );

      return creees.length;
    });
  }

  /**
   * Attribue à chaque mission au plus une variante par genre.
   *
   * Les variantes sont **globales** (`docs/adr/0011`) : elles sont rédigées par Sentio et ne
   * dérivent d'aucune donnée client. La répartition, elle, est déterministe — la même mission
   * donne toujours la même variante, y compris après un rejeu. Un tirage au sort rendrait le
   * produit inexplicable : « pourquoi mon employé a-t-il écrit comme ça ? » n'aurait pas de
   * réponse.
   */
  private async attribuerLesVariantes(
    tx: SqlClient,
    tenantId: TenantId,
    missions: readonly string[],
  ): Promise<void> {
    const lignes = await tx.query<{
      id: string;
      kind: string;
      key: string;
      actif: boolean;
      par_defaut: boolean;
    }>(
      `select v.id, v.kind, v.key, v.actif, v.par_defaut
         from strategy_variant v
        where v.actif
          and v.profession = (
            select d.gisement from employee e
              join employee_definition d on d.id = e.employee_definition_id
             where e.tenant_id = $1 limit 1)
        order by v.kind, v.key`,
      [tenantId],
    );

    if (lignes.length === 0) return;

    const variantes = lignes.map((ligne) => ({
      id: ligne.id,
      kind: ligne.kind,
      key: ligne.key,
      actif: ligne.actif,
      parDefaut: ligne.par_defaut,
    }));

    // Ce qui a déjà gagné chez CETTE entreprise (EVOL-04). Vide au début : rien n'a été mesuré.
    const preferences = new Map(
      (
        await tx.query<{ kind: string; variant_id: string }>(
          "select kind, variant_id from tenant_variant_preference where tenant_id = $1",
          [tenantId],
        )
      ).map((ligne) => [ligne.kind, ligne.variant_id]),
    );

    for (const mission of missions) {
      const tirees = choisirLesVariantes(variantes, mission);
      if (tirees.length === 0) continue;

      // ⚠️ EXPLORATION. Une part des missions ignore la préférence et rejoue le tirage entre
      // toutes les variantes — sinon plus rien n'est mesuré, la préférence ne peut plus jamais
      // être démentie, et le jour où le marché change personne ne le voit. La part est dérivée de
      // l'identifiant de la mission, donc reproductible : la même mission explore toujours, ou
      // n'explore jamais.
      const explore =
        empreinteStable(`${mission}:exploration`) % 1000 < Math.round(PART_D_EXPLORATION * 1000);

      const choisies = explore
        ? tirees
        : tirees.map((tiree) => {
            const preferee = preferences.get(tiree.kind);
            if (preferee === undefined) return tiree;
            return variantes.find((variante) => variante.id === preferee) ?? tiree;
          });

      await tx.query(
        `insert into task_variant (tenant_id, task_id, variant_id)
         select $1, $2, unnest($3::uuid[])
         on conflict do nothing`,
        [tenantId, mission, choisies.map((variante) => variante.id)],
      );
    }
  }

  /** Un jour sans travail s'écrit aussi : sinon « rien ne s'est passé » ressemble à une panne. */
  async enregistrerAucuneOuverture(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    jour: string;
    motif: string;
  }): Promise<void> {
    await this.sql.query(
      `insert into approvisionnement (tenant_id, employee_id, jour, ouvertes, motif)
       values ($1, $2, $3, 0, $4)
       on conflict (tenant_id, employee_id, jour) do nothing`,
      [input.tenantId, input.employeeId, input.jour, input.motif],
    );
  }
}
