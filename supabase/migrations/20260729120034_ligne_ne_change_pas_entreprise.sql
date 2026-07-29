-- FOND-30 (suite) — une ligne ne change jamais d'entreprise.
--
-- ⚠️ POURQUOI CETTE MIGRATION EXISTE.
--
-- Les politiques d'écriture disent toutes la même chose : `with check (is_tenant_member(tenant_id))`.
-- Lues vite, elles semblent interdire de déplacer une ligne d'une entreprise à une autre. Elles
-- ne l'interdisent pas : elles vérifient seulement que la valeur d'ARRIVÉE est une entreprise
-- dont l'utilisateur est membre. Une politique ne peut pas regarder l'ancienne valeur.
--
-- Le cas se produit dès qu'un utilisateur appartient à deux entreprises — un dirigeant qui en
-- possède deux, un consultant invité chez deux clients. Vérifié sur une vraie base avant cette
-- migration : ce compte pouvait faire passer son objectif de l'entreprise A à l'entreprise B
-- d'un simple `update`. Chiffres, mémoire et résultats changeaient de propriétaire.
--
-- Le rempart côté serveur existait déjà (`assertNoTenantOverride`, packages/db/src/repository.ts)
-- mais il ne couvre qu'un chemin : le nôtre. Le client parle à Postgres directement, et le jour
-- où un script de reprise écrira sans passer par le repository, il n'y aura plus rien.
--
-- La règle est donc posée là où personne ne la contourne, et pour TOUS les rôles — y compris le
-- rôle de service, qui ignore RLS mais pas les déclencheurs.
--
-- Seule exception concevable : une fusion d'entreprises. Elle n'existe pas au catalogue, et le
-- jour où elle existerait, elle devra être une opération explicite et journalisée — pas un
-- `update` de plus qui passe inaperçu.

create function public.reject_tenant_change()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception
      'Une ligne ne change jamais d''entreprise (%.% : % → %).',
      tg_table_schema, tg_table_name, old.tenant_id, new.tenant_id;
  end if;
  return new;
end;
$$;

-- Posé sur toute table portant l'entreprise, sans exception à retenir : une table oubliée serait
-- une porte ouverte, et se souvenir d'ajouter le déclencheur n'est pas une garantie.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.reject_tenant_change()',
      t.relname || '_tenant_immutable', t.relname);
  end loop;
end;
$$;

-- Filet, dans l'esprit de la migration 0029 : une table portant tenant_id sans ce déclencheur
-- fait échouer le déploiement. Le même contrôle est rejoué sur le schéma final par
-- supabase/tests/invariants.sql, qui voit aussi les tables ajoutées après cette migration.
do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (
      select 1 from pg_trigger g
      where g.tgrelid = c.oid and not g.tgisinternal
        and g.tgfoid = 'public.reject_tenant_change'::regproc);

  if unprotected is not null then
    raise exception
      'Table(s) portant tenant_id sans le verrou de changement d''entreprise : %.',
      unprotected;
  end if;

  raise notice 'OK  verrou posé : aucune ligne ne peut changer d''entreprise.';
end;
$$;
