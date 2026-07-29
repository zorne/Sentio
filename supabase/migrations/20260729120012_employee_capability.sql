-- FOND-12 — table employee_capability : les capacités réellement ouvertes à un employé.
--
-- Intersection ADN × formule × configuration (docs/03-modele-de-donnees.md).
--
-- ⚠️ C'est le « verrou de capacité » (docs/04-contextes-memoire.md) : un employé ne peut
-- appeler qu'une capacité listée ici. Un commercial n'a PHYSIQUEMENT PAS d'accès à une
-- capacité comptable — la garantie est mécanique, pas rédactionnelle. C'est ce qui fait passer
-- TEST-02 : le client demande de la comptabilité à son commercial, l'employé refuse.

create table public.employee_capability (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenant (id) on delete cascade,
  employee_id    uuid not null references public.employee (id) on delete cascade,
  capability_id  uuid not null references public.capability (id),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (employee_id, capability_id)
);

create index employee_capability_tenant_idx on public.employee_capability (tenant_id);

alter table public.employee_capability enable row level security;

create policy employee_capability_select on public.employee_capability
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
