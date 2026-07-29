-- Droits par défaut sur les objets FUTURS du schéma public.
--
-- ⚠️ CE QUE 028 NE COUVRAIT PAS.
--
-- La migration 028 retire les droits larges accordés par la plateforme, puis accorde exactement
-- ce qu'il faut. Mais elle agit sur les tables qui EXISTAIENT à ce moment-là. Supabase pose en
-- plus des DEFAULT PRIVILEGES : toute table créée ensuite — par une migration future, ou d'un
-- clic dans l'éditeur SQL du tableau de bord — reçoit automatiquement des droits pour `anon` et
-- `authenticated`.
--
-- Autrement dit, sans ce fichier, une table créée demain est ouverte aux visiteurs jusqu'à ce
-- que quelqu'un y pense. Le filet de 029 ne se referme qu'au déploiement suivant, et une base de
-- production ne devrait jamais dépendre d'un « quelqu'un y pense ».
--
-- Après cette migration, une nouvelle table est INACCESSIBLE par défaut. Le droit s'accorde
-- explicitement, comme dans 028. C'est le sens de la règle : le refus est l'état par défaut,
-- l'ouverture est un geste conscient.

-- Rôle courant : celui qui applique les migrations, donc celui qui créera les tables des lots
-- suivants. C'est le cas qui compte le plus.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Les DEFAULT PRIVILEGES sont attachés au rôle qui CRÉE l'objet. Sur Supabase, les migrations et
-- l'éditeur SQL n'utilisent pas forcément le même rôle : on couvre donc aussi les rôles de
-- plateforme.
--
-- Deux gardes, pour deux raisons distinctes :
--   • `if exists` — pour que cette migration tourne telle quelle sur un Postgres nu, en local et
--     en intégration continue, où ces rôles n'existent pas ;
--   • `pg_has_role` — parce que le rôle qui applique les migrations n'est PAS membre de
--     supabase_admin et n'a donc pas le droit de modifier ses privilèges par défaut. Tenter
--     quand même ferait échouer tout le déploiement, pour un durcissement qui n'est de toute
--     façon pas à notre portée.
--
-- Ce qui reste hors de portée est signalé, pas passé sous silence : voir la remarque finale.
do $$
declare
  platform_role text;
  skipped text[] := '{}';
begin
  foreach platform_role in array array['postgres', 'supabase_admin']
  loop
    if not exists (select 1 from pg_roles where rolname = platform_role) then
      continue;
    end if;

    if not pg_has_role(current_user, platform_role, 'MEMBER') then
      skipped := skipped || platform_role;
      continue;
    end if;

    execute format(
      'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated',
      platform_role);
    execute format(
      'alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated',
      platform_role);
    execute format(
      'alter default privileges for role %I in schema public revoke all on functions from anon, authenticated',
      platform_role);
  end loop;

  if array_length(skipped, 1) > 0 then
    raise notice
      'Privilèges par défaut non modifiés pour % (droits insuffisants). Une table créée PAR CE RÔLE resterait ouverte : la migration de vérification reste le filet.',
      array_to_string(skipped, ', ');
  end if;
end;
$$;
