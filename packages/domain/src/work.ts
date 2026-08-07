import type {
  ApprovalId,
  EmployeeId,
  ExecutionEventId,
  JobId,
  NotificationId,
  ObjectiveId,
  OutcomeId,
  StrategyChangeId,
  TaskId,
  TenantId,
} from "./ids.js";

export interface Objective {
  id: ObjectiveId;
  tenantId: TenantId;
  metric: string;
  targetValue: number;
  horizon: string;
  createdAt: Date;
}

/**
 * L'état mécanique d'une mission, du point de vue de la file.
 *
 * ⚠️ `needs_attention` n'est pas `waiting_approval`, et les confondre afficherait au client une
 * question qui n'existe pas : `waiting_approval` attend une **réponse** sur une action précise ;
 * `needs_attention` attend un **constat** que personne ne peut faire à sa place — un effet
 * irréversible engagé d'issue inconnue, un contexte incomplet (`adr/0026`).
 *
 * Cette liste est la copie TypeScript de la contrainte `task_state_check` (migration
 * `20260807120001`). Un test d'intégration compare les deux.
 */
export type TaskState =
  | "pending"
  | "in_progress"
  | "waiting_approval"
  | "needs_attention"
  | "done"
  | "failed";

/**
 * Une mission durable confiée à un employé, sur **un sujet** — un prospect pour le métier
 * Commercial, autre chose pour un métier futur (`adr/0027`).
 *
 * Le sujet n'est pas une décoration : c'est lui qui rend « ce travail existe déjà » décidable.
 * Sans lui, deux missions du même employé étaient strictement indiscernables.
 */
export interface Task {
  id: TaskId;
  tenantId: TenantId;
  employeeId: EmployeeId;
  /** La NATURE du sujet (`lead`, …). Jamais une table : le domaine ne connaît pas le schéma. */
  subjectKind: string;
  subjectId: string;
  state: TaskState;
  createdAt: Date;
}

export interface Job {
  id: JobId;
  tenantId: TenantId;
  taskId: TaskId;
  priority: number;
  attempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  nextRunAt: Date;
}

export interface ExecutionEvent {
  id: ExecutionEventId;
  /** Rang d'insertion attribué par la base — le seul ordre total du journal, et donc le seul
   *  sur lequel une reconstruction de run peut s'appuyer (migration `20260806120001`).
   *  `createdAt` ne convient pas : il vaut l'heure de début de transaction, identique pour tous
   *  les événements d'un même pas. */
  seq: number;
  /** Le pas de run auquel l'événement appartient (EXEC-07) : contexte, proposition, politique,
   *  engagement et résultat d'un même raisonnement partagent cet identifiant. Nul hors d'un pas. */
  stepId: string | null;
  tenantId: TenantId;
  taskId: TaskId;
  employeeId: EmployeeId;
  idempotencyKey: string;
  kind: string;
  payload: unknown;
  createdAt: Date;
}

export type ApprovalState = "requested" | "granted" | "standing" | "revoked" | "refused";

export interface Approval {
  id: ApprovalId;
  tenantId: TenantId;
  taskId: TaskId;
  state: ApprovalState;
  requestedAt: Date;
  resolvedAt: Date | null;
}

export interface Outcome {
  id: OutcomeId;
  tenantId: TenantId;
  taskId: TaskId;
  kind: "response" | "meeting" | "sale";
  value: number | null;
  recordedAt: Date;
}

export type NotificationKind = "recrutement" | "travail" | "evolution";

interface NotificationBase {
  id: NotificationId;
  tenantId: TenantId;
  employeeId: EmployeeId;
  message: string;
  createdAt: Date;
  readAt: Date | null;
}

export type Notification =
  | (NotificationBase & { kind: "recrutement" | "travail" })
  | (NotificationBase & { kind: "evolution"; strategyChangeId: StrategyChangeId });

export interface StrategyChange {
  id: StrategyChangeId;
  tenantId: TenantId;
  employeeId: EmployeeId;
  description: string;
  occurredAt: Date;
}
