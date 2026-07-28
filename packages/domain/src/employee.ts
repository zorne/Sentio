import type {
  EmployeeCapabilityId,
  EmployeeDefinitionId,
  EmployeeId,
  IdentityId,
  SectorProfileId,
  TenantId,
} from "./ids.js";

export type Profession = "commercial";

export interface EmployeeDefinition {
  id: EmployeeDefinitionId;
  profession: Profession;
  version: number;
  dna: unknown;
  publishedAt: Date;
}

export interface SectorProfile {
  id: SectorProfileId;
  sector: string;
  version: number;
  content: unknown;
  publishedAt: Date;
}

export type IdentityStatus = "free" | "taken";

export interface Identity {
  id: IdentityId;
  profession: Profession;
  firstName: string;
  lastName: string;
  portraitUrl: string;
  status: IdentityStatus;
  takenAt: Date | null;
}

export interface Employee {
  id: EmployeeId;
  tenantId: TenantId;
  employeeDefinitionId: EmployeeDefinitionId;
  employeeDefinitionVersion: number;
  identityId: IdentityId;
  recruitedAt: Date;
}

export interface EmployeeCapability {
  id: EmployeeCapabilityId;
  employeeId: EmployeeId;
  capabilityKey: string;
  enabled: boolean;
}
