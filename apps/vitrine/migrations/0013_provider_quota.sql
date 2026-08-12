-- ════════════════════════════════════════════════════════════════════
-- Migration 0013 — l'enveloppe d'inférence du diagnostic public
-- (ACQUIS-18) : le compteur GLOBAL que la migration 0011 annonçait
-- comme « reste à faire ».
--
-- Réalise : ACQUIS-18
--
-- Ce que 0011 ne pouvait pas faire : borner ce que TOUS les visiteurs
-- consomment ensemble. Un plafond par visiteur ne borne rien face à
-- mille visiteurs — et le quota d'inférence est unique et partagé avec
-- les employés déjà vendus (docs/11-exploitation.md). Sans découpage,
-- une journée de trafic sur la vitrine empêche les clients payants
-- d'être servis, et c'est exactement le jour où la vitrine marche que
-- ça arrive.
--
-- ⚠️ MÊME TABLE QUE LE CŒUR, DÉLIBÉRÉMENT — voir
-- supabase/migrations/20260729120025_provider_quota.sql. Colonnes,
-- contrainte d'enveloppe et clé primaire sont identiques, à une
-- différence près : pas de clé étrangère vers `provider_credential`,
-- qui n'existe pas dans ce projet. La vitrine vise aujourd'hui un
-- projet Supabase DISTINCT de celui des lots 0 à 2 (README, « Les
-- migrations SQL de la vitrine ») : la table ne pouvait pas être
-- réutilisée, seule sa forme pouvait l'être.
--
-- Ce que ça implique à la convergence (docs/27-convergence.md, phase 4)
-- : cette table n'a rien à transposer. Les deux ont la même clé
-- primaire ; réunir les projets, c'est additionner `consumed` par
-- (provider_key, envelope, window_start), puis supprimer celle-ci.
--
-- ⚠️ La fenêtre écrite ici est le MOIS calendaire, parce que le budget
-- qu'on lui compare est mensuel (INFERENCE_PROVIDER_LIMITS.
-- tokensPerMonth × INFERENCE_ENVELOPE_SHARE). Compter une journée et la
-- comparer à un mois donnerait une garde trente fois trop lâche —
-- c'est-à-dire une garde qui ne se déclenche jamais.
-- ════════════════════════════════════════════════════════════════════

create table if not exists provider_quota (
  provider_key  text not null,
  envelope      text not null check (envelope in ('sold_employees', 'public_diagnostic', 'internal')),
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  consumed      bigint not null default 0 check (consumed >= 0),
  quota_limit   bigint not null check (quota_limit >= 0),
  primary key (provider_key, envelope, window_start),
  check (window_end > window_start)
);

-- Aucune policy RLS : la consommation d'inférence est de la mécanique
-- de plateforme, jamais exposée à un visiteur ni à un client. Même
-- raison, et même absence de policy, que dans le cœur.
alter table provider_quota enable row level security;
