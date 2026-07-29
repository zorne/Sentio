-- FOND-21 — table notification : Recrutement / Travail / Évolution (projet.md §17).
--
-- ⚠️ La contrainte ci-dessous est le cœur de TEST-08 : « aucune notification Évolution n'existe
-- sans strategy_change ». Elle rend MÉCANIQUEMENT impossible d'annoncer à un client que son
-- employé a progressé quand rien n'a progressé.
--
-- C'est exactement le genre de règle qui, laissée au code, finit par être contournée un soir de
-- démonstration. Ici, la base refuse.

create table public.notification (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenant (id) on delete cascade,
  employee_id         uuid not null references public.employee (id) on delete cascade,
  kind                text not null check (kind in ('recrutement', 'travail', 'evolution')),
  -- Texte visible par le client : soumis au lexique (docs/17-lexique.md).
  message             text not null check (length(trim(message)) > 0),
  strategy_change_id  uuid references public.strategy_change (id) on delete restrict,
  created_at          timestamptz not null default now(),
  read_at             timestamptz,
  -- Une notification d'évolution est adossée à un changement enregistré ; les autres n'en
  -- portent jamais.
  constraint notification_evolution_needs_proof
    check ((kind = 'evolution') = (strategy_change_id is not null))
);

create index notification_tenant_idx on public.notification (tenant_id, created_at desc);
create index notification_unread_idx on public.notification (tenant_id) where read_at is null;

alter table public.notification enable row level security;

create policy notification_select on public.notification
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le client marque ses notifications comme lues.
create policy notification_update on public.notification
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
