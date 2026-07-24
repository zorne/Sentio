-- ════════════════════════════════════════════════════════════════════
-- Migration 0003 — Leads (mini-CRM interne, ADR-009)
-- Remplace la dépendance Google Sheets par une table multi-tenant.
-- Zéro friction externe : la plateforme stocke déjà les leads du tenant.
-- ════════════════════════════════════════════════════════════════════

create table lead (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  name          text not null,
  company       text not null,
  email         text not null,
  last_contact  date,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

create index on lead (tenant_id);

alter table lead enable row level security;
create policy tenant_isolation on lead
  for all using (is_member(tenant_id));

-- ─── Données de test (ADR-003 : données de démo uniquement) ───────────
-- Un tenant de démo + 2 leads bidon, pour le smoke test réel Phase 1.
insert into tenant (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Tenant Démo')
on conflict (id) do nothing;

insert into lead (tenant_id, name, company, email, last_contact, notes)
values
  ('00000000-0000-0000-0000-000000000001', 'Julie Martin', 'Acme SAS', 'julie@acme.fr', '2026-06-01', 'Intéressée par l''offre Business'),
  ('00000000-0000-0000-0000-000000000001', 'Marc Dubois', 'Zenith SARL', 'marc@zenith.fr', '2026-05-15', 'Demande un devis pour 10 postes')
on conflict do nothing;
