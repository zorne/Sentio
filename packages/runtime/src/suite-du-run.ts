/**
 * EXEC-08 — appliquer la suite d'un run : le journal, puis la file.
 *
 * `deciderLaSuite` (`@sentio/core`) tranche sans rien toucher ; ce fichier exécute sa décision.
 * La séparation est la même que partout ailleurs dans ce composant : le noyau décide sans
 * connaître la base, `apps/worker` connaît les deux et les fait se rencontrer.
 *
 * ══ L'ORDRE : JOURNAL, PUIS FILE ══
 *
 * Le journal est écrit **avant** la file, et jamais l'inverse. Il n'existe pas de transaction qui
 * couvrirait les deux (`SqlClient` n'en expose pas), donc la question n'est pas « comment éviter
 * l'interruption » mais « quel état laisse une interruption ».
 *
 * | Le worker meurt… | Ce que voit le battement suivant | Ce qu'il fait |
 * |---|---|---|
 * | avant le journal | rien n'a changé | il rejoue le pas, sans risque : les effets extérieurs sont protégés par leur clé d'idempotence (EXEC-06) |
 * | entre les deux | le journal dit la vérité, la file est en retard | il relit l'état, retombe sur la même décision, et la réapplique |
 * | après la file | tout est cohérent | il passe à la suite |
 *
 * La ligne du milieu est celle qui compte : elle est **réparable par répétition**, parce que
 * réappliquer une suite déjà appliquée donne exactement le même résultat. C'est ce qui autorise
 * à ne pas avoir de transaction ici. L'ordre inverse, lui, laisserait une tâche sortie de la file
 * sans que rien au journal ne dise pourquoi — un employé qui s'arrête sans trace.
 *
 * Réalise : EXEC-08
 */

import type { FileDeTravaux, JournalWriter, SuiteDuRun } from "@sentio/core";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

export interface AppliquerSuiteDeps {
  readonly journal: JournalWriter;
  readonly file: FileDeTravaux;
}

export interface AppliquerSuiteInput {
  readonly tenantId: TenantId;
  readonly taskId: TaskId;
  readonly employeeId: EmployeeId;
  /** Le pas dont cette suite découle (EXEC-07) : sans lui, l'arrêt d'un run ne se rattache à
   *  aucun raisonnement, et « pourquoi s'est-il arrêté ? » redevient une devinette. */
  readonly stepId?: string;
  readonly suite: SuiteDuRun;
}

/** Ce qu'un run en attente d'humain devient dans la file. Deux motifs, deux états de tâche. */
function motifDeMiseDeCote(
  motif: Extract<SuiteDuRun, { kind: "attendre_humain" }>["motif"],
): "accord_attendu" | "attention_requise" {
  return motif === "accord_attendu" ? "accord_attendu" : "attention_requise";
}

/**
 * Applique la suite décidée.
 *
 * Le `switch` est **total** : les quatre issues sont traitées, et TypeScript refuse la
 * compilation si une cinquième apparaît sans être traitée ici. Un cas oublié laisserait un
 * travail verrouillé dans la file, sans échéance et sans que rien ne le signale — la panne la
 * plus silencieuse que ce runtime puisse produire.
 */
export async function appliquerLaSuite(
  deps: AppliquerSuiteDeps,
  input: AppliquerSuiteInput,
): Promise<void> {
  const { suite } = input;

  if (suite.nature !== null) {
    await deps.journal.append({
      tenantId: input.tenantId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      kind: suite.nature,
      ...(input.stepId !== undefined && { stepId: input.stepId }),
      payload: {
        motif: suite.motif,
        detail: suite.detail,
        // ⚠️ LA CAUSE EST ÉCRITE À CÔTÉ DU MOTIF, JAMAIS À SA PLACE. La reprise cherche le motif
        // `capacite_absente` et doit continuer à le trouver — les deux causes sont une même
        // attente, qu'une même relance résout. Ce qui change, c'est le DESTINATAIRE de l'alerte,
        // et cette ligne est ce qui le rend encore lisible demain, quand plus personne n'aura la
        // mémoire du battement qui l'a écrite.
        ...(suite.kind === "attendre_humain" &&
          suite.manque !== null && {
            cause: suite.manque.cause,
            ...(suite.manque.sujetKind !== null && { sujet: suite.manque.sujetKind }),
          }),
        ...(suite.kind === "reporter" && {
          reprise: suite.quand.toISOString(),
          // Le message que le client lirait si on le lui montrait. On ne le lui envoie PAS : un
          // plafond se rouvre tout seul, personne n'a rien à faire (`adr/0026`, décision 4).
          ...(suite.messageClient !== undefined && { messageClient: suite.messageClient }),
        }),
      },
    });
  }

  switch (suite.kind) {
    case "poursuivre":
      // Le travail reste dû, maintenant. L'appel n'est pas décoratif : il **rend le verrou** pris
      // par ce battement. Sans lui, la tâche resterait invisible aux exécutants jusqu'à ce qu'un
      // nettoyage de verrous périmés la libère.
      await deps.file.reporter({
        tenantId: input.tenantId,
        taskId: input.taskId,
        quand: suite.quand,
      });
      return;

    case "reporter":
      await deps.file.reporter({
        tenantId: input.tenantId,
        taskId: input.taskId,
        quand: suite.quand,
      });
      return;

    case "terminer":
      await deps.file.retirer({
        tenantId: input.tenantId,
        taskId: input.taskId,
        issue: suite.issue,
      });
      return;

    case "attendre_humain":
      // Aucune échéance. C'est le seul état dont on ne sort pas tout seul, et c'est exactement ce
      // qu'on promet au client : son employé ne repart pas sans lui.
      await deps.file.mettreDeCote({
        tenantId: input.tenantId,
        taskId: input.taskId,
        motif: motifDeMiseDeCote(suite.motif),
      });
      return;
  }
}
