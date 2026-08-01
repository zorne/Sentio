-- ════════════════════════════════════════════════════════════════════
-- Migration 0006 — Validations permanentes (mode "confirm_once")
--
-- Le propriétaire d'un agent a deux façons d'encadrer une action
-- sensible (ADR-010) :
--   "confirm"      → validation demandée à CHAQUE fois
--   "confirm_once" → validation demandée UNE fois ; une fois accordée,
--                    l'agent agit seul pour cette classe d'action
--
-- Cette table enregistre les validations permanentes accordées. Elle est
-- révocable : supprimer la ligne fait redemander l'agent.
-- ════════════════════════════════════════════════════════════════════

create table standing_approval (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant(id) on delete cascade,
  agent_instance_id uuid not null references agent_instance(id) on delete cascade,
  -- Classe d'effet couverte par la validation ('irreversible', 'write'...)
  effect_class      text not null check (effect_class in ('read','write','irreversible')),
  -- Qui a accordé (auth.users.id) et quand — traçabilité (Ch.74)
  granted_by        uuid,
  granted_at        timestamptz not null default now(),
  -- Trace de l'action précise qui a servi de première validation
  first_task_id     uuid references task(id) on delete set null,
  unique (agent_instance_id, effect_class)
);

create index on standing_approval (tenant_id);

alter table standing_approval enable row level security;
create policy tenant_isolation on standing_approval
  for all using (is_member(tenant_id));
