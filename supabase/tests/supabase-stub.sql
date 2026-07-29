-- Stub local du schéma `auth` de Supabase.
--
-- Supabase fournit ce schéma sur sa plateforme ; il est reproduit ici pour que les migrations
-- soient vérifiables sur un Postgres nu, en intégration continue comme en local. Le schéma
-- applicatif doit rester indépendant de l'hébergeur (docs/02-architecture.md) : s'il ne peut
-- être exécuté que sur Supabase, cette indépendance n'est qu'une intention.
--
-- ⚠️ Ce fichier ne fait PAS partie du schéma de production. Ne jamais l'appliquer sur Supabase.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

-- Supabase expose l'utilisateur courant via les revendications du jeton.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

-- ⚠️ On reproduit ici le défaut PERMISSIF de la plateforme : Supabase accorde automatiquement
-- des droits aux rôles clients sur toute table créée dans le schéma public.
--
-- Sans cette ligne, les migrations 028 et 030 passeraient les tests localement sans rien
-- prouver : elles corrigent un danger qui n'existerait pas dans un Postgres nu. Un test qui ne
-- reproduit pas la condition dangereuse ne teste rien — il rassure.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
