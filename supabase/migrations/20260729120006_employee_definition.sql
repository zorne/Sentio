-- FOND-09 — table employee_definition : le Contexte Général, l'ADN d'un métier.
--
-- ⚠️ INVARIANT 1 (AGENTS.md) — l'ADN n'est JAMAIS modifiable : ni par le client, ni par
-- l'auto-apprentissage, ni à l'exécution. Il n'évolue que par publication d'une nouvelle
-- version. Une amélioration crée une v2 ; les employés déjà vendus restent figés sur v1
-- (docs/04-contextes-memoire.md).
--
-- La garantie doit être MÉCANIQUE, pas rédactionnelle : c'est le « verrou d'écriture ».
-- Le trigger ci-dessous rend l'invariant vrai même si un jour un chemin de code fautif existe.
-- Il ne remplace pas l'absence de chemin de code, il la double.
--
-- Table globale, commune à toutes les entreprises : pas de tenant_id.

create table public.employee_definition (
  id            uuid primary key default gen_random_uuid(),
  profession    text not null,
  version       integer not null check (version > 0),
  -- Rôle, périmètre, manière de raisonner, capacités autorisées, comportement, personnalité.
  dna           jsonb not null,
  published_at  timestamptz not null default now(),
  unique (profession, version)
);

alter table public.employee_definition enable row level security;

-- Lecture ouverte : l'ADN ne contient aucune donnée client, et le runtime doit l'assembler en
-- première position à chaque appel de modèle.
create policy employee_definition_select on public.employee_definition
  for select to authenticated
  using (true);

create function public.reject_dna_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'employee_definition est immuable (AGENTS.md, invariant 1) : % refusé. Publier une nouvelle version.',
    tg_op;
end;
$$;

create trigger employee_definition_immutable
  before update or delete on public.employee_definition
  for each row execute function public.reject_dna_mutation();
