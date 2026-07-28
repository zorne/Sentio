import type { DiagnosticSessionId, EmployeeDefinitionId, RecommendationId } from "./ids.js";
import type { Profession } from "./employee.js";

export interface DiagnosticSession {
  id: DiagnosticSessionId;
  visitorFingerprint: string;
  extractedProfile: unknown;
  detectedFriction: string | null;
  startedAt: Date;
}

export type RecommendationStatus = "proposed" | "purchased" | "refused";

export interface Recommendation {
  id: RecommendationId;
  diagnosticSessionId: DiagnosticSessionId;
  profession: Profession;
  employeeDefinitionId: EmployeeDefinitionId;
  justification: string;
  status: RecommendationStatus;
  createdAt: Date;
}
