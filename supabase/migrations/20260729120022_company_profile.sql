-- FOND-13 — table company_profile : couche 2, ce que l'entreprise EST.
-- Réalise : FOND-13
--
-- Contexte Entreprise (docs/04-contextes-memoire.md) : objectifs, produits, services, processus,
-- préférences, documents, KPI. Peu de lignes, lues à chaque run.
--
-- ⚠️ TRAÇABILITÉ OBLIGATOIRE — chaque ligne porte auteur, date, tâche source, statut et
-- compteur d'utilisation. Sans l'auteur, impossible de répondre à « pourquoi mon employé
-- croit ça ? », et le droit de contestation d'une décision automatisée tombe.
--
-- La séparation d'avec learned_fact est TECHNIQUE, pas fonctionnelle : le client comme
-- l'apprentissage écrivent des deux côtés. Les mélanger ferait exploser la taille du contexte.

create table public.company_profile (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant (id) on delete cascade,
  key             text not null,
  value           jsonb not null,
  author          text not null check (author in ('client', 'sentio', 'apprentissage')),
  source_task_id  uuid references public.task (id) on delete set null,
  status          text not null default 'actif' check (status in ('propose', 'actif', 'retire')),
  usage_count     integer not null default 0 check (usage_count >= 0),
  created_at      timestamptz not null default now()
);

create index company_profile_tenant_idx on public.company_profile (tenant_id);
create index company_profile_active_idx on public.company_profile (tenant_id, key)
  where status = 'actif';

alter table public.company_profile enable row level security;

create policy company_profile_select on public.company_profile
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le client conserve le droit d'écriture et de retrait sur l'INTÉGRALITÉ de sa mémoire
-- (docs/15-decisions-ouvertes.md, D8). Le retrait est un changement de statut, jamais une
-- suppression : on doit pouvoir expliquer ce que l'employé croyait au moment où il a agi.
create policy company_profile_insert on public.company_profile
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id) and author = 'client');

create policy company_profile_update on public.company_profile
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
