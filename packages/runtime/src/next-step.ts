/**
 * EXEC-05 — le pas complet : contexte fiable → proposition → décision.
 *
 * C'est ici que la règle fondamentale devient vraie **de bout en bout**, et pas seulement dans
 * les intentions de chaque pièce :
 *
 *     le modèle propose → le Policy Engine décide → (EXEC-06) le moteur exécute → le journal enregistre
 *
 * ══ CE QUE CE MODULE APPORTE, ET QUI N'EXISTAIT PAS ══
 *
 * `decideNextAction` (EXEC-04) reçoit un niveau d'autonomie et une liste de capacités. Tant que
 * ces deux valeurs venaient de l'appelant, rien ne disait d'où l'appelant les tenait — et une
 * valeur qui remonte du bord peut remonter de ce que le bord a lu, y compris d'une réponse de
 * modèle. Ce fichier les lit **dans la base**, et il est le seul chemin d'accès au pas :
 *
 *   · l'autonomie vient de `employee.autonomy`, réglage du client, relu à chaque pas ;
 *   · les capacités viennent de `employee_capability` (celles qui sont ACTIVÉES), jamais d'une
 *     liste écrite dans le code ni d'une liste proposée par le modèle.
 *
 * Aucune des deux n'est mise en cache : un client qui abaisse l'autonomie de son employé ou lui
 * retire une capacité doit être obéi au pas suivant, pas au prochain redémarrage.
 *
 * ══ CE QUE CE MODULE NE FAIT PAS ══
 *
 * Il n'exécute rien. Il rend une décision, et l'exécution est `EXEC-06`. Tant qu'aucune ligne
 * d'ici n'appelle un moteur de capacité, il n'existe pas de chemin par lequel une proposition
 * devient un effet sans passer par le Policy Engine.
 *
 * Réalise : EXEC-05
 */

import { randomUUID } from "node:crypto";

import {
  CONTEXTE_ASSEMBLE,
  decideNextAction,
  type CapabilityRegistry,
  type DecisionPas,
  type ModelGateway,
  type PolicyEngine,
} from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { EmployeeId, TenantId } from "@sentio/domain";

import { PostgresAutonomyResolver } from "./adapters/autonomy.js";
import { loadStepContext, type Manque } from "./step-context.js";

export type ResultatPas =
  | {
      readonly ok: true;
      readonly decision: DecisionPas;
      readonly couchesAbsentes: readonly string[];
      /** L'identifiant de ce pas. C'est par lui qu'on relit toute la chaîne (EXEC-07). */
      readonly stepId: string;
    }
  /** Le contexte n'est pas fiable : on ne demande rien au modèle. Un contexte incomplet ne se
   *  complète pas d'hypothèses (EXEC-03). */
  | { readonly ok: false; readonly manques: readonly Manque[] };

export interface NextStepDeps {
  readonly gateway: ModelGateway;
  readonly policy: PolicyEngine;
  readonly registry: CapabilityRegistry;
  readonly journal: Parameters<typeof decideNextAction>[0]["journal"];
}

/**
 * Les capacités **activées** de cet employé, dans cette entreprise.
 *
 * Jointure bornée par `tenant_id` des deux côtés : une capacité activée pour l'employé d'une
 * autre entreprise ne peut pas entrer dans cette liste. La lecture de `capability` est globale —
 * c'est un catalogue de contrats, sans donnée client.
 *
 * Une liste vide n'est pas une erreur ici : elle produira un refus au premier geste proposé, ce
 * qui est le comportement juste pour un employé sans aucune capacité activée.
 */
async function capacitesActivees(
  sql: SqlClient,
  tenantId: TenantId,
  employeeId: EmployeeId,
): Promise<string[]> {
  const rows = await sql.query<{ key: string }>(
    `select c.key
       from employee_capability ec
       join capability c on c.id = ec.capability_id
      where ec.tenant_id = $1 and ec.employee_id = $2 and ec.enabled
      order by c.key`,
    [tenantId, employeeId],
  );
  return rows.map((row) => row.key);
}

/**
 * Exécute un pas de décision pour une tâche.
 *
 * L'ordre n'est pas indifférent : le contexte est chargé et vérifié **avant** le moindre appel de
 * modèle. Demander une action à partir d'un contexte incomplet coûterait un appel payant pour
 * obtenir une proposition fondée sur des trous.
 */
export async function decideNextStep(
  sql: SqlClient,
  deps: NextStepDeps,
  input: {
    tenantId: TenantId;
    taskId: string;
    employeeId: EmployeeId;
    dataClass: "real" | "synthetic";
    envelope: string;
    maxTokens?: number;
  },
): Promise<ResultatPas> {
  const contexte = await loadStepContext(sql, {
    tenantId: input.tenantId,
    taskId: input.taskId,
  });
  if (!contexte.ok) return { ok: false, manques: contexte.manques };

  // Un pas commence. Tous les événements qui suivent porteront cet identifiant : c'est ce qui
  // rend la chaîne relisible au lieu d'être devinée à partir des horodatages.
  const stepId = randomUUID();

  // ⚠️ Lus DANS LA BASE, à chaque pas. C'est tout l'objet de ce module : ni l'un ni l'autre ne
  // peut être influencé par ce que le modèle vient de répondre, puisque ni l'un ni l'autre ne
  // traverse le modèle.
  const autonomy = await new PostgresAutonomyResolver(sql).resolve(input.tenantId, input.employeeId);
  const capacitesAutorisees = await capacitesActivees(sql, input.tenantId, input.employeeId);

  // ── Premier maillon : AVEC QUOI il a décidé. Sans lui, la trace commence à la proposition et
  //    ne répond pas à « pourquoi ? » — seulement à « quoi ? ».
  //
  //    Seule la FORME est écrite : quelles couches ont parlé, combien de faits, lesquels ont été
  //    écartés et pourquoi, l'objectif visé. Jamais le contexte lui-même — le recopier
  //    dupliquerait des données personnelles dans une seconde table et ferait grossir sans fin
  //    un journal déjà borné à 30 jours.
  await deps.journal.append({
    tenantId: input.tenantId,
    taskId: input.taskId as never,
    employeeId: input.employeeId,
    kind: CONTEXTE_ASSEMBLE,
    stepId,
    payload: {
      couchesAbsentes: contexte.couchesAbsentes,
      objectif: contexte.objectif,
      faitsRetenus: contexte.contexte.usedFacts.length,
      faitsEcartes: contexte.contexte.excluded,
      autonomie: autonomy,
      capacitesAutorisees,
    },
  });

  const decision = await decideNextAction(deps, {
    tenantId: input.tenantId,
    taskId: input.taskId as never,
    employeeId: input.employeeId,
    turns: contexte.contexte.turns,
    capacitesAutorisees,
    autonomy,
    dataClass: input.dataClass,
    envelope: input.envelope,
    stepId,
    ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
  });

  return { ok: true, decision, couchesAbsentes: contexte.couchesAbsentes, stepId };
}

/** Exporté pour les tests d'intégration : la liste des capacités est une décision de sécurité,
 *  elle doit pouvoir être vérifiée seule. */
export { capacitesActivees };
