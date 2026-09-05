-- LADY-O — l'état de santé : ce qui doit réveiller quelqu'un.
--
-- ══ POURQUOI CE N'EST PAS UN TABLEAU DE BORD ══
--
-- Un tableau de bord se regarde. Une alerte se subit. La différence n'est pas cosmétique : un
-- produit qu'on n'a pas le temps de surveiller **doit** venir chercher son exploitant, et lui
-- seulement quand il y a quelque chose à faire.
--
-- Aujourd'hui, si le moteur s'arrête, personne ne le sait. On l'apprendrait par un client
-- mécontent — ou pas du tout. Ce n'est pas théorique : un travail programmé a échoué 72 fois par
-- jour avant d'être remarqué (commit du 2026-08-15).
--
-- ══ CE QUE CETTE FONCTION EST, ET N'EST PAS ══
--
-- Elle **constate**, elle n'agit pas et n'envoie rien. Elle rend des lignes ; l'expédition est un
-- geste d'exploitation qui appartient à l'appelant — et au fondateur, tant que le service d'envoi
-- n'est pas branché (`docs/29`, partie II).
--
-- Cette séparation la rend éprouvable : on provoque une panne, on lit ce qu'elle dit. Une
-- fonction qui enverrait un courriel ne se testerait qu'en envoyant des courriels.
--
-- ⚠️ **Aucun seuil n'est en dur dans le code applicatif.** Ils vivent ici, en un seul endroit,
-- avec la raison de chacun écrite à côté. Un seuil sans raison est un seuil que personne n'osera
-- changer.
--
-- Réalise : CONF-07

create type public.gravite_de_signal as enum ('avertissement', 'alerte');

create function public.etat_de_sante(
  -- Une mission qui n'a pas bougé depuis ce délai n'attend plus rien : elle est bloquée. Deux
  -- heures laissent passer une cadence quotidienne normale et rattrapent un incident le matin.
  p_immobilite   interval default interval '2 hours',
  -- Un travail repris ce nombre de fois ne se reprendra pas tout seul la prochaine.
  p_reprises_max integer  default 3,
  -- Un quota consommé à ce point ne tiendra pas la période. On prévient avant l'arrêt, pas après.
  p_seuil_quota  numeric  default 0.85
)
returns table (
  gravite public.gravite_de_signal,
  sujet   text,
  detail  text,
  mesure  numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- ── 1. Le travail bloqué. C'est le signal le plus important : il veut dire qu'un client paie
  --    pour un employé qui n'avance plus, et que personne ne s'en est aperçu.
  select 'alerte'::public.gravite_de_signal,
         'missions immobiles',
         'Des missions sont verrouillées depuis plus de ' || p_immobilite ||
           ' : un exécutant s''est arrêté sans rendre son bail.',
         count(*)::numeric
    from public.job
   where locked_at is not null and locked_at < now() - p_immobilite
  having count(*) > 0

  union all

  -- ── 2. Le travail qui échoue en boucle. Un travail repris indéfiniment consomme du modèle et
  --    n'aboutit jamais — c'est la panne la plus coûteuse, et la plus silencieuse.
  select 'alerte'::public.gravite_de_signal,
         'travaux repris en boucle',
         'Des travaux ont été repris plus de ' || p_reprises_max ||
           ' fois : ils ne se termineront pas d''eux-mêmes.',
         count(*)::numeric
    from public.job
   where attempts > p_reprises_max
  having count(*) > 0

  union all

  -- ── 3. Les missions en échec. Elles ne se rejouent pas : quelqu'un doit les reprendre.
  select 'alerte'::public.gravite_de_signal,
         'missions en échec',
         'Des missions sont en échec et n''avancent plus sans intervention.',
         count(*)::numeric
    from public.task
   where state = 'failed'
  having count(*) > 0

  union all

  -- ── 4. Une demande d'accord qui dort. Lady s'arrête pour demander — c'est voulu — mais si
  --    personne ne répond, le client paie pour un employé à l'arrêt.
  select 'avertissement'::public.gravite_de_signal,
         'accords en attente',
         'Des actions attendent un accord depuis plus de ' || p_immobilite ||
           ' : Lady est à l''arrêt tant que personne ne tranche.',
         count(*)::numeric
    from public.approval
   where state = 'requested' and requested_at < now() - p_immobilite
  having count(*) > 0

  union all

  -- ── 5. L'enveloppe d'inférence. On prévient AVANT l'arrêt : découvrir le plafond au moment où
  --    il coupe, c'est le découvrir trop tard.
  select 'avertissement'::public.gravite_de_signal,
         'enveloppe d''inférence',
         'Le fournisseur « ' || provider_key || ' » a consommé ' ||
           round(100 * consumed::numeric / nullif(quota_limit, 0)) || ' % de son enveloppe.',
         round(consumed::numeric / nullif(quota_limit, 0), 3)
    from public.provider_quota
   where quota_limit > 0
     and now() between window_start and window_end
     and consumed::numeric / quota_limit >= p_seuil_quota

  union all

  -- ── 6. Le quota d'une entreprise. Même raison : un client qui atteint son plafond doit
  --    l'apprendre de nous, pas de son employé qui s'arrête.
  select 'avertissement'::public.gravite_de_signal,
         'quota d''entreprise',
         'Une entreprise a consommé ' ||
           round(100 * u.value::numeric / nullif(q.quota_limit, 0)) ||
           ' % de son quota « ' || u.metric || ' ».',
         round(u.value::numeric / nullif(q.quota_limit, 0), 3)
    from public.usage_counter u
    join public.subscription s on s.tenant_id = u.tenant_id and s.status = 'active'
    join public.plan_quota q on q.plan_id = s.plan_id and q.metric = u.metric
   where q.quota_limit > 0
     and now() between u.period_start and u.period_end
     and u.value::numeric / q.quota_limit >= p_seuil_quota;
$$;

comment on function public.etat_de_sante(interval, integer, numeric) is
  'Ce qui doit réveiller quelqu''un. Constate, n''envoie rien : c''est ce qui la rend éprouvable — '
  'on provoque une panne, on lit ce qu''elle dit.';

-- Réservée au serveur : l'état de santé agrège toutes les entreprises. Il dit combien de clients
-- ont des ennuis, ce qu'aucun client n'a à savoir.
revoke execute on function public.etat_de_sante(interval, integer, numeric) from public;
