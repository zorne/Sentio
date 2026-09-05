-- LADY-AL — « accepter » doit dire EXACTEMENT ce qui change.
--
-- ══ CE QUE LE DIRIGEANT LISAIT ══
--
--     « Julie se concentrerait plutôt sur ne retenir que les bonnes entreprises. »   [Accepter]
--
-- La phrase est juste, et elle ne suffit pas. Elle dit une INTENTION, pas une CONSÉQUENCE. Le
-- dirigeant ne sait ni ce qu'elle cessera de faire, ni ce qu'elle commencera, ni si elle gardera
-- le droit d'agir seule, ni s'il peut revenir en arrière.
--
-- On lui demande de valider un changement de rôle de son employée sur une phrase de résumé. C'est
-- le même défaut que « une action attend votre accord », un cran plus haut : ce n'est pas un
-- message qui part, c'est ce que fait son employée tous les jours.
--
-- ══ CE QUE CETTE FONCTION REND ══
--
-- La différence, terme à terme, entre la configuration ACTIVE et celle qui est proposée : ce
-- qu'elle gagne, ce qu'elle perd, ce qui ne bouge pas. Rien n'est calculé sur des mots — tout
-- vient des lignes de `lady_configuration` et de `lady_configuration_capability`.
--
-- ⚠️ `capacites_retirees` est la ligne la plus importante de cette fonction. Une configuration
-- **retranche** au périmètre (`20260815120003`) : ce qu'elle ne reprend pas est réellement retiré.
-- Ne pas le montrer laisserait un dirigeant accepter, sans le savoir, que son employée cesse de
-- faire quelque chose qu'elle faisait.
--
-- Réalise : LADY-AL

create function public.ce_que_change_la_proposition(p_tenant uuid, p_configuration uuid)
returns table (
  role_actuel        text,
  role_propose       text,
  autonomie_actuelle text,
  autonomie_proposee text,
  priorites_actuelles jsonb,
  priorites_proposees jsonb,
  capacites_ajoutees  text[],
  capacites_retirees  text[],
  capacites_gardees   text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with proposee as (
    select * from public.lady_configuration
     where id = p_configuration and tenant_id = p_tenant
  ),
  active as (
    select c.* from public.lady_configuration c, proposee p
     where c.tenant_id = p_tenant and c.employee_id = p.employee_id and c.active
  ),
  cap as (
    select 'proposee' as cote, y.name
      from proposee p
      join public.lady_configuration_capability x on x.configuration_id = p.id
      join public.capability y on y.id = x.capability_id
    union all
    select 'active', y.name
      from active a
      join public.lady_configuration_capability x on x.configuration_id = a.id
      join public.capability y on y.id = x.capability_id
  )
  select a.role, p.role,
         a.autonomie, p.autonomie,
         a.priorites, p.priorites,
         coalesce((select array_agg(name order by name) from cap
                    where cote = 'proposee'
                      and name not in (select name from cap where cote = 'active')), '{}'),
         coalesce((select array_agg(name order by name) from cap
                    where cote = 'active'
                      and name not in (select name from cap where cote = 'proposee')), '{}'),
         coalesce((select array_agg(distinct name order by name) from cap
                    where cote = 'proposee'
                      and name in (select name from cap where cote = 'active')), '{}')
    from proposee p, active a;
$$;

comment on function public.ce_que_change_la_proposition(uuid, uuid) is
  'La différence terme à terme entre ce que fait l''employée aujourd''hui et ce qu''elle ferait. '
  '⚠️ « capacites_retirees » est la ligne la plus importante : une configuration RETRANCHE au '
  'périmètre, et ne pas le montrer ferait accepter une perte sans le savoir.';

revoke execute on function public.ce_que_change_la_proposition(uuid, uuid) from public, authenticated, anon;
