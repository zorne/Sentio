-- FOND-18 + FOND-37 — table execution_event : le journal en ajout seul.
-- Réalise : FOND-18, FOND-37
--
-- ⚠️ C'EST LA SOURCE DE VÉRITÉ. Tout le reste (états, statistiques, fiches) est une projection
-- reconstructible à partir d'elle. Elle fournit l'audit, le débogage, la reprise après
-- interruption et la preuve réglementaire (docs/03-modele-de-donnees.md).
--
-- Deux garanties mécaniques ici :
--
-- 1. AJOUT SEUL. Aucune mise à jour, aucune suppression — sauf par l'unique chemin autorisé,
--    la purge de rétention ci-dessous. Un journal réinscriptible ne prouve rien.
--
-- 2. IDEMPOTENCE (AGENTS.md, invariant 3). Toute action à effet extérieur porte une clé, et
--    l'unicité est garantie par la base, pas par le code appelant. C'est ce qui fait passer
--    TEST-05 : rejouer deux fois le même pas n'envoie pas deux emails.
--
-- Rétention : 30 jours (docs/adr/0012). C'est un arbitrage assumé — la fenêtre de preuve est
-- courte, l'ADR en porte le compromis.

create table public.execution_event (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant (id) on delete cascade,
  task_id          uuid references public.task (id) on delete cascade,
  employee_id      uuid references public.employee (id) on delete cascade,
  -- Nulle pour un événement sans effet extérieur (un raisonnement, une lecture).
  idempotency_key  text,
  kind             text not null,
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- Le rejeu d'une action à effet extérieur est refusé par la base elle-même.
create unique index execution_event_idempotency_idx
  on public.execution_event (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index execution_event_task_idx on public.execution_event (task_id, created_at);
create index execution_event_tenant_idx on public.execution_event (tenant_id, created_at);
-- Sert la purge de rétention.
create index execution_event_created_idx on public.execution_event (created_at);

alter table public.execution_event enable row level security;
-- Aucune politique : le journal contient le raisonnement et la mécanique, que le client ne voit
-- jamais. Ce qu'il a le droit de voir en est une projection (notifications, fiche, résultats).

-- Ajout seul. La purge de rétention est le SEUL chemin de suppression autorisé : elle s'annonce
-- en posant un drapeau de session, ce qui rend toute autre suppression impossible — y compris
-- depuis un futur chemin de code fautif.
create function public.reject_journal_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('sentio.retention_purge', true) = 'on' then
    return old;
  end if;

  raise exception
    'execution_event est en ajout seul : % refusé. La seule suppression autorisée est purge_execution_events().',
    tg_op;
end;
$$;

create trigger execution_event_append_only
  before update or delete on public.execution_event
  for each row execute function public.reject_journal_mutation();

-- FOND-37 — purge de rétention. À appeler par le battement planifié.
-- Renvoie le nombre d'événements retirés, pour que la surveillance puisse le journaliser.
create function public.purge_execution_events(retention_days integer default 30)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purged bigint;
begin
  if retention_days <= 0 then
    raise exception 'Rétention invalide (% jours) : une purge totale n''est jamais un défaut acceptable.', retention_days;
  end if;

  -- `set local` : le drapeau retombe à la fin de la transaction, jamais au-delà.
  perform set_config('sentio.retention_purge', 'on', true);

  delete from public.execution_event
  where created_at < now() - make_interval(days => retention_days);

  get diagnostics purged = row_count;

  perform set_config('sentio.retention_purge', 'off', true);

  return purged;
end;
$$;

revoke execute on function public.purge_execution_events(integer) from public;
