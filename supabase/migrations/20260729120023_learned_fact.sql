-- FOND-14 — table learned_fact : couche 2, ce que l'employé a APPRIS en travaillant.
-- Réalise : FOND-14
--
-- Beaucoup de lignes, triées, expirables (docs/04-contextes-memoire.md). Injecter tous les
-- faits appris à chaque run ferait croître le coût d'inférence sans limite avec l'ancienneté du
-- client : d'où le tri et le bornage en nombre à l'assemblage du contexte.
--
-- ⚠️ VERROU D'ÉCRITURE — l'apprentissage écrit ici, et JAMAIS dans employee_definition. Il
-- n'existe aucun chemin de code entre le module d'apprentissage et l'ADN. Ce n'est pas une
-- règle de prompt, c'est une absence de code, doublée par le trigger d'immuabilité de l'ADN.

create table public.learned_fact (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant (id) on delete cascade,
  employee_id     uuid not null references public.employee (id) on delete cascade,
  fact            text not null check (length(trim(fact)) > 0),
  author          text not null check (author in ('client', 'sentio', 'apprentissage')),
  source_task_id  uuid references public.task (id) on delete set null,
  status          text not null default 'actif' check (status in ('propose', 'actif', 'retire')),
  usage_count     integer not null default 0 check (usage_count >= 0),
  created_at      timestamptz not null default now()
);

create index learned_fact_tenant_idx on public.learned_fact (tenant_id);
-- Sert la sélection des faits pertinents : les plus utilisés d'abord, bornés en nombre.
create index learned_fact_relevance_idx on public.learned_fact (employee_id, usage_count desc)
  where status = 'actif';

alter table public.learned_fact enable row level security;

create policy learned_fact_select on public.learned_fact
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy learned_fact_insert on public.learned_fact
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id) and author = 'client');

-- Le client peut corriger et retirer ce que son employé a appris — c'est le droit de
-- contestation (docs/10-securite-rgpd.md).
create policy learned_fact_update on public.learned_fact
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
