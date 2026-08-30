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
import { capaciteApplicableAuSujet } from "@sentio/domain";
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
  | { readonly ok: false; readonly raison: "contexte_incomplet"; readonly manques: readonly Manque[] }
  /**
   * Aucune capacité activée ne s'applique au sujet de cette mission.
   *
   * ⚠️ CE CAS EST NÉ AVEC LE FILTRAGE, ET IL EST TRAITÉ ICI PLUTÔT QUE PLUS TARD. Filtrer la liste
   * rend possible qu'elle devienne vide — livrer le filtre en laissant ce cas ouvert
   * introduirait un mode de défaillance silencieux dans le lot même qui prétend en fermer un.
   *
   * On s'arrête donc AVANT le modèle : lui demander de choisir dans une liste vide coûterait un
   * appel payant pour une réponse qui serait refusée de toute façon.
   */
  | {
      readonly ok: false;
      readonly raison: "aucune_capacite_applicable";
      readonly sujetKind: string;
      /** Ce que l'employé a d'activé — pour que le motif dise ce qui manque, pas juste qu'il manque. */
      readonly capacitesActives: readonly string[];
    };

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
 * Le fait qu'un MOTEUR la serve est vérifié ailleurs, contre le registre de cet hôte et non
 * contre la base — voir `CapabilityRegistry.sertLaCapacite`.
 *
 * Une liste vide n'est pas une erreur ici : l'appelant s'en saisit et arrête la mission avec un
 * motif qui dit ce qui manque.
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
  if (!contexte.ok) return { ok: false, raison: "contexte_incomplet", manques: contexte.manques };

  // Un pas commence. Tous les événements qui suivent porteront cet identifiant : c'est ce qui
  // rend la chaîne relisible au lieu d'être devinée à partir des horodatages.
  const stepId = randomUUID();

  // ⚠️ Lus DANS LA BASE, à chaque pas. C'est tout l'objet de ce module : ni l'un ni l'autre ne
  // peut être influencé par ce que le modèle vient de répondre, puisque ni l'un ni l'autre ne
  // traverse le modèle.
  const autonomy = await new PostgresAutonomyResolver(sql).resolve(input.tenantId, input.employeeId);
  const capacitesActives = await capacitesActivees(sql, input.tenantId, input.employeeId);

  // ── LE FILTRE PAR SUJET, ET POURQUOI IL EST ICI ────────────────────────────────────────────
  //
  // Le modèle recevait TOUTES les capacités de l'employé, y compris celles qui ne peuvent
  // structurellement pas s'appliquer à cette mission — `qualifier.prospect` sur une mission de
  // recherche, par exemple. Il n'a aucun moyen de le savoir : le contexte ne lui dit pas sur quoi
  // porte sa mission. Il devinait, et `attelage.ts` refusait après coup, tuant le run
  // DÉFINITIVEMENT. Observé le 2026-08-30 sur une erreur que personne n'avait scénarisée.
  //
  // ⚠️ On ne l'INFORME pas, on RESTREINT. L'informer reviendrait à espérer qu'il en tienne compte ;
  // restreindre rend la proposition incohérente impossible à formuler. C'est la doctrine
  // d'`attelage.ts` — on ne fait pas confiance au modèle pour viser — appliquée un cran plus tôt.
  //
  // ⚠️ ET CE FILTRE NE REMPLACE PAS `exigerUnProspect`. C'est une économie, pas une frontière :
  // une mission créée par un autre chemin n'est jamais passée par ici. Le garde aval reste, et un
  // test par mutation le prouve.
  //
  // ⚠️ DEUX CONDITIONS, ET LA SECONDE ÉCONOMISE UN APPEL PAYANT. Une capacité peut être activée
  // pour l'employé sans qu'aucun moteur ne la serve — `envoyer.prospect` et `relancer.prospect`
  // sont exactement dans ce cas (`composition.ts` ne les monte pas, délibérément). Sans ce
  // second filtre, le modèle la proposait — **un appel facturé** — puis `engineFor` échouait.
  //
  // ⚠️ La question « un moteur la sert-il ? » se pose au REGISTRE DE CET HÔTE, jamais à
  // `capability.disponible`. La colonne dit ce que la composition par DÉFAUT monte, et sert à
  // l'affichage ; un hôte qui fournit ses propres moteurs (`moteursMetier`) servirait des
  // capacités que la colonne dit indisponibles. Se fier à elle écarterait du travail réellement
  // exécutable.
  const capacitesAutorisees = capacitesActives.filter(
    (cle) => capaciteApplicableAuSujet(cle, contexte.sujetKind) && deps.registry.sertLaCapacite(cle),
  );

  // ⚠️ Le filtre CRÉE ce cas : il n'existait pas avant lui. Le laisser ouvert introduirait un
  // silence de plus. On s'arrête donc ici — avant le modèle, qui coûte — avec un motif qui dit ce
  // qui manque plutôt que « ça a échoué ».
  if (capacitesAutorisees.length === 0) {
    return {
      ok: false,
      raison: "aucune_capacite_applicable",
      sujetKind: contexte.sujetKind,
      capacitesActives,
    };
  }

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
