type Brand<T, B extends string> = T & { readonly __brand: B };

export type TenantId = Brand<string, "TenantId">;
export type TenantMemberId = Brand<string, "TenantMemberId">;
export type PlanId = Brand<string, "PlanId">;
export type SubscriptionId = Brand<string, "SubscriptionId">;

export type EmployeeDefinitionId = Brand<string, "EmployeeDefinitionId">;
export type SectorProfileId = Brand<string, "SectorProfileId">;
export type IdentityId = Brand<string, "IdentityId">;
export type EmployeeId = Brand<string, "EmployeeId">;
export type EmployeeCapabilityId = Brand<string, "EmployeeCapabilityId">;

export type CompanyProfileEntryId = Brand<string, "CompanyProfileEntryId">;
export type LearnedFactId = Brand<string, "LearnedFactId">;

export type LeadId = Brand<string, "LeadId">;
export type SuppressionId = Brand<string, "SuppressionId">;

export type ObjectiveId = Brand<string, "ObjectiveId">;
export type TaskId = Brand<string, "TaskId">;
export type JobId = Brand<string, "JobId">;
export type ExecutionEventId = Brand<string, "ExecutionEventId">;
export type ApprovalId = Brand<string, "ApprovalId">;
export type OutcomeId = Brand<string, "OutcomeId">;
export type NotificationId = Brand<string, "NotificationId">;
export type StrategyChangeId = Brand<string, "StrategyChangeId">;

export type CapabilityId = Brand<string, "CapabilityId">;
export type LadyConfigurationId = Brand<string, "LadyConfigurationId">;
export type CapabilityBindingId = Brand<string, "CapabilityBindingId">;
export type ProviderCredentialId = Brand<string, "ProviderCredentialId">;
export type ProviderQuotaId = Brand<string, "ProviderQuotaId">;

export type DiagnosticSessionId = Brand<string, "DiagnosticSessionId">;
export type RecommendationId = Brand<string, "RecommendationId">;

export type UserId = Brand<string, "UserId">;
