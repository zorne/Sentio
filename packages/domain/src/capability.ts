import type { CapabilityBindingId, CapabilityId, PlanId, ProviderCredentialId, ProviderQuotaId } from "./ids.js";

export interface Capability {
  id: CapabilityId;
  key: string;
  name: string;
  contract: unknown;
}

export interface CapabilityBinding {
  id: CapabilityBindingId;
  capabilityId: CapabilityId;
  planId: PlanId;
  engineKey: string;
  priority: number;
}

export type DataPolicy = "no_train" | "free";

export interface ProviderCredential {
  id: ProviderCredentialId;
  providerKey: string;
  dataPolicy: DataPolicy;
}

export interface ProviderQuota {
  id: ProviderQuotaId;
  providerKey: string;
  windowStart: Date;
  windowEnd: Date;
  consumed: number;
  limit: number;
}
