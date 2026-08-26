-- LADY-AH — ce que le client paie, et ce qu'il lui reste. Sans avoir à demander.
--
-- ══ POURQUOI CE N'EST PAS DU CONFORT ══
--
-- Le deuxième grief le plus répété dans les avis publics sur les produits concurrents, après la
-- qualité des messages, est l'**opacité** : prix qui n'apparaît qu'après un appel commercial,
-- coûts d'options imprévisibles, et — le plus cité de tous — des abonnements qu'on n'arrive pas à
-- résilier. Le sentiment décrit est toujours le même : ne pas savoir ce qu'on consomme.
--
-- Un dirigeant qui voit sa formule, ce qu'il a consommé et quand la période se remet à zéro n'a
-- plus à le demander. C'est peu de chose à écrire, et c'est exactement ce qui manque en face.
--
-- ══ D'OÙ VIENNENT LES CHIFFRES, ET POURQUOI PAS DE `usage_counter` ══
--
-- ⚠️ `usage_counter` ne reçoit que les **jetons d'inférence**. Les lignes
-- `outbound_messages_per_period` et `tasks_per_period` de `plan_quota` existent, mais **rien ne
-- les y écrit** : le plafond de missions est appliqué en comptant directement les lignes de
-- `task`, et le plafond de messages est passé en paramètre à la garde d'envoi.
--
-- Afficher un compteur que personne n'alimente afficherait zéro pour toujours. On compte donc
-- **les vraies lignes** — celles qui font foi de toute façon pour l'application du plafond.
--
-- Et on n'affiche **pas** les jetons d'inférence : c'est notre coût, pas le sujet du dirigeant.
-- Le lui montrer serait lui parler de notre mécanique (`docs/07`, jamais la mécanique).
--
-- Réalise : LADY-AH

create function public.abonnement_du_client(p_tenant uuid)
returns table (
  formule                    text,
  statut                     text,
  periode_finit_le           timestamptz,
  missions_utilisees         integer,
  missions_plafond           integer,
  messages_periode           integer,
  messages_plafond_periode   integer,
  messages_aujourdhui        integer,
  messages_plafond_jour      integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with abo as (
    select s.plan_id, s.status, s.current_period_start, s.current_period_end, p.tier
      from public.subscription s
      join public.plan p on p.id = s.plan_id
     where s.tenant_id = p_tenant
       and s.status = 'active'
       and now() >= s.current_period_start
       and now() <  s.current_period_end
     limit 1
  ),
  plafond as (
    select metric, quota_limit from public.plan_quota
     where plan_id = (select plan_id from abo)
  )
  select a.tier,
         a.status,
         a.current_period_end,
         -- Les missions ouvertes sur la période : le MÊME compte que celui qui applique le
         -- plafond (`peut_ouvrir_une_mission`). Deux façons de compter finiraient par diverger,
         -- et le client verrait « il reste 12 » pendant qu'on lui refuse la treizième.
         (select count(*)::integer from public.task t
           where t.tenant_id = p_tenant
             and t.created_at >= a.current_period_start
             and t.created_at <  a.current_period_end),
         (select quota_limit::integer from plafond where metric = 'tasks_per_period'),
         (select count(*)::integer from public.outbound_message m
           where m.tenant_id = p_tenant
             and m.sent_at >= a.current_period_start
             and m.sent_at <  a.current_period_end),
         (select quota_limit::integer from plafond where metric = 'outbound_messages_per_period'),
         (select count(*)::integer from public.outbound_message m
           where m.tenant_id = p_tenant and m.sent_at::date = current_date),
         (select quota_limit::integer from plafond where metric = 'outbound_messages_per_day')
    from abo a;
$$;

comment on function public.abonnement_du_client(uuid) is
  'La formule, ce qui a été consommé et quand la période repart. Compté sur les VRAIES lignes : '
  'usage_counter ne reçoit que les jetons d''inférence, et afficher un compteur que personne '
  'n''alimente afficherait zéro pour toujours.';

revoke execute on function public.abonnement_du_client(uuid) from public, authenticated, anon;
