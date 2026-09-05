import type { DiagnosticSessionId, RecommendationId } from "./ids.js";

export interface DiagnosticSession {
  id: DiagnosticSessionId;
  visitorFingerprint: string;
  extractedProfile: unknown;
  detectedFriction: string | null;
  startedAt: Date;
}

export type RecommendationStatus = "proposed" | "purchased" | "refused" | "hors_perimetre";

export interface Recommendation {
  id: RecommendationId;
  diagnosticSessionId: DiagnosticSessionId;
  /**
   * La configuration que Sentio propose — rôle, priorités, capacités, autonomie. Elle devient la
   * version 1 de `lady_configuration` au recrutement.
   *
   * ⚠️ Elle ne POINTE pas une configuration : la recommandation naît pendant le diagnostic, avant
   * qu'une entreprise et un employé existent. Elle la porte donc comme donnée
   * (`20260815120004_lady_core.sql`).
   *
   * Nulle quand le besoin sort du périmètre — et la base impose la réciproque : on ne recommande
   * rien plutôt que mal.
   */
  configurationProposee: unknown | null;
  justification: string;
  status: RecommendationStatus;
  createdAt: Date;
}
