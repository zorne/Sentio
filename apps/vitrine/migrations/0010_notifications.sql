-- ═══════════════════════════════════════════════════════════════════════
-- Notifications de validation humaine — l'agent suspend une tâche
-- (waiting_human) quand la politique d'autonomie l'exige ; cette table
-- rend cet état visible côté client (onglet Décisions + email best-effort
-- via Resend, voir apps/web/src/lib/notify.ts).
--
-- RLS activée, AUCUNE policy : comme 0009 (rgpd_request), l'accès ne
-- passe jamais par le client Supabase anon — uniquement via le pool
-- serveur (Server Actions / route API cron).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists notification (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  task_id            uuid not null references task(id) on delete cascade,
  agent_instance_id  uuid not null references agent_instance(id),
  kind               text not null default 'waiting_human'
                     check (kind in ('waiting_human')),
  read_at            timestamptz,
  email_sent_at      timestamptz,
  created_at         timestamptz not null default now(),
  constraint notification_task_unique unique (task_id)
);

create index if not exists notification_tenant_unread_idx
  on notification (tenant_id, read_at) where read_at is null;
create index if not exists notification_task_idx on notification (task_id);

alter table notification enable row level security;
