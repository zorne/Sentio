-- La trace de fraîcheur — un battement qui ne part plus ne laisse RIEN derrière lui.
--
-- ══ L'ANGLE MORT QUE CETTE MIGRATION FERME ══
--
-- Le planificateur échoue bruyamment quand le verdict est anormal (`.github/workflows/battement.yml`).
-- Mais **un workflow qui ne s'exécute pas n'échoue pas** : ce canal est structurellement aveugle à
-- sa propre absence. Trois façons de disparaître sans un mot, toutes déjà vues ailleurs :
--
--   · GitHub désactive un `schedule` après 60 jours sans activité sur le dépôt ;
--   · un secret tourné, expiré ou retiré ;
--   · la plateforme elle-même à l'arrêt.
--
-- Dans les trois cas il ne reste aucun workflow pour échouer. Il faut donc un signal **dont
-- l'arrêt est l'alerte** : une trace que le battement rafraîchit, et dont la péremption se
-- constate de l'extérieur.
--
-- ══ CE QUI L'ÉCRIT, ET POURQUOI CE CHEMIN-LÀ ══
--
-- La composition l'inscrit **à la toute fin** du cycle, une fois le verdict rendu. C'est le seul
-- point du programme qu'on n'atteint que si la chaîne entière a fonctionné : registre chargé,
-- reprise, approvisionnement, file vidée, réévaluation, progression, compteur, verdict. Une
-- exception n'importe où avant, et la trace ne bouge pas.
--
-- ⚠️ **Elle enregistre le passage, PAS le succès.** Un cycle anormal rafraîchit la trace : il a
-- bien eu lieu, et c'est le verdict qui dit ce qu'il vaut. Confondre les deux ferait dire à la
-- fraîcheur ce que le verdict dit déjà, et perdre ce qu'elle seule sait — que le battement bat.

create table public.dernier_battement (
  -- Une seule ligne, et la base le garantit plutôt que le code : `true` est la seule valeur que
  -- la contrainte accepte, donc le seul identifiant possible.
  seul       boolean primary key default true check (seul),
  passe_le   timestamptz not null default now(),
  verdict    text not null check (verdict in ('normal', 'anormal')),
  anomalies  jsonb not null default '[]'::jsonb check (jsonb_typeof(anomalies) = 'array')
);

alter table public.dernier_battement enable row level security;

-- Aucune politique, aucun droit : la fraîcheur du battement est de la mécanique d'exploitation.
-- Elle ne porte aucune entreprise — c'est même sa nature, elle vaut pour toute la flotte.

comment on table public.dernier_battement is
  'Quand le battement est passé pour la dernière fois, de bout en bout. Le signal dont l''ARRÊT '
  'est l''alerte : un planificateur qui ne s''exécute plus n''échoue pas, il se tait.';

create function public.inscrire_le_battement(p_verdict text, p_anomalies jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.dernier_battement (seul, passe_le, verdict, anomalies)
  values (true, now(), p_verdict, coalesce(p_anomalies, '[]'::jsonb))
  on conflict (seul) do update
    set passe_le = now(), verdict = excluded.verdict, anomalies = excluded.anomalies;
$$;

revoke execute on function public.inscrire_le_battement(text, jsonb) from public, authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Le septième signal — le battement s'est tu
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ **RIEN NE SE DÉCLENCHE TANT QUE LE PLANIFICATEUR N'EST PAS ARMÉ.** Aucune ligne veut dire
-- « aucun battement n'est jamais passé », ce qui est l'état voulu aujourd'hui : le cron est
-- désarmé exprès. Une surveillance qui s'alarmerait d'un silence qu'on a décidé apprendrait à
-- l'exploitant à ignorer ses propres alertes — et c'est le premier battement réussi qui l'arme,
-- sans que personne ait à y penser.
--
-- Ce signal est le jumeau interne du guetteur externe, et il ne le remplace pas : il vit dans la
-- base qu'il surveille. Si c'est elle qui tombe, il tombe avec elle — d'où le code de sortie 2 de
-- `scripts/surveiller.mjs`, et d'où le guetteur, qui, lui, est ailleurs.

create or replace function public.etat_de_sante(
  -- Une mission qui n'a pas bougé depuis ce délai n'attend plus rien : elle est bloquée. Deux
  -- heures laissent passer une cadence quotidienne normale et rattrapent un incident le matin.
  p_immobilite   interval default interval '2 hours',
  -- Un travail repris ce nombre de fois ne se reprendra pas tout seul la prochaine.
  p_reprises_max integer  default 3,
  -- Un quota consommé à ce point ne tiendra pas la période. On prévient avant l'arrêt, pas après.
  p_seuil_quota  numeric  default 0.85,
  -- Le battement passe toutes les dix minutes. Une heure, c'est six passages manqués : assez pour
  -- écarter un retard de plateforme, assez peu pour ne pas découvrir l'arrêt le lendemain.
  p_fraicheur    interval default interval '1 hour'
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
     and u.value::numeric / q.quota_limit >= p_seuil_quota

  union all

  -- ── 7. Le battement s'est tu. Rien n'échoue quand un planificateur cesse simplement de partir :
  --    c'est la seule panne qui ne produit aucun signal par elle-même.
  select 'alerte'::public.gravite_de_signal,
         'battement absent',
         'Aucun battement depuis plus de ' || p_fraicheur ||
           ' : le planificateur ne réveille plus personne, et il n''échoue pas pour autant.',
         round(extract(epoch from now() - b.passe_le) / 60)::numeric
    from public.dernier_battement b
   where b.passe_le < now() - p_fraicheur;
$$;

comment on function public.etat_de_sante(interval, integer, numeric, interval) is
  'Ce qui doit réveiller quelqu''un. Constate, n''envoie rien : c''est ce qui la rend éprouvable — '
  'on provoque une panne, on lit ce qu''elle dit.';

revoke execute on function public.etat_de_sante(interval, integer, numeric, interval) from public;

-- ⚠️ L'ancienne signature à trois paramètres est retirée : la laisser en place ferait cohabiter
-- deux états de santé, dont un aveugle au battement absent — et `surveiller.mjs`, qui appelle sans
-- argument, tomberait sur l'un ou l'autre selon la résolution de surcharge.
drop function public.etat_de_sante(interval, integer, numeric);
