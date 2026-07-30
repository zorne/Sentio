-- FOND-26 — table provider_quota : compteur global par fournisseur et par fenêtre.
-- Réalise : FOND-26
--
-- Le quota du fournisseur est UNIQUE ET PARTAGÉ par tous les clients (docs/01-contraintes.md).
-- Il est découpé en trois enveloppes — employés vendus, diagnostic public, interne — sans quoi
-- une journée de trafic sur la vitrine empêche les clients payants d'être servis. Et c'est
-- exactement le jour où la vitrine marche que ça arrive.
--
-- ⚠️ Le facteur limitant est le DÉBIT PAR MINUTE, pas le volume mensuel (docs/adr/0009,
-- compromis 3). La fenêtre est donc courte et la surveillance compte en requêtes/minute
-- glissantes.
--
-- Table globale : ce quota est celui de la plateforme, pas celui d'une entreprise. Le quota par
-- entreprise se lit, lui, dans usage_counter comparé à plan_quota.

create table public.provider_quota (
  provider_key  text not null references public.provider_credential (provider_key) on delete cascade,
  envelope      text not null check (envelope in ('sold_employees', 'public_diagnostic', 'internal')),
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  consumed      bigint not null default 0 check (consumed >= 0),
  quota_limit   bigint not null check (quota_limit >= 0),
  primary key (provider_key, envelope, window_start),
  check (window_end > window_start)
);

alter table public.provider_quota enable row level security;
-- Aucune politique : la consommation d'inférence est de la mécanique, jamais exposée au client.
