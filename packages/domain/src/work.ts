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

export type TaskState = "pending" | "in_progress" | "waiting_approval" | "done" | "failed";

export interface Task {
  id: TaskId;
  tenantId: TenantId;
  employeeId: EmployeeId;
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
