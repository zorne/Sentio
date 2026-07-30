-- FOND-08 — table usage_counter. C'est elle qui rend les quotas réels.
-- Réalise : FOND-08
--
-- Le couple (metric, période) est comparé au quota de la formule lu dans plan_quota. Le code
-- ne teste jamais la formule elle-même.

create table public.usage_counter (
  tenant_id     uuid not null references public.tenant (id) on delete cascade,
  metric        text not null,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  value         bigint not null default 0 check (value >= 0),
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, metric, period_start),
  check (period_end > period_start)
);

alter table public.usage_counter enable row level security;

create policy usage_counter_select on public.usage_counter
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
