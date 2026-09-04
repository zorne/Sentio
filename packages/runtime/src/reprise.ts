/**
 * Ce qui remet au travail une mission mise de côté faute d'outil.
 *
 * ══ LE DOMMAGE QUE CE MODULE RÉPARE ══
 *
 * Une mission qu'aucune capacité activée ne peut servir s'arrête en `needs_attention` et **sort de
 * la file** (`mettreDeCote`). C'est juste : elle n'a rien à faire dans la file d'un exécutant.
 *
 * Mais rien ne l'y remettait. Le dirigeant activait la capacité manquante, et il ne se passait
 * rien — jamais. Pire : l'exclusion du gisement porte sur TOUS les états, donc le prospect confié à
 * cette mission n'était plus jamais proposé. Le vivier se vidait, une mission à la fois, et la
 * cause disparue ne réparait rien.
 *
 * C'est exactement le défaut que `LADY-R` avait corrigé pour l'accord du client
 * (`20260815120016`), revenu par une autre porte.
 *
 * ══ POURQUOI UN PAS DU BATTEMENT, ET NON UN DÉCLENCHEUR SQL ══
 *
 * `LADY-R` est un déclencheur, et le réutiliser était le premier réflexe. Il ne transpose pas, pour
 * trois raisons mesurées :
 *
 *   1. **La vérité vit dans l'hôte, pas dans la base.** Savoir si un moteur sert une capacité se
 *      demande au REGISTRE de cet exécutant — un hôte peut monter les siens (`moteursMetier`).
 *      `capability.disponible` ne dit que ce que la composition PAR DÉFAUT monte : un déclencheur
 *      SQL qui s'y fierait laisserait bloquées des missions qu'un hôte peut servir.
 *   2. **La portée.** Un accord porte sur UNE tâche, décidée par un humain sur cette tâche.
 *      Ici, une capacité activée en débloque potentiellement des centaines — et un moteur monté en
 *      débloque chez toutes les entreprises à la fois.
 *   3. **Le budget.** Un déclencheur ne connaît ni la cadence, ni la file, ni ce qui est déjà dû.
 *      Il ne peut pas se borner sans réimplémenter tout cela en SQL.
 *
 * Le prix payé, assumé : jusqu'à un cycle de latence après l'activation. Sur un produit dont la
 * promesse est « votre employée travaille chaque jour », c'est indolore.
 *
 * ══ TROIS SÛRETÉS, ET AUCUNE N'EST DÉCORATIVE ══
 *
 *   · **Le motif.** Seules les missions arrêtées sur `capacite_absente` sont reprises. Relancer une
 *     `verification_humaine` — un effet irréversible dont l'issue est inconnue — irait contre le
 *     « personne ne doit deviner » de `adr/0026`. Et `waiting_approval` n'est pas concerné : il a
 *     `LADY-R`.
 *   · **La cause disparue.** On ne reprend que si une capacité applicable au sujet est MAINTENANT
 *     activée et servie. Sans ce contrôle, une mission encore bloquée serait reprise à chaque
 *     cycle, échouerait, reviendrait — une boucle inutile.
 *   · **La borne.** Au plus `reprisesMaxParCycle` REPRISES par passage et par entreprise. Elle compte
 *     ce qui coûte — une remise en file — et non ce qui ne coûte rien : une mission dont la cause
 *     est toujours là est écartée sans occuper de place. Une borne globale, ou une borne sur les
 *     missions EXAMINÉES, laissait une entreprise durablement bloquée geler le parc ou elle-même.
 */

import type { ReglagesRuntime } from "@sentio/config";
import { REGLAGES_RUNTIME_PAR_DEFAUT } from "@sentio/config";
import {
  ATTENTION_REQUISE,
  REPRISE_APRES_OUTIL,
  type CapabilityRegistry,
  type JournalWriter,
} from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import { capaciteApplicableAuSujet } from "@sentio/domain";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

export interface RepriseDeps {
  readonly sql: SqlClient;
  readonly journal: JournalWriter;
  /** Le registre de CET hôte — la seule source qui sache quels moteurs sont réellement montés. */
  readonly registry: CapabilityRegistry;
  readonly reglages?: ReglagesRuntime;
}

export interface RapportDeReprise {
  /** Missions arrêtées faute d'outil, examinées pendant ce passage. */
  readonly examinees: number;
  /** Missions réellement remises en file — leur cause avait disparu. */
  readonly reprises: number;
  /** Missions dont la cause est toujours là. Un chiffre, pas un silence. */
  readonly toujoursBloquees: number;
}

interface MissionBloquee {
  readonly tenant_id: string;
  readonly task_id: string;
  readonly employee_id: string;
  readonly subject_kind: string;
}

/**
 * Remet en file les missions dont la cause du blocage a disparu.
 *
 * ⚠️ **APPELÉE AVANT L'APPROVISIONNEMENT**, et c'est une décision de produit : rattraper le travail
 * déjà commencé prime sur en ouvrir du neuf — c'est ce que ferait une employée. L'ordre de la file
 * (`priority desc, next_run_at, id`) fait le reste : insérées les premières, elles sont prises les
 * premières.
 *
 * **Un employé cassé n'arrête pas les autres** : l'échec est compté et journalisé, la boucle
 * continue. Même règle que l'approvisionnement.
 */
export async function reprendreLesMissionsDebloquees(
  deps: RepriseDeps,
): Promise<RapportDeReprise> {
  const reglages = deps.reglages ?? REGLAGES_RUNTIME_PAR_DEFAUT;

  // ⚠️ LE MOTIF SE LIT DANS LE JOURNAL, ET C'EST UNE LIMITE CONNUE.
  //
  // `task.state` dit « needs_attention » sans dire pourquoi. Le motif ne vit que dans le dernier
  // `attention_requise` de la mission — or `execution_event` est purgé à 30 JOURS.
  //
  // Conséquence, écrite ici pour que personne ne la redécouvre : **une mission bloquée depuis plus
  // de trente jours perd son motif et ne sera JAMAIS reprise.** Ses prospects sont alors perdus
  // définitivement — le dommage même que ce module répare, revenu par la porte de la rétention.
  //
  // C'est un repli délibéré : on ne relance pas ce qu'on ne sait plus justifier, parce que le seul
  // autre cas possible sous `needs_attention` est `verification_humaine`, qu'il ne faut surtout pas
  // rejouer. Prudence contre exhaustivité, la prudence gagne.
  //
  // Ce qui rend ce repli acceptable, et RIEN D'AUTRE : l'alerte part bien avant la purge. Le
  // compteur avance une fois par JOUR (`travail_muet.dernier_jour` rend muets les autres cycles de
  // la même journée), et son seuil est borné à DIX en base — `garde_du_travail.cycles_toleres`,
  // contrainte de vérification. C'est ce plafond, et non une intention, qui garantit que l'alerte
  // précède la purge d'une vingtaine de jours. Le desserrer au-delà rendrait cette limite-ci
  // silencieusement destructrice, et il faudrait alors persister le motif.
  // ⚠️ **LA BORNE COMPTE LES MISSIONS REPRISES, PAS LES MISSIONS EXAMINÉES.** C'était l'inverse, et
  // ça laissait un résidu de famine même une fois la borne passée par entreprise : les N plus
  // anciennes missions d'une entreprise, si leur cause est toujours là, sont écartées — mais elles
  // avaient consommé les N places, et rien d'autre n'était regardé. Une entreprise pouvait donc
  // s'affamer elle-même indéfiniment.
  //
  // Le raisonnement qui le corrige tient en une phrase : **la borne protège du COÛT, et une mission
  // écartée ne coûte rien.** Elle ne produit ni écriture, ni appel de modèle — seulement une
  // comparaison en mémoire, puisque les capacités de l'employé sont lues une seule fois. On examine
  // donc autant qu'il faut, et on reprend au plus N.
  //
  // ⚠️ Ce que ça coûte, écrit ici plutôt que découvert plus tard : la LECTURE n'est plus bornée.
  // Elle croît avec le nombre de missions durablement bloquées — une quantité qui est elle-même
  // surveillée (`etat_de_sante`, « missions immobiles » et « missions en échec »). Si elle devenait
  // grande, c'est qu'il y a un problème à traiter, pas une borne à remettre.
  //
  // ⚠️ **LA BORNE EST PAR ENTREPRISE, ET ELLE ÉTAIT GLOBALE.** Un simple `limit N` servait les N
  // missions bloquées les plus anciennes, toutes entreprises confondues. Or une mission dont la
  // cause ne disparaît jamais — un moteur qu'on ne montera pas de sitôt — reste en tête de cette
  // liste POUR TOUJOURS : cinq d'entre elles suffisaient à ce que plus aucune reprise n'ait lieu,
  // chez aucun client. Une seule entreprise durablement bloquée gelait tout le parc.
  //
  // C'est le même défaut d'équité que le FIFO du gisement, à un autre étage : servir « les plus
  // anciens d'abord » sur une file partagée entre entreprises, c'est laisser la plus malchanceuse
  // décider pour toutes.
  //
  // Coût assumé : le travail d'un cycle croît désormais avec le NOMBRE d'entreprises, au lieu
  // d'être plafonné une fois pour toutes. C'est le bon compromis — chaque entreprise a sa part —
  // et il reste borné par `reprisesMaxParCycle` pour chacune.
  //
  // ⚠️ Ce qui reste, et qu'il faut savoir : une entreprise peut encore s'affamer elle-même si ses
  // N plus anciennes missions sont durablement bloquées. Le dommage est alors contenu à elle, et
  // c'est ce qui rend ce repli acceptable.
  const bloquees = await deps.sql.query<MissionBloquee>(
    `select t.tenant_id, t.id as task_id, t.employee_id, t.subject_kind
       from task t
      where t.state = 'needs_attention'
        and (
          select e.payload ->> 'motif'
            from execution_event e
           where e.tenant_id = t.tenant_id and e.task_id = t.id and e.kind = $1
           order by e.seq desc
           limit 1
        ) = 'capacite_absente'
      order by t.tenant_id, t.created_at, t.id`,
    [ATTENTION_REQUISE],
  );

  const reprisesParEntreprise = new Map<string, number>();
  /** Les capacités servies, lues UNE FOIS par employé : c'est ce qui rend l'examen gratuit. */
  const capacitesParEmploye = new Map<string, readonly string[]>();
  let reprises = 0;
  let toujoursBloquees = 0;

  for (const mission of bloquees) {
    const dejaReprises = reprisesParEntreprise.get(mission.tenant_id) ?? 0;
    if (dejaReprises >= reglages.reprisesMaxParCycle) {
      // Cette entreprise a eu sa part pour ce cycle. Le reste attend le suivant — et c'est une
      // attente bornée, contrairement à la famine que cette borne produisait avant.
      toujoursBloquees += 1;
      continue;
    }

    try {
      if (!(await laCauseADisparu(deps, mission, capacitesParEmploye))) {
        toujoursBloquees += 1;
        continue;
      }
      await remettreEnFile(deps, mission);
      reprises += 1;
      reprisesParEntreprise.set(mission.tenant_id, dejaReprises + 1);
    } catch (erreur) {
      toujoursBloquees += 1;
      await deps.journal.append({
        tenantId: mission.tenant_id as TenantId,
        taskId: mission.task_id as TaskId,
        employeeId: mission.employee_id as EmployeeId,
        kind: ATTENTION_REQUISE,
        payload: { motif: "reprise_impossible", detail: String(erreur) },
      });
    }
  }

  return { examinees: bloquees.length, reprises, toujoursBloquees };
}

/**
 * La cause du blocage a-t-elle disparu ?
 *
 * ⚠️ **C'est le filtre du pas de décision, réutilisé à l'envers** — et il DOIT le rester. S'ils
 * divergeaient, on reprendrait des missions que le pas suivant rebloquerait aussitôt : une boucle
 * qui ne coûte pas d'appel de modèle, mais qui ne finit jamais.
 */
async function laCauseADisparu(
  deps: RepriseDeps,
  mission: MissionBloquee,
  cache: Map<string, readonly string[]>,
): Promise<boolean> {
  // ⚠️ UNE LECTURE PAR EMPLOYÉ, PAS PAR MISSION. C'est ce qui rend l'examen assez bon marché pour
  // qu'on puisse l'exercer sans borne : un employé dont vingt missions sont bloquées ne coûte plus
  // vingt lectures identiques, mais une seule. Sans ça, « examine autant qu'il faut » remplacerait
  // une famine par une facture.
  const cle = `${mission.tenant_id}/${mission.employee_id}`;
  let actives = cache.get(cle);
  if (actives === undefined) {
    actives = (
      await deps.sql.query<{ key: string }>(
        `select c.key
           from employee_capability ec
           join capability c on c.id = ec.capability_id
          where ec.tenant_id = $1 and ec.employee_id = $2 and ec.enabled`,
        [mission.tenant_id, mission.employee_id],
      )
    ).map((ligne) => ligne.key);
    cache.set(cle, actives);
  }

  return actives.some(
    (key) =>
      capaciteApplicableAuSujet(key, mission.subject_kind) && deps.registry.sertLaCapacite(key),
  );
}

/**
 * Remet la mission dans la file, exactement comme `LADY-R` le fait après un accord.
 *
 * La priorité vient de la formule, en données — jamais d'une condition sur son nom. Et l'insertion
 * est gardée par un `not exists` : une mission déjà en file ne doit pas y entrer deux fois, ce qui
 * la ferait prendre par deux exécutants pour rien.
 */
async function remettreEnFile(deps: RepriseDeps, mission: MissionBloquee): Promise<void> {
  await deps.sql.query(
    `insert into job (tenant_id, task_id, priority)
     select $1, $2, coalesce(
              (select p.job_priority
                 from subscription sub
                 join plan p on p.id = sub.plan_id
                where sub.tenant_id = $1 and sub.status = 'active'
                limit 1), 0)
      where not exists (select 1 from job j where j.tenant_id = $1 and j.task_id = $2)`,
    [mission.tenant_id, mission.task_id],
  );

  // ⚠️ L'état repasse à `pending` seulement s'il est encore `needs_attention`. Entre la lecture et
  // ici, un humain a pu trancher : on ne défait pas sa décision.
  await deps.sql.query(
    `update task set state = 'pending', updated_at = now()
      where tenant_id = $1 and id = $2 and state = 'needs_attention'`,
    [mission.tenant_id, mission.task_id],
  );

  await deps.journal.append({
    tenantId: mission.tenant_id as TenantId,
    taskId: mission.task_id as TaskId,
    employeeId: mission.employee_id as EmployeeId,
    kind: REPRISE_APRES_OUTIL,
    payload: {
      motif: "capacite_absente",
      sujet: mission.subject_kind,
      detail: "L'outil qui manquait est désormais disponible : la mission retourne en file.",
    },
  });
}
