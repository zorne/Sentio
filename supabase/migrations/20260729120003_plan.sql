-- FOND-06 — table plan.
-- Réalise : FOND-06
--
-- Les trois formules existent dès le jour 1 ; seul Start porte le drapeau « commercialisable »
-- (projet.md §28). Les quotas vivent ici, EN DONNÉES : le code lit un quota par sa clé et ne
-- teste jamais la formule (docs/03-modele-de-donnees.md). Ouvrir Growth doit être une
-- modification de données, pas un déploiement — c'est TEST-09.
--
-- Table globale : elle ne porte aucune donnée client, donc pas de tenant_id.

create table public.plan (
  id                uuid primary key default gen_random_uuid(),
  tier              text not null unique check (tier in ('start', 'growth', 'scale')),
  commercialisable  boolean not null default false,
  -- Priorité dans la file d'exécution : c'est la promesse « priorité d'exécution » des
  -- formules supérieures (docs/03-modele-de-donnees.md).
  job_priority      integer not null,
  created_at        timestamptz not null default now()
);

create table public.plan_quota (
  plan_id     uuid not null references public.plan (id) on delete cascade,
  metric      text not null,
  quota_limit bigint not null check (quota_limit >= 0),
  primary key (plan_id, metric)
);

alter table public.plan enable row level security;
alter table public.plan_quota enable row level security;

-- Le catalogue des formules est public en lecture : la vitrine l'affiche.
create policy plan_select on public.plan
  for select to authenticated, anon
  using (true);

create policy plan_quota_select on public.plan_quota
  for select to authenticated, anon
  using (true);
