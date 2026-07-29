-- FOND-27 — table diagnostic_session : la conversation d'un visiteur sur la vitrine.
--
-- ⚠️ CLASSE DE DONNÉES — le diagnostic manipule de la donnée RÉELLE dès la première question
-- (nom d'entreprise, email). Il ne peut donc passer que par un fournisseur « sans entraînement »
-- (docs/10-securite-rgpd.md). C'est aussi pourquoi le fournisseur de secours ne sert qu'aux
-- tests : il n'y a pas de repli possible ici (docs/adr/0009, compromis 4).
--
-- tenant_id est nul tant que le visiteur n'est pas devenu client : l'immense majorité des
-- diagnostics n'aboutira jamais à une entreprise, et c'est normal.

create table public.diagnostic_session (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid references public.tenant (id) on delete set null,
  -- Empreinte de limitation par visiteur et par adresse (enveloppe d'inférence dédiée).
  visitor_fingerprint  text not null,
  -- Profil structuré extrait de la conversation.
  extracted_profile    jsonb not null default '{}'::jsonb,
  detected_friction    text,
  started_at           timestamptz not null default now()
);

create index diagnostic_session_fingerprint_idx
  on public.diagnostic_session (visitor_fingerprint, started_at);
create index diagnostic_session_tenant_idx on public.diagnostic_session (tenant_id)
  where tenant_id is not null;

alter table public.diagnostic_session enable row level security;
-- Aucune politique : la vitrine n'a AUCUN accès aux données client (docs/02-architecture.md,
-- les deux zones étanches). Le diagnostic est écrit et lu côté serveur.
