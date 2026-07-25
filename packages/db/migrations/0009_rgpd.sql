-- ════════════════════════════════════════════════════════════════════
-- Migration 0009 — Registre des demandes RGPD (art. 12.3)
--
-- Toute demande de personne concernée est journalisée. La date de
-- réception (created_at) fait foi pour le délai de réponse de 30 jours.
-- Table non liée à un tenant : les demandes viennent aussi de personnes
-- qui n'ont plus (ou n'ont jamais eu) de compte.
-- ════════════════════════════════════════════════════════════════════

create table if not exists rgpd_request (
  id            uuid primary key default gen_random_uuid(),
  right_type    text not null check (right_type in (
    'access', 'portability', 'rectification', 'erasure', 'restriction', 'objection'
  )),
  subject_email text not null,
  detail        text not null default '',
  status        text not null default 'pending' check (status in (
    'pending', 'processing', 'answered', 'rejected'
  )),
  answered_at   timestamptz,
  answered_by   text,
  answer_notes  text,
  created_at    timestamptz not null default now()
);

create index if not exists rgpd_request_status_idx on rgpd_request (status, created_at desc);
create index if not exists rgpd_request_email_idx on rgpd_request (subject_email);

-- RLS activée mais aucune policy créée : la table n'est accessible qu'à
-- travers le pool serveur de confiance (Server Actions), jamais via
-- l'API cliente Supabase. Une écriture anon serait refusée par défaut.
alter table rgpd_request enable row level security;
