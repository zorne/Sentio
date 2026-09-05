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

import { createHash } from "node:crypto";

import {
  choisirLesVariantes,
  empreinteStable,
  prioriserLesTravaux,
  type ApprovisionnementStore,
  type CoupleDeTravail,
  type GisementDeMissions,
  type JustificationDePriorisation,
  type RegistreDeGisements,
  type TravailCandidat,
  type TravailEcarte,
} from "@sentio/core";
import {
  BORNES_DE_PRIORISATION_PAR_DEFAUT,
  type BornesDePriorisation,
} from "@sentio/config";
import type { SqlClient, TransactionalSqlClient } from "@sentio/db";
import {
  CAPACITES,
  domainePourPriorite,
  effortRequis,
  releverDesResultats,
  PART_D_EXPLORATION,
} from "@sentio/domain";
import type { EmployeeId, TenantId } from "@sentio/domain";

/**
 * L'identité technique d'une mission « recherche » — celle qui n'a pas de prospect pour sujet
 * puisqu'elle sert justement à en trouver (`ATTELAGES` sur `rechercher.prospect`, dans
 * `attelage.ts` : « cette mission n'a pas encore de sujet »).
 *
 * ⚠️ LE JOUR N'EST PAS UNE RÈGLE DE CADENCE — C'EST UN CONTOURNEMENT TECHNIQUE, ET C'EST
 * DÉLIBÉRÉ. `task.subject_id` est `not null` (`…120002`) : une mission sans prospect a quand
 * même besoin d'un identifiant. Un identifiant FIXE romprait `task_sujet_unique` pour de bon —
 * cet index porte sur TOUS les états, y compris `done` (« ne pas réécrire … est une promesse
 * produit », même migration) : une première recherche terminée bloquerait alors toute réouverture
 * future, quel que soit le besoin. Faire varier l'identifiant avec le jour civil UTC est donc ce
 * qui permet à une recherche `done` un jour de ne pas condamner celle du lendemain.
 *
 * La VRAIE borne — une seule recherche active à la fois, quel que soit le jour où elle a été
 * ouverte — n'est PAS portée par cet identifiant : elle est appliquée juste après, en lisant
 * l'état des missions `recherche` déjà ouvertes. Lire ce hash comme « une recherche par jour »
 * serait donc un contresens : rien n'empêcherait, par exemple, plusieurs jours de rester sans
 * recherche pendant qu'une seule reste active, ni une recherche de rester ouverte plusieurs jours.
 *
 * Ce n'est ni un SIRET ni l'identifiant d'aucune ligne réelle — contrairement à `lead.id`, cette
 * valeur ne référence rien : `subject_kind = 'recherche'` le dit déjà, `subject_id` n'a ici qu'un
 * rôle mécanique.
 */
function identifiantDeRecherche(tenantId: TenantId, employeeId: EmployeeId, jour: string): string {
  return createHash("sha256")
    .update(`recherche:${tenantId}:${employeeId}:${jour}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * ══ LE MAILLON QUI RELIE UNE NATURE DE MISSION AU VOCABULAIRE DU DIAGNOSTIC ══
 *
 * Le dirigeant approuve des priorités exprimées en **domaines** (`recherche_selection`,
 * `evaluation`, …) ; Lady ouvre des missions portant une **nature** (`lead`, `recherche`). Sans
 * cette table, les deux ne se parlent pas : une configuration pourrait dire « votre problème est
 * le volume d'entreprises approchées » sans que rien, jamais, n'en tienne compte — c'est
 * exactement ce qui se passait avant.
 *
 * ⚠️ `lead` porte TROIS domaines, et ce n'est pas une approximation. Une mission `lead` qualifie,
 * consigne, puis écrit, selon le pas où elle en est — le modèle choisit lequel à l'intérieur du
 * run (`next-action.ts`). Une nature de mission n'est donc pas un domaine : c'est un contenant
 * qui en sert plusieurs, et le rang retenu est le meilleur des trois (`rangDuTravail`).
 *
 * ⚠️ Chaque nature déclare aussi les capacités qui la rendent EXÉCUTABLE. Un travail qu'aucune
 * capacité activée ne sert n'est pas priorisé bas : il est **écarté**, et l'écart est journalisé.
 * Le prioriser reviendrait à ouvrir une mission que le run ne pourrait qu'échouer, en consommant
 * un créneau que l'autre travail aurait utilisé.
 */
interface NatureDeTravail {
  readonly kind: string;
  readonly couples: readonly CoupleDeTravail[];
  /** Il en suffit d'UNE seule activée : une mission `lead` a du sens dès qu'on peut qualifier. */
  readonly capacitesQuiLaServent: readonly string[];
}

const NATURES_DU_COMMERCIAL: readonly NatureDeTravail[] = [
  {
    kind: "lead",
    couples: [
      { domaine: "evaluation", objet: "prospect" },
      { domaine: "communication_sortante", objet: "prospect" },
      { domaine: "donnees_fiches", objet: "prospect" },
    ],
    capacitesQuiLaServent: [
      CAPACITES.qualifierProspect,
      CAPACITES.envoyerProspect,
      CAPACITES.relancerProspect,
      CAPACITES.mettreAJourProspect,
    ],
  },
  {
    kind: "recherche",
    couples: [{ domaine: "recherche_selection", objet: "prospect" }],
    capacitesQuiLaServent: [CAPACITES.rechercherProspect],
  },
];

/**
 * Les domaines que la mesure du travail désigne comme bloquants.
 *
 * ⚠️ **Rien n'est réinventé ici** : on réutilise `releverDesResultats`, le relevé qui décide déjà
 * s'il faut proposer une reconfiguration au dirigeant (LADY-U). Écrire un second jeu de règles
 * « quel diagnostic amplifie quel domaine » aurait produit deux vérités pour une même mesure — et
 * un jour deux réponses différentes, dont on ne saurait pas laquelle croire. Ici, Lady ne peut pas
 * amplifier un domaine dont la réévaluation dirait par ailleurs qu'il va bien.
 *
 * `goulot` et `faiblesse` amplifient ; `force` ne fait rien. Une force dit « ça marche, n'y touche
 * pas » — la traduire en priorité renforcerait ce qui n'en a pas besoin.
 *
 * « Trop tôt » ne renvoie rien, et c'est le comportement voulu : avant un quart de l'horizon ou
 * dix missions travaillées, un retard est du bruit (`SIGNAL_MINIMAL`). Amplifier sur du bruit
 * ferait osciller l'ordre de travail d'un jour à l'autre pour rien.
 */
function domainesEnRetard(mesures: MesuresBrutes | null): readonly string[] {
  if (mesures === null) return [];
  const releve = releverDesResultats({
    missionsOuvertes: Number(mesures.missions_ouvertes ?? 0),
    missionsAgies: Number(mesures.missions_agies ?? 0),
    reponses: Number(mesures.reponses ?? 0),
    rendezVous: Number(mesures.rendez_vous ?? 0),
    ventes: Number(mesures.ventes ?? 0),
    partEcoulee: Number(mesures.part_ecoulee ?? 0),
    ecartDeRythme: Number(mesures.ecart_de_rythme ?? 0),
  });
  if (releve.statut !== "constats") return [];
  return releve.constats
    .filter((constat) => constat.genre === "goulot" || constat.genre === "faiblesse")
    .map((constat) => constat.domaine);
}

interface MesuresBrutes {
  readonly missions_ouvertes: number | null;
  readonly missions_agies: number | null;
  readonly reponses: number | null;
  readonly rendez_vous: number | null;
  readonly ventes: number | null;
  readonly part_ecoulee: number | null;
  readonly ecart_de_rythme: number | null;
}

/**
 * Le gisement du métier Commercial : les prospects que cet employé n'a pas encore pris en charge
 * — et, quand il n'y en a aucun, la recherche qui doit les faire apparaître.
 *
 * ⚠️ Ce qui est filtré **en SQL**, et pourquoi pas en TypeScript : un prospect exclu, désinscrit,
 * ou déjà confié à une mission ne doit pas remonter du tout. Le filtrer après coup laisserait,
 * entre la lecture et l'écriture, une fenêtre où il redevient candidat.
 *
 * L'ordre est `created_at, id` — total et stable. Sans le départage par identifiant, deux
 * prospects importés dans la même transaction partagent `created_at` (le même piège qu'EXEC-02
 * sur le journal), et deux battements ouvriraient des missions différentes.
 *
 * ══ LA PRIORITÉ N'EST PLUS UNE CONSTANTE : C'EST UNE DÉCISION ══
 *
 * Ce gisement tranchait entre traitement et recherche par une règle écrite en dur : « s'il reste
 * un prospect, ne cherche jamais ». Honnête, testée — mais insensible à tout. Deux dirigeants aux
 * diagnostics opposés recevaient le même ordre de travail, et leur configuration ne changeait rien.
 *
 * Le gisement rend donc désormais **tous** les travaux possibles, et délègue l'arbitrage à
 * `prioriserLesTravaux` (`@sentio/core`), fonction pure et déterministe. Il reste ce qu'il était —
 * le seul endroit qui sait ce qu'est un prospect — mais il ne décide plus seul de ce qui compte.
 *
 * ⚠️ Ce qui n'a PAS changé, et ne doit pas : à l'intérieur d'une même nature de travail, l'ordre
 * reste le plus ancien d'abord (`created_at, id`). Départager deux prospects entre eux est une
 * autre question, avec d'autres données — la mêler à celle-ci mélangerait deux décisions.
 */
export class GisementDeProspects implements GisementDeMissions {
  readonly nature = "lead";

  constructor(
    private readonly sql: SqlClient,
    private readonly bornes: BornesDePriorisation = BORNES_DE_PRIORISATION_PAR_DEFAUT,
  ) {}

  async sujetsEligibles(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    limite: number;
    jour: string;
  }): Promise<{
    sujets: readonly { kind: string; id: string }[];
    justification: JustificationDePriorisation | null;
  }> {
    const capacites = new Set(
      (
        await this.sql.query<{ key: string }>(
          `select c.key
             from employee_capability ec
             join capability c on c.id = ec.capability_id
            where ec.tenant_id = $1 and ec.employee_id = $2 and ec.enabled`,
          [input.tenantId, input.employeeId],
        )
      ).map((row) => row.key),
    );

    const candidats: TravailCandidat[] = [];
    const ecartes: TravailEcarte[] = [];

    for (const nature of NATURES_DU_COMMERCIAL) {
      if (!nature.capacitesQuiLaServent.some((cle) => capacites.has(cle))) {
        // ⚠️ Écarté, pas déprioritisé. Ouvrir une mission qu'aucun moteur activé ne peut traiter
        // consommerait un créneau pour produire un échec — et masquerait le vrai manque.
        ecartes.push({ kind: nature.kind, couples: nature.couples, raison: "aucune_capacite_active" });
        continue;
      }
      const sujets =
        nature.kind === "lead"
          ? await this.prospectsATraiter(input)
          : await this.rechercheAOuvrir(input);
      candidats.push({
        kind: nature.kind,
        couples: nature.couples,
        sujets,
        joursSansTravail: await this.joursSansTravail(input, nature.kind),
        // Zéro tant qu'`outcome` n'est alimenté par aucun chemin de production (`docs/35`).
        // Le facteur est borné et testé dès maintenant, pour que la garantie précède la donnée.
        ajustementHistorique: 0,
      });
    }

    const priorites = await this.prioritesApprouvees(input);

    return prioriserLesTravaux({
      candidats,
      ecartes,
      priorites,
      domainePourPriorite,
      domainesEnRetard: domainesEnRetard(await this.mesures(input.tenantId)),
      budget: input.limite,
      bornes: this.bornes,
    });
  }

  /**
   * Les priorités que le dirigeant a approuvées — jamais recalculées depuis les constats bruts.
   *
   * ⚠️ C'est ici que tient la gouvernance. Ces phrases ne changent que par
   * `accepter_la_configuration` ; les relire au lieu de recomposer un score garantit que le
   * comportement de Lady ne peut pas bouger sur des données que personne n'a validées.
   */
  private async prioritesApprouvees(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
  }): Promise<readonly string[]> {
    const [ligne] = await this.sql.query<{ priorites: unknown }>(
      `select priorites from lady_configuration
        where tenant_id = $1 and employee_id = $2 and active
        limit 1`,
      [input.tenantId, input.employeeId],
    );
    const brut = ligne?.priorites;
    return Array.isArray(brut) ? brut.filter((p): p is string => typeof p === "string") : [];
  }

  private async mesures(tenantId: TenantId): Promise<MesuresBrutes | null> {
    const [ligne] = await this.sql.query<MesuresBrutes>("select * from mesures_du_travail($1)", [
      tenantId,
    ]);
    return ligne ?? null;
  }

  /**
   * Depuis combien de jours cette nature de travail n'a rien reçu.
   *
   * `0` quand elle n'a jamais rien reçu **et** qu'aucune mission n'existe : un employé neuf ne
   * doit pas voir son premier travail amplifié par une attente qui n'a jamais eu lieu.
   */
  private async joursSansTravail(
    input: { tenantId: TenantId; employeeId: EmployeeId },
    kind: string,
  ): Promise<number> {
    const [ligne] = await this.sql.query<{ jours: number | null }>(
      `select extract(epoch from (now() - max(t.created_at))) / 86400 as jours
         from task t
        where t.tenant_id = $1 and t.employee_id = $2 and t.subject_kind = $3`,
      [input.tenantId, input.employeeId, kind],
    );
    const jours = ligne?.jours;
    return jours === undefined || jours === null ? 0 : Math.max(Math.floor(Number(jours)), 0);
  }

  private async prospectsATraiter(input: {
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
          -- ⚠️ « SANS ADRESSE » N'EST PLUS « SANS TRAVAIL », ET C'EST LE CONSTAT P0-1.
          --
          -- Cette ligne exigeait une adresse email, parce que la seule source imaginée était un
          -- fichier client et la seule action un envoi. Or l'annuaire public de l'État — la source
          -- qui remplit enfin cette table — **ne donne aucune adresse** : c'est structurel, l'État
          -- ne publie pas les emails des entreprises. Gardée telle quelle, cette ligne rendait la
          -- recherche de prospects entièrement inutile, sans que rien ne le dise.
          --
          -- La règle juste n'est pas « a une adresse », c'est « il reste quelque chose à faire » :
          --   · pas encore qualifié → il y a du travail, l'adresse n'y change rien ;
          --   · qualifié et sans adresse → plus rien à faire, on ne l'ouvre pas.
          --
          -- Le second cas est exactement ce que garde le test « ne prend jamais un prospect exclu,
          -- désinscrit, écarté ou sans adresse » : il reste vrai, mot pour mot.
          and (l.email is not null or l.qualification = 'nouveau')
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

  /**
   * La recherche à ouvrir, s'il y a lieu — au plus une.
   *
   * Une recherche encore active — quel que soit le jour où elle a été ouverte — compte comme du
   * travail déjà en cours : en ouvrir une seconde empilerait deux recherches concurrentes pour
   * un besoin qu'une seule suffit à couvrir. « Active » est ici tout état qui n'est pas terminal
   * (`…120001` : done/failed sont les deux seuls états qui closent une mission).
   *
   * ⚠️ Ce n'est PAS une règle de priorité, c'est une règle d'éligibilité — d'où sa place ici et
   * non dans le moteur de priorisation. « Une seule recherche à la fois » reste vrai quel que
   * soit le rang que le dirigeant donne à ce travail.
   */
  private async rechercheAOuvrir(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    jour: string;
  }): Promise<readonly { kind: string; id: string }[]> {
    const [active] = await this.sql.query<{ id: string }>(
      `select 1 as id
         from task t
        where t.tenant_id = $1
          and t.employee_id = $2
          and t.subject_kind = 'recherche'
          and t.state not in ('done', 'failed')
        limit 1`,
      [input.tenantId, input.employeeId],
    );
    if (active !== undefined) return [];

    return [
      { kind: "recherche", id: identifiantDeRecherche(input.tenantId, input.employeeId, input.jour) },
    ];
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
