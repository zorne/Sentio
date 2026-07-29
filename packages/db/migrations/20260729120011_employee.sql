-- FOND-11 — table employee : l'employé numérique recruté par une entreprise.
--
-- Pointe vers une VERSION FIGÉE d'ADN. La colonne employee_definition_id désigne une ligne
-- précise de employee_definition, laquelle est immuable : un employé vendu ne change donc
-- jamais de comportement sans migration explicite et réversible (docs/06-scalabilite.md).
--
-- Point 3 des « huit points qu'on ne rattrape jamais » : ADN versionné, chaque employé figé
-- sur sa version.

create table public.employee (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenant (id) on delete cascade,
  employee_definition_id  uuid not null references public.employee_definition (id),
  identity_id             uuid not null unique references public.identity (id),
  recruited_at            timestamptz not null default now()
);

create index employee_tenant_idx on public.employee (tenant_id);

alter table public.employee enable row level security;

create policy employee_select on public.employee
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
