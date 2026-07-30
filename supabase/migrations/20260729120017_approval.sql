-- FOND-19 — table approval : les validations humaines.
-- Réalise : FOND-19
--
-- ⚠️ INVARIANT 6 (AGENTS.md) — l'irréversible n'est jamais automatique par défaut, quel que
-- soit le niveau d'autonomie choisi par le client.
--
-- Cette table est aussi le DROIT D'INTERVENTION HUMAINE exigé par le RGPD sur les décisions
-- automatisées (docs/10-securite-rgpd.md). Il doit être documenté comme tel, pas seulement codé.

create table public.approval (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant (id) on delete cascade,
  task_id       uuid not null references public.task (id) on delete cascade,
  state         text not null default 'requested'
                  check (state in ('requested', 'granted', 'refused', 'revoked')),
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  check ((state = 'requested') = (resolved_at is null))
);

create index approval_tenant_idx on public.approval (tenant_id);
-- Sert l'alerte « en attente d'accord humain depuis trop longtemps » (docs/11-exploitation.md) :
-- un client qui n'a pas vu la demande croit que son employé ne travaille pas.
create index approval_pending_idx on public.approval (requested_at) where state = 'requested';

alter table public.approval enable row level security;

create policy approval_select on public.approval
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le dirigeant accorde ou refuse lui-même. C'est le seul endroit du schéma où un client agit
-- sur le travail en cours.
create policy approval_update on public.approval
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
