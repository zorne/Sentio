-- FOND-30 — activer et VÉRIFIER l'isolation par entreprise sur toutes les tables.
--
-- ⚠️ Point 1 des « huit points qu'on ne rattrape jamais ». Différer l'isolation pour « aller
-- plus vite » est le piège classique : le jour où on la rebranche, chaque lecture, chaque
-- écriture et chaque abonnement temps réel doit être repris, et on découvre des chemins d'accès
-- oubliés. C'est irrattrapable proprement (docs/10-securite-rgpd.md).
--
-- Chaque table active déjà RLS dans sa propre migration. Cette migration-ci est le FILET :
-- elle échoue le déploiement si une table publique existe sans RLS. Une table ajoutée demain
-- sans politique fera échouer la migration suivante, pas la revue de code.
--
-- C'est la moitié base de données de TEST-01. L'autre moitié — accès croisé refusé depuis
-- l'interface, l'appel direct, l'identifiant deviné et l'abonnement temps réel — se teste
-- depuis l'application.

do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception
      'Isolation manquante sur : %. Activer RLS dans la migration qui crée la table, jamais après.',
      unprotected;
  end if;
end;
$$;

-- Second filet : toute table portant tenant_id doit avoir au moins une politique. RLS active
-- sans politique verrouille la table (comportement voulu pour job, execution_event…), mais sur
-- une table client c'est presque toujours un oubli.
--
-- Trois tables font exception, et l'exception est DÉCLARÉE ici plutôt que subie : RLS active
-- sans aucune politique verrouille la table pour tout rôle client, ce qui est précisément la
-- posture voulue pour ce que le client ne doit jamais voir (docs/07-parcours-produit.md — jamais
-- la mécanique). Seul le serveur y accède.
--
--   job                — la file d'exécution est de la mécanique pure.
--   execution_event    — le journal contient le raisonnement ; le client en voit des projections.
--   diagnostic_session — la vitrine n'a AUCUN accès aux données client, et réciproquement
--                        (docs/02-architecture.md, les deux zones étanches).
--
-- Ajouter une table à cette liste doit être un geste conscient. C'est tout l'intérêt : une
-- quatrième table oubliée demain fera échouer ce déploiement.
do $$
declare
  server_only constant text[] := array['job', 'execution_event', 'diagnostic_session'];
  missing text;
begin
  select string_agg(t.relname, ', ' order by t.relname)
  into missing
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attname = 'tenant_id' and a.attnum > 0
  where n.nspname = 'public'
    and t.relkind = 'r'
    and not (t.relname = any (server_only))
    and not exists (select 1 from pg_policy p where p.polrelid = t.oid);

  if missing is not null then
    raise exception
      'Table(s) portant tenant_id sans aucune politique d''accès : %. Ajouter la politique, ou déclarer la table comme réservée au serveur dans cette migration.',
      missing;
  end if;
end;
$$;

-- Filet inverse : une table déclarée « réservée au serveur » qui gagnerait une politique un jour
-- doit sortir de la liste. Sinon la liste devient un mensonge, et le premier filet une passoire.
do $$
declare
  server_only constant text[] := array['job', 'execution_event', 'diagnostic_session'];
  contradictory text;
begin
  select string_agg(t.relname, ', ' order by t.relname)
  into contradictory
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = any (server_only)
    and exists (select 1 from pg_policy p where p.polrelid = t.oid);

  if contradictory is not null then
    raise exception
      'Table(s) déclarée(s) réservée(s) au serveur mais portant une politique : %. Retirer la déclaration.',
      contradictory;
  end if;
end;
$$;

-- Troisième filet : les tables réservées au serveur ne doivent porter AUCUN droit client.
-- RLS sans politique verrouille déjà la table, mais un GRANT accidentel plus un futur `using
-- (true)` suffirait à ouvrir la mécanique au client. On vérifie les deux couches, pas une seule.
do $$
declare
  leaked text;
begin
  select string_agg(distinct table_name, ', ' order by table_name)
  into leaked
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name in (
      'identity', 'capability_binding', 'job', 'execution_event',
      'provider_credential', 'provider_quota', 'diagnostic_session', 'recommendation'
    );

  if leaked is not null then
    raise exception
      'Droit client accordé sur une table réservée au serveur : %. Le client ne voit jamais la mécanique.',
      leaked;
  end if;

  raise notice 'OK  isolation vérifiée : RLS, politiques et droits cohérents.';
end;
$$;
