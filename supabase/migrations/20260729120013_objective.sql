-- FOND-15 — table objective : l'objectif du dirigeant (ex. +5 000 €/mois).
-- Réalise : FOND-15
--
-- Le succès est mesuré UNIQUEMENT par rapport à cet objectif (projet.md §19). Le dashboard
-- affiche la progression vers lui, jamais des métriques techniques.

create table public.objective (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant (id) on delete cascade,
  metric        text not null,
  target_value  numeric not null,
  horizon       text not null,
  created_at    timestamptz not null default now()
);

create index objective_tenant_idx on public.objective (tenant_id);

alter table public.objective enable row level security;

create policy objective_select on public.objective
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le dirigeant fixe et corrige son propre objectif.
create policy objective_insert on public.objective
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy objective_update on public.objective
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
