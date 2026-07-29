import type {
  CapabilityId,
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
  /** Nul tant que la fiche employé n'existe pas (lot 6) : l'hébergement d'images n'est pas tranché. */
  portraitUrl: string | null;
  status: IdentityStatus;
  takenAt: Date | null;
}

export interface Employee {
  id: EmployeeId;
  tenantId: TenantId;
  /**
   * Désigne une ligne précise de `employee_definition`, laquelle porte déjà sa version et est
   * immuable. La version n'est donc **pas** répétée ici : la dupliquer permettrait qu'elle
   * diverge de l'ADN réellement pointé, et c'est exactement ce que le figeage interdit
   * (`docs/06-scalabilite.md`).
   */
  employeeDefinitionId: EmployeeDefinitionId;
  identityId: IdentityId;
  recruitedAt: Date;
}

export interface EmployeeCapability {
  id: EmployeeCapabilityId;
  tenantId: TenantId;
  employeeId: EmployeeId;
  /** Référence le contrat de capacité, jamais son moteur (`docs/adr/0006`). */
  capabilityId: CapabilityId;
  enabled: boolean;
}
