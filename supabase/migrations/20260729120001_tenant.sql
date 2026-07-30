-- FOND-04 — table tenant.
-- Réalise : FOND-04
--
-- Racine de toute isolation (docs/03-modele-de-donnees.md). Chaque table portant une donnée
-- client remonte jusqu'ici, et chaque politique d'accès passe par is_tenant_member().

create table public.tenant (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);

alter table public.tenant enable row level security;
