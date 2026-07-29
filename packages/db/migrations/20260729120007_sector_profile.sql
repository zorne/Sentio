-- FOND-38 — table sector_profile.
--
-- Sentio reste généraliste : la spécialisation passe par des profils sectoriels, RÉDIGÉS PAR
-- SENTIO et jamais dérivés des données d'un client (docs/adr/0011). C'est pourquoi cette table
-- est globale et sans tenant_id : y écrire depuis les données d'une entreprise ferait fuiter
-- un client vers tous les autres.
--
-- Versionnée pour la même raison que l'ADN : on publie, on ne modifie pas en place.

create table public.sector_profile (
  id            uuid primary key default gen_random_uuid(),
  sector        text not null,
  version       integer not null check (version > 0),
  -- Vocabulaire, interlocuteurs, cycle d'achat, objections, angles.
  content       jsonb not null,
  published_at  timestamptz not null default now(),
  unique (sector, version)
);

alter table public.sector_profile enable row level security;

create policy sector_profile_select on public.sector_profile
  for select to authenticated
  using (true);

create trigger sector_profile_immutable
  before update or delete on public.sector_profile
  for each row execute function public.reject_dna_mutation();
