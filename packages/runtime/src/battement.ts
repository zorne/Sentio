/**
 * Ce qu'un battement fait — et, tout aussi important, ce qu'il ne fait pas encore.
 *
 * `createHeartbeatHandler` (EXEC-01) authentifie et délègue à `executerLesTravauxDus`. Ce fichier
 * est ce que ce port appelle réellement.
 *
 * ══ L'ORDRE, ET POURQUOI ══
 *
 *   1. **approvisionner** — ouvrir les nouvelles missions du jour ;
 *   2. *(EXEC-12)* vider la file, mission par mission.
 *
 * Approvisionner d'abord n'est pas un détail d'ordonnancement : une mission ouverte à l'étape 1
 * est due immédiatement, donc traitée dans le même battement. L'ordre inverse ferait attendre un
 * jour entier à chaque nouvelle mission — c'est-à-dire un employé recruté le lundi qui ne fait
 * rien avant mardi.
 *
 * ⚠️ **La consommation de la file n'existe pas encore** : c'est `EXEC-12` (verrouillage par ligne
 * et saut des lignes verrouillées), qui n'est pas fait. Ce battement ouvre donc du travail que
 * personne ne prend encore. C'est écrit ici plutôt que découvert plus tard : rien ne le masque,
 * et le rapport rendu au planificateur le dit.
 *
 * Réalise : EXEC-17
 */

import { REGLAGES_RUNTIME_PAR_DEFAUT, type ReglagesRuntime } from "@sentio/config";
import {
  motifDuLot,
  planifierLApprovisionnement,
  type ApprovisionnementStore,
  type JournalWriter,
  type RegistreDeGisements,
} from "@sentio/core";
import type { EmployeeId, TenantId } from "@sentio/domain";

/** La nature journalisée quand un employé est examiné sans qu'aucune mission ne soit ouverte. */
export const APPROVISIONNEMENT_SANS_OUVERTURE = "approvisionnement_sans_ouverture";
/** La nature journalisée quand des missions sont ouvertes. */
export const APPROVISIONNEMENT_OUVERTURE = "approvisionnement_ouverture";

export interface ApprovisionnementDeps {
  readonly store: ApprovisionnementStore;
  readonly gisements: RegistreDeGisements;
  readonly journal: JournalWriter;
  readonly reglages?: ReglagesRuntime;
}

export interface RapportDApprovisionnement {
  /** Employés examinés pendant ce battement. */
  readonly examines: number;
  /** Missions réellement ouvertes — jamais le nombre demandé. */
  readonly ouvertes: number;
  /** Employés pour lesquels rien n'a été ouvert, par raison. Un chiffre sans raison n'aide pas. */
  readonly refus: Readonly<Record<string, number>>;
}

/** Le jour civil UTC, au format `AAAA-MM-JJ` — jamais le fuseau du processus, qui déciderait
 *  sinon quand une journée de travail commence. */
export function jourUtc(maintenant: Date): string {
  return maintenant.toISOString().slice(0, 10);
}

/**
 * Ouvre le travail neuf du jour, pour chaque employé.
 *
 * **Un employé cassé n'arrête pas les autres.** L'échec est compté et journalisé, puis la boucle
 * continue : un battement qui s'interromprait au premier incident laisserait tous les employés
 * suivants sans travail, et l'incident d'une entreprise deviendrait la panne de toutes.
 */
export async function approvisionnerLeJour(
  deps: ApprovisionnementDeps,
  maintenant: Date,
): Promise<RapportDApprovisionnement> {
  const reglages = deps.reglages ?? REGLAGES_RUNTIME_PAR_DEFAUT;
  const jour = jourUtc(maintenant);
  const refus: Record<string, number> = {};
  let ouvertes = 0;
  let examines = 0;

  for (const employe of await deps.store.employesAExaminer()) {
    examines += 1;
    try {
      ouvertes += await approvisionnerUnEmploye(deps, reglages, jour, employe, refus);
    } catch (error) {
      refus["erreur"] = (refus["erreur"] ?? 0) + 1;
      await journaliser(deps, employe, APPROVISIONNEMENT_SANS_OUVERTURE, {
        jour,
        raison: "erreur",
        detail: String(error),
      });
    }
  }

  return { examines, ouvertes, refus };
}

async function approvisionnerUnEmploye(
  deps: ApprovisionnementDeps,
  reglages: ReglagesRuntime,
  jour: string,
  employe: { tenantId: TenantId; employeeId: EmployeeId; gisement: string },
  refus: Record<string, number>,
): Promise<number> {
  const verdict = await deps.store.verdict(employe.tenantId, employe.employeeId);

  // ⚠️ Le gisement n'est interrogé QUE si le verdict est favorable. L'interroger avant coûterait
  // une lecture de prospects pour un employé dont l'abonnement est résilié — c'est-à-dire lire
  // des données client sans motif, ce que la collecte minimale interdit.
  const gisement = verdict === "ok" ? deps.gisements.pour(employe.gisement) : null;
  if (verdict === "ok" && gisement === null) {
    // Un gisement qu'on ne sait pas alimenter n'ouvre rien, et le dit. Retomber sur celui d'un
    // autre ferait travailler cet employé sur des sujets qui ne le concernent pas.
    refus["gisement_inconnu"] = (refus["gisement_inconnu"] ?? 0) + 1;
    await journaliser(deps, employe, APPROVISIONNEMENT_SANS_OUVERTURE, {
      jour,
      raison: "gisement_inconnu",
      gisement: employe.gisement,
    });
    return 0;
  }

  const restantDePeriode = verdict === "ok" ? await deps.store.restantDePeriode(employe.tenantId) : null;
  // Le rythme que la cible exige. `null` quand elle n'est pas calculable — le client n'a pas
  // déclaré ce qu'il faut, et on ne le suppose pas à sa place.
  const rythmeVoulu = verdict === "ok" ? await deps.store.rythmeVoulu(employe.tenantId) : null;
  const sujetsEligibles =
    gisement === null
      ? []
      : await gisement.sujetsEligibles({
          tenantId: employe.tenantId,
          employeeId: employe.employeeId,
          jour,
          // On ne demande jamais plus que ce qu'on pourrait ouvrir : lire cent prospects pour en
          // retenir dix serait de la collecte sans usage.
          limite: Math.min(
            reglages.missionsMaxParJour,
            restantDePeriode ?? reglages.missionsMaxParJour,
            rythmeVoulu ?? reglages.missionsMaxParJour,
          ),
        });

  const plan = planifierLApprovisionnement({
    verdict,
    sujetsEligibles,
    restantDePeriode,
    rythmeVoulu,
    reglages,
  });

  if (plan.kind === "rien") {
    refus[plan.raison] = (refus[plan.raison] ?? 0) + 1;
    if (plan.bloqueLaJournee) {
      await deps.store.enregistrerAucuneOuverture({
        tenantId: employe.tenantId,
        employeeId: employe.employeeId,
        jour,
        motif: motifDuLot(plan),
      });
    }
    await journaliser(deps, employe, APPROVISIONNEMENT_SANS_OUVERTURE, {
      jour,
      raison: plan.raison,
      detail: plan.detail,
    });
    return 0;
  }

  const ouvertes = await deps.store.ouvrirLesMissions({
    tenantId: employe.tenantId,
    employeeId: employe.employeeId,
    jour,
    sujets: plan.sujets,
    motif: motifDuLot(plan),
  });

  if (ouvertes === null) {
    // Un autre battement a gagné la course sur le lot du jour. Ce n'est pas une erreur : c'est
    // exactement ce que la clé primaire est là pour produire.
    refus["deja_approvisionne_aujourdhui"] = (refus["deja_approvisionne_aujourdhui"] ?? 0) + 1;
    return 0;
  }

  await journaliser(deps, employe, APPROVISIONNEMENT_OUVERTURE, {
    jour,
    ouvertes,
    demandees: plan.sujets.length,
    borne: plan.borne,
  });
  return ouvertes;
}

/**
 * Journalise sans tâche : l'approvisionnement précède toute mission, il n'appartient donc à aucune.
 * `taskId` nul est prévu par le port — comme le routage du Gateway ou l'effacement.
 */
async function journaliser(
  deps: ApprovisionnementDeps,
  employe: { tenantId: TenantId; employeeId: EmployeeId },
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await deps.journal.append({
    tenantId: employe.tenantId,
    taskId: null,
    employeeId: employe.employeeId,
    kind,
    payload,
  });
}
