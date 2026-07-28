import type { PlanId, SubscriptionId, TenantId, TenantMemberId, UserId } from "./ids.js";

export type PlanTier = "start" | "growth" | "scale";

export interface Tenant {
  id: TenantId;
  name: string;
  createdAt: Date;
}

export type TenantMemberRole = "owner" | "member";

export interface TenantMember {
  id: TenantMemberId;
  tenantId: TenantId;
  userId: UserId;
  role: TenantMemberRole;
  createdAt: Date;
}

export interface PlanQuota {
  metric: string;
  limit: number;
}

export interface Plan {
  id: PlanId;
  tier: PlanTier;
  commercialisable: boolean;
  quotas: PlanQuota[];
}

export type SubscriptionStatus = "active" | "past_due" | "canceled";

export interface Subscription {
  id: SubscriptionId;
  tenantId: TenantId;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  billingReference: string | null;
}

export interface UsageCounter {
  tenantId: TenantId;
  metric: string;
  periodStart: Date;
  periodEnd: Date;
  value: number;
}
