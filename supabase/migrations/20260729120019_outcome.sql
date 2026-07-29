-- FOND-20 — table outcome : les résultats mesurables rattachés à une tâche.
--
-- ⚠️ INVARIANT 4 (AGENTS.md) — aucun chiffre affiché sans une ligne en base qui le justifie.
-- Cette table EST cette ligne. Le chiffre d'affaires du dashboard se calcule d'ici, jamais
-- d'une estimation présentée comme mesurée (docs/09-metriques-roi.md).
--
-- C'est le modèle d'attribution : une vente déclarée par le client, rattachée à un prospect
-- touché. C'est l'arme de rétention principale du produit — sur un marché qui résilie à
-- 50-70 % par an, c'est ce qui rend la valeur prouvable au lieu d'être affirmée.

create table public.outcome (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  task_id      uuid not null references public.task (id) on delete cascade,
  kind         text not null check (kind in ('response', 'meeting', 'sale')),
  -- Montant pour une vente ; nul pour une réponse ou un rendez-vous.
  value        numeric,
  -- Qui l'a constaté. Une vente est TOUJOURS déclarée par le client : Sentio ne se décerne
  -- jamais un chiffre d'affaires tout seul.
  declared_by  text not null default 'client' check (declared_by in ('client', 'sentio')),
  recorded_at  timestamptz not null default now(),
  check (kind <> 'sale' or (value is not null and declared_by = 'client'))
);

create index outcome_tenant_idx on public.outcome (tenant_id, recorded_at);
create index outcome_task_idx on public.outcome (task_id);

alter table public.outcome enable row level security;

create policy outcome_select on public.outcome
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le client déclare ses ventes lui-même.
create policy outcome_insert on public.outcome
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id) and declared_by = 'client');
