-- LADY-T — ce que le travail a réellement produit, en chiffres bruts.
--
-- ══ POURQUOI CETTE COUCHE EXISTE SÉPARÉMENT ══
--
-- `avancement_vers_l_objectif` répond « où en suis-je ». Cette fonction-ci répond à une question
-- différente et plus utile pour décider : **où ça bloque**.
--
-- Un même retard peut avoir des causes opposées, et elles n'appellent pas la même correction :
--
--   · personne ne répond            → le message ou la cible sont à revoir ;
--   · beaucoup répondent, peu achètent → le ciblage laisse passer des entreprises hors offre ;
--   · rien n'a encore été envoyé    → il n'y a rien à corriger, il faut attendre.
--
-- Confondre les trois produirait une réévaluation qui déplace Lady au hasard. La fonction ne
-- tranche pas : elle rend les nombres, et le domaine décide (`packages/domain`, `releverDesResultats`).
--
-- ══ CE QU'ELLE NE FAIT PAS ══
--
-- ⚠️ Aucun taux n'est calculé ici quand le dénominateur est trop petit pour vouloir dire quelque
-- chose. « 1 réponse sur 2 envois = 50 % » est un chiffre vrai et une information fausse. Le
-- domaine reçoit les comptes bruts et décide lui-même s'ils suffisent.
--
-- Réalise : LADY-T

create function public.mesures_du_travail(p_tenant uuid)
returns table (
  missions_ouvertes  integer,
  missions_agies     integer,
  reponses           integer,
  rendez_vous        integer,
  ventes             integer,
  -- Part de l'horizon déjà écoulée, entre 0 et 1. C'est elle qui dit si un retard veut dire
  -- quelque chose : à 5 % d'un mois, aucun retard n'est un signal.
  part_ecoulee       numeric,
  ecart_de_rythme    numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with objectif as (
    select o.id, o.horizon_jours, o.created_at
      from public.objective o
     where o.tenant_id = p_tenant and o.state = 'actif'
     limit 1
  ),
  missions as (
    select t.id
      from public.task t join objectif o on t.objective_id = o.id
     where t.tenant_id = p_tenant
  ),
  -- « Agie » veut dire : une action a réellement été exécutée pour cette mission. Une mission
  -- ouverte mais jamais travaillée ne prouve rien sur la qualité du travail.
  agies as (
    select count(distinct e.task_id) as n
      from public.execution_event e
      join missions m on m.id = e.task_id
     where e.tenant_id = p_tenant and e.kind = 'action_executee'
  ),
  resultats as (
    select count(*) filter (where oc.kind = 'response') as reponses,
           count(*) filter (where oc.kind = 'meeting')  as rendez_vous,
           count(*) filter (where oc.kind = 'sale')     as ventes
      from public.outcome oc
      join missions m on m.id = oc.task_id
     where oc.tenant_id = p_tenant
  )
  select (select count(*) from missions)::integer,
         a.n::integer,
         r.reponses::integer,
         r.rendez_vous::integer,
         r.ventes::integer,
         round(
           least(
             greatest(extract(epoch from now() - o.created_at) / 86400, 0) / o.horizon_jours,
             1
           ), 3),
         (select ecart_de_rythme from public.avancement_vers_l_objectif(p_tenant))
    from objectif o cross join agies a cross join resultats r;
$$;

comment on function public.mesures_du_travail(uuid) is
  'Les nombres bruts de ce que le travail a produit. Ne tranche rien : un même retard peut venir '
  'du message, du ciblage, ou de rien du tout — et confondre les trois déplacerait Lady au hasard.';

revoke execute on function public.mesures_du_travail(uuid) from public;
