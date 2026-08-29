/**
 * La file de travaux, branchée sur Postgres.
 *
 * `@sentio/core` déclare le port (`FileDeTravaux`) ; il ignore que la file est une table. C'est
 * ce qui permettra de la remplacer par une file managée le jour où le volume l'exigera, sans
 * toucher au domaine (`docs/03-modele-de-donnees.md`).
 *
 * ══ POURQUOI LA LIGNE `job` EST SUPPRIMÉE, ET NON MARQUÉE ══
 *
 * `job` n'a pas de colonne d'état, et c'est volontaire : **la file ne contient que ce qui est dû
 * ou le sera**. Un run fini, ou arrêté en attente d'une personne, n'a plus d'échéance — lui en
 * inventer une (`next_run_at` dans dix ans) écrirait une date que personne n'a choisie, et qu'un
 * jour un index lirait comme un travail à faire.
 *
 * Rien n'est perdu pour autant : ce qui s'est passé vit dans `execution_event`, en ajout seul, et
 * l'état du run s'en relit intégralement (EXEC-02). La reprise après accord humain (`EXEC-11`)
 * réinscrira une ligne dans la file — un geste explicite, qui se voit.
 *
 * ══ L'ORDRE DES DEUX ÉCRITURES ══
 *
 * `task.state` est mis à jour **avant** de toucher la file. Si le processus meurt entre les deux,
 * le pire état possible est une tâche marquée « en attente » dont la ligne de file existe encore :
 * le battement suivant la reprend, relit le journal, et retombe sur la même décision. L'ordre
 * inverse laisserait un travail sorti de la file et marqué « en cours » — c'est-à-dire un employé
 * qui a l'air de travailler et ne travaille plus.
 *
 * Réalise : EXEC-08, EXEC-12
 */

import { REGLAGES_RUNTIME_PAR_DEFAUT } from "@sentio/config";
import type { FileDeTravaux, TravailPris } from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

/** L'état de tâche qui correspond à chaque sortie de run. Une table, pas des `if` dispersés. */
const ETAT_TACHE = {
  termine: "done",
  echoue: "failed",
  accord_attendu: "waiting_approval",
  attention_requise: "needs_attention",
} as const;

export class PostgresFileDeTravaux implements FileDeTravaux {
  constructor(
    private readonly sql: SqlClient,
    /** Durée du bail. Au-delà, un travail verrouillé est considéré comme abandonné. */
    private readonly bailMinutes: number = REGLAGES_RUNTIME_PAR_DEFAUT.bailDuVerrouMinutes,
  ) {}

  /**
   * EXEC-12 — prendre un travail dû, en **une seule instruction atomique**.
   *
   * ══ POURQUOI `for update skip locked`, ET RIEN D'AUTRE ══
   *
   * `select` puis `update` ne marche pas : entre les deux, un autre exécutant prend le même
   * travail. Un `update … where locked_at is null` ne marche pas non plus — il sérialise tous
   * les exécutants sur la même ligne, chacun attendant que le précédent la libère pour découvrir
   * qu'elle est prise. `skip locked` fait la seule chose juste : celui qui arrive second **passe
   * à la ligne suivante** au lieu d'attendre.
   *
   * L'instruction est unique, donc elle est sa propre transaction. Aucun `begin` n'est nécessaire,
   * et surtout : le verrou de ligne n'est **pas** tenu pendant le pas, qui dure des secondes. Ce
   * qui protège pendant le pas, c'est le bail (`locked_at`), pas le verrou Postgres.
   *
   * ══ LE BAIL, ET CE QU'IL RÉPARE ══
   *
   * Un exécutant qui meurt en plein pas ne rend jamais son verrou. Sans bail, le travail resterait
   * invisible **pour toujours** — la panne la plus silencieuse possible : un employé qui cesse de
   * travailler sans que rien ne l'indique. Au-delà du bail, un autre reprend, et `attempts` compte
   * la reprise. Rejouer n'est pas dangereux : les effets extérieurs sont protégés par leur clé
   * d'idempotence (EXEC-06).
   *
   * ══ L'ORDRE ══
   *
   * `priority desc` d'abord — c'est la promesse « priorité d'exécution » des formules supérieures,
   * lue dans `plan.job_priority` (`FOND-17`, `EXEC-13`). Puis l'échéance, puis l'identifiant :
   * sans ce dernier départage, deux travaux de même priorité et de même échéance se rendraient
   * dans un ordre arbitraire, et une file « équitable » deviendrait invérifiable.
   *
   * ══ D'OÙ VIENT L'HEURE, ET POURQUOI CE N'EST PLUS DE L'APPLICATION ══
   *
   * `next_run_at` est posé par la base — `now()` au moment de l'insertion, en MICROsecondes. Le
   * comparer à un `Date` JS, qui n'a que la milliseconde, faisait perdre jusqu'à 999 µs à
   * l'aller-retour : un travail inséré à `…437294` était comparé à `…437000`, donc jugé **pas
   * encore dû**, et le battement passait sans le prendre.
   *
   * Ce n'était pas théorique : `repetition-generale.integration.test.ts` échouait une fois sur
   * quatre — l'accord du dirigeant était écrit, et l'action n'arrivait jamais. Instrumenter le
   * faisait disparaître, parce que la moindre requête ajoutée poussait l'horloge dans la
   * milliseconde suivante. C'est la signature d'une course, et c'est pourquoi personne ne l'avait
   * vue : tout ce qu'on ajoutait pour l'observer la masquait.
   *
   * En production, la même comparaison mélangeait l'horloge de Postgres et celle du processus —
   * deux machines, deux dérives. `composition.ts` contournait déjà le symptôme en relisant son
   * horloge entre l'approvisionnement et l'exécution ; le contournement n'est plus nécessaire.
   *
   * ⚠️ AUCUNE MARGE N'EST AJOUTÉE. Un « `- 1 milliseconde` » de confort masquerait la course sans
   * la supprimer, et se paierait un jour sur une machine plus lente. La base est la seule horloge.
   */
  async prendre(input: { pris_par: string; maintenant?: Date }): Promise<TravailPris | null> {
    const rows = await this.sql.query<{
      tenant_id: string;
      task_id: string;
      employee_id: string;
      attempts: number;
      repris: boolean;
    }>(
      `with instant as (
         -- Fourni ⇒ instant CHOISI (suites qui déplacent le temps). Absent ⇒ la base tranche.
         select coalesce($2::timestamptz, now()) as t
       ),
       candidat as (
         select j.id, (j.locked_at is not null) as repris
           from job j
          where j.next_run_at <= (select t from instant)
            and (j.locked_at is null
                 or j.locked_at < (select t from instant) - make_interval(mins => $3))
            -- ⚠️ L'ARRÊT DU DIRIGEANT (LADY-W). Refuser d'ouvrir de nouvelles missions ne suffit
            -- pas : celles déjà en file partiraient quand même, et « stop » ne stopperait rien
            -- de ce qui est déjà préparé. Le travail n'est pas supprimé — il n'est pas pris.
            and not exists (
              select 1 from task t
                join employee e on e.tenant_id = t.tenant_id and e.id = t.employee_id
               where t.tenant_id = j.tenant_id and t.id = j.task_id
                 and e.en_pause_depuis is not null
            )
          order by j.priority desc, j.next_run_at, j.id
          for update of j skip locked
          limit 1
       )
       update job
          set locked_at = (select t from instant),
              locked_by = $1,
              -- « attempts » ne compte PAS les passages normaux : il compte les REPRISES, donc
              -- les fois où un bail a expiré sans que rien n'aboutisse. C'est le seul chiffre qui
              -- distingue « cette mission travaille » de « cette mission tue l'exécutant ».
              attempts = job.attempts + (case when candidat.repris then 1 else 0 end)
         from candidat, task t
        where job.id = candidat.id
          -- Jointure par (tenant_id, id) : un travail ne peut pas désigner la mission d'une
          -- autre entreprise, et la lecture le prouve au lieu de le supposer.
          and t.tenant_id = job.tenant_id
          and t.id = job.task_id
       returning job.tenant_id, job.task_id, t.employee_id, job.attempts, candidat.repris`,
      [input.pris_par, input.maintenant ?? null, this.bailMinutes],
    );

    const row = rows[0];
    if (row === undefined) return null;
    return {
      tenantId: row.tenant_id as TenantId,
      taskId: row.task_id as TaskId,
      employeeId: row.employee_id as EmployeeId,
      reprises: Number(row.attempts),
    };
  }

  async reporter(input: { tenantId: TenantId; taskId: TaskId; quand: Date }): Promise<void> {
    await this.marquerLaTache(input.tenantId, input.taskId, "in_progress");

    // Le verrou est rendu en même temps que l'échéance est posée : les deux vont ensemble, et un
    // verrou oublié rendrait le travail invisible à tous les exécutants jusqu'à expiration.
    await this.sql.query(
      `update job
          set next_run_at = $3, locked_at = null, locked_by = null
        where tenant_id = $1 and task_id = $2`,
      [input.tenantId, input.taskId, input.quand],
    );
  }

  async retirer(input: {
    tenantId: TenantId;
    taskId: TaskId;
    issue: "termine" | "echoue";
  }): Promise<void> {
    await this.marquerLaTache(input.tenantId, input.taskId, ETAT_TACHE[input.issue]);
    await this.sortirDeLaFile(input.tenantId, input.taskId);
  }

  async mettreDeCote(input: {
    tenantId: TenantId;
    taskId: TaskId;
    motif: "accord_attendu" | "attention_requise";
  }): Promise<void> {
    await this.marquerLaTache(input.tenantId, input.taskId, ETAT_TACHE[input.motif]);
    await this.sortirDeLaFile(input.tenantId, input.taskId);
  }

  /** `tenant_id` est dans le `where` de chaque écriture : une tâche d'une autre entreprise est
   *  introuvable, pas « trouvée puis refusée ». */
  private async marquerLaTache(
    tenantId: TenantId,
    taskId: TaskId,
    etat: (typeof ETAT_TACHE)[keyof typeof ETAT_TACHE] | "in_progress",
  ): Promise<void> {
    await this.sql.query(
      `update task set state = $3, updated_at = now() where tenant_id = $1 and id = $2`,
      [tenantId, taskId, etat],
    );
  }

  private async sortirDeLaFile(tenantId: TenantId, taskId: TaskId): Promise<void> {
    await this.sql.query(`delete from job where tenant_id = $1 and task_id = $2`, [
      tenantId,
      taskId,
    ]);
  }
}
