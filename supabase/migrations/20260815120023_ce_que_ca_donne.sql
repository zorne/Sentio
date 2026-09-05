-- LADY-Y — ce que ça donne, en chiffres que le dirigeant voit sans cliquer.
--
-- ══ CE QUE CE FICHIER REFUSE DE CALCULER ══
--
-- Il ne calcule **aucun taux**. Il rend des comptes, jour par jour, et un bilan. Le taux — et
-- surtout le droit de l'afficher — est décidé ailleurs (`packages/domain/src/statistiques.ts`),
-- parce que c'est une décision de produit, pas une opération arithmétique : « 1 réponse sur 2
-- envois = 50 % » est un chiffre vrai et une information fausse.
--
-- ⚠️ **Il n'y a pas de « taux de rétention » ici**, et ce n'est pas un oubli. La rétention mesure
-- des clients qui restent — Sentio n'en a pas encore un seul, et un employé n'a pas de taux de
-- rétention. Afficher un nombre sous ce nom reviendrait à inventer la métrique la plus
-- structurante du produit. Ce qui EST mesurable, et qui répond à la même question — « est-ce que
-- ça s'améliore ? » — c'est le taux de réponse jour après jour. C'est donc ce qui est rendu.
--
-- ══ POURQUOI UNE SÉRIE COMPLÈTE, TROUS COMPRIS ══
--
-- `generate_series` produit **tous** les jours de la fenêtre, y compris ceux sans travail. Une
-- courbe qui saute les jours vides est une courbe qui ment : elle relie lundi à jeudi en ligne
-- droite et donne à voir une progression continue là où il ne s'est rien passé pendant deux jours.
--
-- Réalise : LADY-Y

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Jour par jour
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.serie_quotidienne(p_tenant uuid, p_jours integer default 14)
returns table (
  jour        date,
  contactes   integer,
  reponses    integer,
  rendez_vous integer,
  ventes      integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with fenetre as (
    select generate_series(
             (current_date - (greatest(least(p_jours, 90), 1) - 1)),
             current_date,
             interval '1 day')::date as jour
  )
  select f.jour,
         (select count(*)::integer from public.outbound_message m
           where m.tenant_id = p_tenant and m.sent_at::date = f.jour),
         (select count(*)::integer from public.outcome o
           where o.tenant_id = p_tenant and o.kind = 'response' and o.recorded_at::date = f.jour),
         (select count(*)::integer from public.outcome o
           where o.tenant_id = p_tenant and o.kind = 'meeting' and o.recorded_at::date = f.jour),
         (select count(*)::integer from public.outcome o
           where o.tenant_id = p_tenant and o.kind = 'sale' and o.recorded_at::date = f.jour)
    from fenetre f
   order by f.jour;
$$;

comment on function public.serie_quotidienne(uuid, integer) is
  'Le travail jour par jour, TOUS les jours de la fenêtre — y compris ceux sans rien. Une courbe '
  'qui saute les jours vides relie lundi à jeudi en ligne droite et invente une progression.';

revoke execute on function public.serie_quotidienne(uuid, integer) from public;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Le bilan
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ `entreprises_engagees` compte des entreprises DISTINCTES, pas des issues. Une entreprise qui
-- répond, obtient un rendez-vous puis signe est **une** entreprise — la compter trois fois
-- gonflerait le seul chiffre auquel un dirigeant tient vraiment.

create function public.bilan_de_l_employe(p_tenant uuid, p_jours integer default 30)
returns table (
  depuis               date,
  contactes            integer,
  reponses             integer,
  rendez_vous          integer,
  ventes               integer,
  chiffre_affaires     numeric,
  entreprises_engagees integer,
  missions_agies       integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with borne as (
    select (current_date - (greatest(least(p_jours, 365), 1) - 1))::date as depuis
  )
  select b.depuis,
         (select count(*)::integer from public.outbound_message m
           where m.tenant_id = p_tenant and m.sent_at::date >= b.depuis),
         (select count(*)::integer from public.outcome o
           where o.tenant_id = p_tenant and o.kind = 'response' and o.recorded_at::date >= b.depuis),
         (select count(*)::integer from public.outcome o
           where o.tenant_id = p_tenant and o.kind = 'meeting' and o.recorded_at::date >= b.depuis),
         (select count(*)::integer from public.outcome o
           where o.tenant_id = p_tenant and o.kind = 'sale' and o.recorded_at::date >= b.depuis),
         (select coalesce(sum(o.value), 0) from public.outcome o
           where o.tenant_id = p_tenant and o.kind = 'sale' and o.recorded_at::date >= b.depuis),
         -- Une entreprise qui a donné une suite : un rendez-vous ou une vente. Une simple réponse
         -- n'en est pas une — « merci, sans suite » est une réponse.
         (select count(distinct t.subject_id)::integer
            from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant
             and o.kind in ('meeting', 'sale')
             and o.recorded_at::date >= b.depuis
             and t.subject_kind = 'lead'),
         (select count(distinct e.task_id)::integer from public.execution_event e
           where e.tenant_id = p_tenant and e.kind = 'action_executee'
             and e.created_at::date >= b.depuis)
    from borne b;
$$;

comment on function public.bilan_de_l_employe(uuid, integer) is
  'Le bilan de l''employé sur une fenêtre. « entreprises_engagees » compte des entreprises '
  'DISTINCTES : une qui répond, obtient un rendez-vous puis signe en reste une seule.';

revoke execute on function public.bilan_de_l_employe(uuid, integer) from public;
