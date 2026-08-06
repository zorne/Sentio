/**
 * Les ports du noyau — ce dont il a besoin, sans savoir qui le fournit.
 *
 * `packages/core` ne dépend ni de la base ni du réseau (`docs/02-architecture.md`). Il déclare
 * ici des interfaces ; `packages/db` et `apps/worker` les branchent. C'est ce qui permet de
 * tester le noyau entier sans Postgres — et de changer d'hébergeur sans le réécrire.
 */

import type { TenantId, TaskId, EmployeeId } from "@sentio/domain";
import type { InferenceEnvelope, UsageMetric } from "@sentio/config";

/** L'horloge, injectée : un test qui dépend de l'heure réelle est un test qui échouera un jour. */
export interface Clock {
  now(): Date;
  /** Attente utilisée pour lisser le débit. Un test la remplace par une fonction qui n'attend pas. */
  sleep(milliseconds: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Consommation et plafonds.
 *
 * Les plafonds sont **lus**, jamais écrits dans le code : ouvrir Growth doit rester une
 * modification de données (`docs/03-modele-de-donnees.md`). Une valeur nulle signifie « aucun
 * quota défini pour cette métrique », ce qui est différent de zéro.
 */
export interface UsageLedger {
  tenantUsage(tenantId: TenantId, metric: UsageMetric, on: Date): Promise<number>;
  tenantLimit(tenantId: TenantId, metric: UsageMetric): Promise<number | null>;
  recordTenantUsage(
    tenantId: TenantId,
    metric: UsageMetric,
    amount: number,
    on: Date,
  ): Promise<void>;

  /** Consommation d'une enveloppe d'inférence sur la fenêtre courante du fournisseur. */
  envelopeUsage(envelope: InferenceEnvelope): Promise<number>;
  recordEnvelopeUsage(
    envelope: InferenceEnvelope,
    providerKey: string,
    amount: number,
  ): Promise<void>;
}

/** Écriture au journal. Le journal est en ajout seul : ce port n'expose ni mise à jour ni suppression. */
export interface JournalWriter {
  append(entry: {
    tenantId: TenantId;
    taskId: TaskId | null;
    employeeId: EmployeeId | null;
    kind: string;
    payload?: unknown;
    idempotencyKey?: string | null;
  }): Promise<void>;
}

/**
 * Accords humains. `standing` est l'accord permanent de « confirmer une fois » : accordé une
 * fois, valable jusqu'à révocation.
 */
export interface ApprovalStore {
  /** Accord permanent en vigueur pour cette classe d'effet, révocation prise en compte. */
  hasStandingApproval(
    tenantId: TenantId,
    employeeId: EmployeeId,
    /**
     * ⚠️ La capacité **nommée**, jamais une classe d'effet. Un accord par classe signifierait
     * « cet employé peut faire toutes les actions irréversibles » — le client croirait autoriser
     * un envoi, il autoriserait le genre entier (migration `20260806120002`).
     *
     * L'implémentation doit aussi écarter les accords **révoqués** et **expirés** : ici, seul un
     * accord en vigueur maintenant vaut `true`.
     */
    capabilityKey: string,
  ): Promise<boolean>;

  /** Demande d'accord ponctuel. Renvoie l'identifiant de la demande créée. */
  requestApproval(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    effectClass: string;
    capabilityKey: string;
  }): Promise<string>;
}
