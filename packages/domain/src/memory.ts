import type { CompanyProfileEntryId, EmployeeId, LearnedFactId, TenantId, TaskId } from "./ids.js";

export type MemoryAuthor = "client" | "sentio" | "apprentissage";
export type MemoryStatus = "propose" | "actif" | "retire";

interface MemoryEntryBase {
  tenantId: TenantId;
  author: MemoryAuthor;
  createdAt: Date;
  sourceTaskId: TaskId | null;
  status: MemoryStatus;
  usageCount: number;
}

export interface CompanyProfileEntry extends MemoryEntryBase {
  id: CompanyProfileEntryId;
  key: string;
  value: unknown;
}

export interface LearnedFact extends MemoryEntryBase {
  id: LearnedFactId;
  employeeId: EmployeeId;
  fact: string;
}
