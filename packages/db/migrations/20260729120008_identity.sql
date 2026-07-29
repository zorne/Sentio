-- FOND-10 — table identity : le réservoir d'identités.
--
-- « Une identité ne peut jamais être réutilisée. Chaque employé est unique » (projet.md §9).
-- L'unicité est GLOBALE, pas par entreprise : deux clients ne doivent jamais avoir un employé
-- portant le même nom.
--
-- La réservation doit être atomique — c'est le seul moyen de tenir la promesse si deux
-- recrutements arrivent en même temps (docs/03-modele-de-donnees.md). D'où reserve_identity(),
-- qui s'appuie sur `for update skip locked` : deux appels concurrents obtiennent deux identités
-- différentes, jamais la même, et aucun n'attend l'autre.
--
-- Table globale : pas de tenant_id. Le lien vers l'entreprise se fait par employee.

create table public.identity (
  id          uuid primary key default gen_random_uuid(),
  profession  text not null,
  first_name  text not null,
  last_name   text not null,
  portrait_url text,
  status      text not null default 'free' check (status in ('free', 'taken')),
  taken_at    timestamptz,
  created_at  timestamptz not null default now(),
  unique (first_name, last_name),
  -- Une identité prise porte toujours sa date, et une identité libre n'en porte jamais.
  check ((status = 'taken') = (taken_at is not null))
);

create index identity_free_idx on public.identity (profession) where status = 'free';

alter table public.identity enable row level security;
-- Aucune politique : le réservoir n'est jamais lu directement par un client. Il est consommé
-- par reserve_identity() côté serveur.

create function public.reserve_identity(target_profession text)
returns public.identity
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reserved public.identity;
begin
  select * into reserved
  from public.identity
  where profession = target_profession
    and status = 'free'
  order by random()
  limit 1
  for update skip locked;

  if not found then
    raise exception 'Réservoir d''identités épuisé pour le métier %.', target_profession;
  end if;

  update public.identity
  set status = 'taken', taken_at = now()
  where id = reserved.id
  returning * into reserved;

  return reserved;
end;
$$;

revoke execute on function public.reserve_identity(text) from public;
