-- FOND-22 — table strategy_change : la trace horodatée de chaque évolution RÉELLE d'un employé.
-- Réalise : FOND-22
--
-- ⚠️ C'est le garde-fou contre le mensonge le plus tentant du produit : émettre « votre employé
-- a progressé » sans progression réelle (AGENTS.md, §5 « ton pire risque »).
--
-- Une notification d'évolution ne peut pas exister sans une ligne ici — la contrainte est posée
-- dans la migration suivante, pas laissée à la discipline du code. C'est ce que vérifie TEST-08.

create table public.strategy_change (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  employee_id  uuid not null references public.employee (id) on delete cascade,
  -- Formulée dans le vocabulaire du métier, jamais en termes de modèle ou de paramètre.
  description  text not null check (length(trim(description)) > 0),
  occurred_at  timestamptz not null default now()
);

create index strategy_change_tenant_idx on public.strategy_change (tenant_id, occurred_at);

alter table public.strategy_change enable row level security;

create policy strategy_change_select on public.strategy_change
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
