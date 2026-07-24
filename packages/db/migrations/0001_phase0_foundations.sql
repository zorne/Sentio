-- ════════════════════════════════════════════════════════════════════
-- Migration 0001 — Phase 0 : fondations
-- Multi-tenant (Ch.27) · Journal d'exécution (principe n°1) · BYOK (ADR-005)
-- Cible : PostgreSQL (Supabase). RLS activée dès la création.
-- ════════════════════════════════════════════════════════════════════

-- ─── Extensions ───────────────────────────────────────────────────────
create extension if not exists "pgcrypto";      -- gen_random_uuid(), chiffrement

-- ─── Reset idempotent ─────────────────────────────────────────────────
-- Permet de rejouer ce script en toute sécurité après un échec partiel,
-- sans deviner où l'exécution précédente s'est arrêtée. En Phase 0, sur
-- une base neuve, ceci ne supprime aucune donnée réelle (il n'y en a pas).
drop table if exists execution_event cascade;
drop table if exists task cascade;
drop table if exists agent_instance cascade;
drop table if exists agent_definition cascade;
drop table if exists tenant_ai_credential cascade;
drop table if exists tenant_member cascade;
drop table if exists tenant cascade;
drop function if exists is_member(uuid) cascade;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. TENANT — racine d'isolation. Tout porte un tenant_id.
-- ═══════════════════════════════════════════════════════════════════════
create table tenant (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Lien utilisateur ↔ tenant (l'auth elle-même est gérée par Supabase Auth).
-- Un utilisateur appartient à un ou plusieurs tenants avec un rôle.
create table tenant_member (
  tenant_id   uuid not null references tenant(id) on delete cascade,
  user_id     uuid not null,                 -- = auth.users.id (Supabase)
  role        text not null default 'member' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. BYOK — identifiants IA par tenant (ADR-005).
--    JAMAIS de clé globale en dur : le gateway résout la clé PAR TENANT.
--    La clé est chiffrée applicativement avant insertion (le gateway déchiffre).
-- ═══════════════════════════════════════════════════════════════════════
create table tenant_ai_credential (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  provider      text not null check (provider in ('gemini','anthropic','openai','groq')),
  -- 'free'  = tier gratuit, PEUT entraîner sur les données → interdit aux données réelles
  -- 'no_train' = tier contractuellement sans-entraînement → autorisé aux données réelles
  data_policy   text not null check (data_policy in ('free','no_train')),
  key_ciphertext bytea not null,             -- clé API chiffrée (jamais en clair)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. AGENT — Définition (template, Ch.42) vs Instance (déploiement chez tenant)
-- ═══════════════════════════════════════════════════════════════════════
create table agent_definition (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,          -- ex. 'sales', 'support'
  version      int  not null default 1,
  name         text not null,
  role         text not null,
  system_prompt text not null,
  -- outils autorisés par défaut (liste de clés d'outils du Tool Registry)
  default_tools jsonb not null default '[]',
  created_at   timestamptz not null default now()
);

create table agent_instance (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  definition_id uuid not null references agent_definition(id),
  name          text not null,
  -- surcharges de config propres au tenant (instructions, objectifs)
  config        jsonb not null default '{}',
  -- niveau d'autonomie par classe d'action (voir gateway/policy)
  autonomy      jsonb not null default '{"read":"auto","write":"notify","irreversible":"confirm"}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. TASK / RUN — l'unité de travail visible par le client + la facturation
-- ═══════════════════════════════════════════════════════════════════════
create table task (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  agent_instance_id uuid not null references agent_instance(id),
  title         text not null,
  input         jsonb not null default '{}',
  status        text not null default 'queued'
                check (status in ('queued','running','waiting_human','done','failed','canceled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. EXECUTION EVENT — LE JOURNAL. Append-only. Principe n°1 de l'archi.
--    Source de vérité : audit, temps réel, facturation, apprentissage futur.
--    On n'UPDATE ni ne DELETE jamais une ligne ici.
-- ═══════════════════════════════════════════════════════════════════════
create table execution_event (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  task_id     uuid not null references task(id) on delete cascade,
  seq         int  not null,                  -- ordre dans le run
  -- type d'étape : décision du modèle, appel d'outil, résultat, attente humaine, erreur
  kind        text not null check (kind in
                ('model_decision','tool_call','tool_result','human_wait','human_decision','error','final')),
  payload     jsonb not null default '{}',
  -- coût/usage pour la facturation et l'observabilité (tokens, provider, latence)
  usage       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (task_id, seq)
);

-- ─── Index utiles ─────────────────────────────────────────────────────
create index on tenant_member (user_id);
create index on tenant_ai_credential (tenant_id) where is_active;
create index on agent_instance (tenant_id) where is_active;
create index on task (tenant_id, status);
create index on execution_event (task_id, seq);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. RLS — isolation multi-tenant appliquée EN BASE (défense en profondeur).
--    Une fuite inter-tenant est l'incident fatal → on la rend structurelle.
--    Politique : un utilisateur ne voit que les lignes des tenants dont il
--    est membre. `auth.uid()` est fourni par Supabase.
-- ═══════════════════════════════════════════════════════════════════════
alter table tenant               enable row level security;
alter table tenant_member        enable row level security;
alter table tenant_ai_credential enable row level security;
alter table agent_instance       enable row level security;
alter table task                 enable row level security;
alter table execution_event      enable row level security;
-- agent_definition = catalogue partagé (pas de tenant_id) → lecture publique, écriture réservée au service.
alter table agent_definition     enable row level security;
create policy read_catalog on agent_definition for select using (true);

-- Helper : le tenant courant appartient-il à l'utilisateur connecté ?
create or replace function is_member(t uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from tenant_member m
                 where m.tenant_id = t and m.user_id = auth.uid());
$$;

create policy tenant_isolation on tenant
  for all using (is_member(id));
create policy tenant_isolation on tenant_member
  for all using (is_member(tenant_id));
create policy tenant_isolation on tenant_ai_credential
  for all using (is_member(tenant_id));
create policy tenant_isolation on agent_instance
  for all using (is_member(tenant_id));
create policy tenant_isolation on task
  for all using (is_member(tenant_id));
-- Le journal est lisible par les membres, mais JAMAIS modifiable via l'API cliente
-- (seul le service backend, en service_role, y écrit). Append-only côté métier.
create policy tenant_read_journal on execution_event
  for select using (is_member(tenant_id));
