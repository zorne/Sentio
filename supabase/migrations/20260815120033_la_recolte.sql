-- LADY-AI — la récolte : ce que le client veut voir, et qui dépend du RÔLE de son employée.
--
-- ══ LA DEMANDE, ET LE PIÈGE QU'ELLE CONTIENT ══
--
-- Le fondateur veut une pastille qui montre « les prospects qui ont répondu positivement ». Puis
-- il ajoute lui-même la nuance qui compte : *« chaque agent peut avoir un rôle différent, donc il
-- y aura des agents qui ne vont pas forcément envoyer des messages de prospection. »*
--
-- ⚠️ C'est exactement le piège que `adr/0029` existe pour éviter. Écrire « les prospects qui ont
-- répondu » dans le schéma ferait rentrer la PROSPECTION dans le noyau — et un employé qui reprend
-- les demandes entrantes n'aurait jamais rien à montrer là. On reviendrait à des agents
-- spécialisés par métier, par la porte de l'interface.
--
-- ══ CE QU'ON POSE À LA PLACE ══
--
-- Une **récolte** : les entreprises qui ont donné une SUITE, quel que soit le travail qui l'a
-- produite. Un rendez-vous et une vente sont des suites, quel que soit le rôle qui les a
-- déclenchés. La fonction ne connaît aucun métier ; c'est l'interface qui NOMME la récolte selon
-- le rôle — « ont répondu à votre prospection », « demandes reprises », « échéances tenues ».
--
-- ⚠️ Une simple réponse n'est pas une suite. « Merci, sans suite » est une réponse, et la compter
-- ici transformerait un refus poli en résultat — le premier chiffre auquel un dirigeant tient, et
-- le premier qu'il cesserait de croire.
--
-- Réalise : LADY-AI

create function public.recolte_du_client(p_tenant uuid, p_jours integer default 30)
returns table (
  entreprise   text,
  contact      text,
  quoi         text,
  valeur       numeric,
  quand        timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.company_name,
         l.contact_name,
         -- La vente prime sur le rendez-vous : une entreprise qui a signé n'est pas « en
         -- rendez-vous », et lui donner le plus petit des deux titres serait la rétrograder.
         case when bool_or(o.kind = 'sale') then 'a signé' else 'a donné un rendez-vous' end,
         coalesce(sum(o.value) filter (where o.kind = 'sale'), 0),
         max(o.recorded_at)
    from public.outcome o
    join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
    join public.lead l on l.tenant_id = t.tenant_id and l.id = t.subject_id
   where o.tenant_id = p_tenant
     and o.kind in ('meeting', 'sale')
     and t.subject_kind = 'lead'
     and o.recorded_at >= (current_date - (greatest(least(p_jours, 365), 1) - 1))::timestamptz
   group by l.id, l.company_name, l.contact_name
   order by max(o.recorded_at) desc
   limit 20;
$$;

comment on function public.recolte_du_client(uuid, integer) is
  'Les entreprises qui ont donné une SUITE — rendez-vous ou vente — quel que soit le travail qui '
  'l''a produite. La fonction ne connaît aucun métier : c''est l''interface qui nomme la récolte '
  'selon le rôle (adr/0029, le noyau ne se spécialise pas). Une simple réponse n''est pas une '
  'suite : « merci, sans suite » en est une.';

revoke execute on function public.recolte_du_client(uuid, integer) from public, authenticated, anon;
