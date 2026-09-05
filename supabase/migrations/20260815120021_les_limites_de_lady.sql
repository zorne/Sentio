-- LADY-W — deux garanties que le dirigeant garde en main, quoi qu'il arrive.
--
-- ══ LA QUESTION À LAQUELLE CE FICHIER RÉPOND ══
--
-- « Qu'est-ce qui empêche cet employé de prendre le contrôle de mon entreprise ? »
--
-- Le produit avait déjà beaucoup de réponses — périmètre de capacités, accord requis sur les
-- actions irréversibles, cible imposée par la mission, rôle jamais changé sans accord. Il en
-- manquait deux, et ce sont précisément les deux qui comptent le jour où quelque chose va mal.
--
-- ══ 1. LE CLIQUET D'AUTONOMIE ══
--
-- L'autonomie décide si un message part sans qu'une personne l'ait relu. C'est le réglage le
-- plus lourd de tout le produit. Jusqu'ici, **rien en base** n'empêchait une configuration de
-- l'augmenter : la prudence tenait à une valeur écrite dans un fichier TypeScript
-- (`composition.ts`, `autonomie: "confirm"`). Une ligne changée un jour de fatigue, une
-- proposition acceptée d'un clic, et un employé passait en « agit seul » sans que personne ne
-- l'ait voulu.
--
-- Désormais : **seul un geste explicite du dirigeant peut AUGMENTER l'autonomie.** Tout le reste
-- — recrutement, diagnostic, réévaluation sur résultats — peut la maintenir ou la réduire,
-- jamais la lever. Le cliquet ne tourne que dans un sens sans lui.
--
-- ⚠️ Et une v1 ne naît jamais en « auto » : au recrutement, personne n'a encore rien consenti.
--
-- ══ 2. L'ARRÊT ══
--
-- Il n'existait aucun moyen de dire « stop, maintenant ». Un dirigeant inquiet un dimanche soir
-- n'avait rien à actionner — et un produit qui ne s'arrête pas sur commande n'est pas un employé,
-- c'est un processus.
--
-- L'arrêt est posé **en base**, à trois endroits qui verrouillent trois choses différentes :
-- plus aucune mission ne s'ouvre, plus aucune mission en attente n'est prise, plus rien ne part.
-- Le mettre à un seul endroit laisserait passer ce que les deux autres retiennent.
--
-- Il n'y a **pas de reprise automatique**. Un arrêt qui se lève tout seul n'est pas un arrêt.
--
-- Réalise : LADY-W

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Le cliquet d'autonomie
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.niveau_d_autonomie(p_niveau text)
returns integer
language sql
immutable
as $$
  select case p_niveau
           when 'confirm' then 0
           when 'confirm_once' then 1
           when 'auto' then 2
         end;
$$;

comment on function public.niveau_d_autonomie(text) is
  'L''ordre des trois niveaux, en données. Sans lui, « plus autonome que » serait une comparaison '
  'de chaînes — donc « auto » < « confirm » par ordre alphabétique.';

create function public.l_autonomie_ne_monte_pas_toute_seule()
returns trigger
language plpgsql
as $$
declare
  active_niveau integer;
begin
  -- Le recrutement : personne n'a encore rien consenti. On ne naît pas en « agit seul ».
  if new.version = 1 and new.autonomie = 'auto' then
    raise exception
      'Configuration refusée : un employé ne peut pas être recruté en « agit seul ». '
      'Le dirigeant ne l''a pas encore vu travailler une seule fois.';
  end if;

  -- Un geste explicite du dirigeant, depuis son espace : c'est LA porte, et elle laisse tout
  -- passer. La tracer est le travail de `regler_l_autonomie` (`20260815120011`), qui publie une
  -- version datée et justifiée plutôt que de modifier une colonne.
  if new.declencheur = 'demande_client' then
    return new;
  end if;

  select public.niveau_d_autonomie(c.autonomie) into active_niveau
    from public.lady_configuration c
   where c.employee_id = new.employee_id and c.active;

  if active_niveau is null then
    return new;
  end if;

  if public.niveau_d_autonomie(new.autonomie) > active_niveau then
    raise exception
      'Configuration refusée : elle rendrait cet employé plus autonome (« % ») qu''il ne l''est '
      'aujourd''hui, et son déclencheur est « % ». Augmenter l''autonomie est un geste du '
      'dirigeant, jamais une conséquence d''un diagnostic ou d''une mesure.',
      new.autonomie, new.declencheur;
  end if;

  return new;
end;
$$;

create trigger lady_configuration_cliquet_d_autonomie
  before insert on public.lady_configuration
  for each row execute function public.l_autonomie_ne_monte_pas_toute_seule();

comment on function public.l_autonomie_ne_monte_pas_toute_seule() is
  'Le cliquet : rien ne rend un employé plus autonome sauf le dirigeant lui-même. Le reste peut '
  'le rendre plus prudent, jamais l''inverse.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. L'arrêt
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.employee
  add column en_pause_depuis timestamptz,
  add column pause_raison    text;

comment on column public.employee.en_pause_depuis is
  'Quand le dirigeant a arrêté son employé. Aucune reprise automatique : un arrêt qui se lève '
  'tout seul n''est pas un arrêt.';

create index employee_en_pause_idx on public.employee (tenant_id) where en_pause_depuis is not null;

create function public.mettre_en_pause(p_tenant uuid, p_employee uuid, p_raison text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deja timestamptz;
begin
  select e.en_pause_depuis into deja
    from public.employee e where e.tenant_id = p_tenant and e.id = p_employee;

  if not found then
    raise exception 'Employé introuvable pour cette entreprise : rien à arrêter.';
  end if;

  -- Un second arrêt ne réécrit pas la date du premier : c'est ce jour-là que le travail a cessé.
  if deja is not null then return deja; end if;

  update public.employee
     set en_pause_depuis = now(),
         pause_raison = nullif(trim(coalesce(p_raison, '')), '')
   where tenant_id = p_tenant and id = p_employee;

  -- Les missions déjà en file ne sont pas supprimées : elles attendent. Les effacer ferait
  -- perdre le travail préparé, et un arrêt n'est pas un renvoi.
  select e.en_pause_depuis into deja
    from public.employee e where e.tenant_id = p_tenant and e.id = p_employee;
  return deja;
end;
$$;

comment on function public.mettre_en_pause(uuid, uuid, text) is
  'Le dirigeant arrête son employé : plus aucune mission ne s''ouvre, plus aucune n''est prise, '
  'plus rien ne part. Ce qui était préparé attend — un arrêt n''est pas un renvoi.';

create function public.reprendre_le_travail(p_tenant uuid, p_employee uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.employee
     set en_pause_depuis = null, pause_raison = null
   where tenant_id = p_tenant and id = p_employee;

  if not found then
    raise exception 'Employé introuvable pour cette entreprise : rien à reprendre.';
  end if;
end;
$$;

revoke execute on function public.mettre_en_pause(uuid, uuid, text) from public;
revoke execute on function public.reprendre_le_travail(uuid, uuid) from public;

-- ── 2.a Plus aucune mission ne s'ouvre ───────────────────────────────────────────────────────
--
-- La condition est placée AVANT le quota et l'objectif : un employé arrêté doit rendre
-- « arrêté », pas « quota atteint ». Le motif rendu est ce que le dirigeant lira dans son
-- journal, et un motif exact vaut mieux qu'un motif vrai par accident.

create or replace function public.peut_ouvrir_une_mission(p_tenant uuid, p_employee uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s       public.subscription;
  plafond bigint;
  deja    bigint;
  arrete  timestamptz;
begin
  select e.en_pause_depuis into arrete
    from public.employee e where e.id = p_employee and e.tenant_id = p_tenant;

  if not found then
    return 'employe_inconnu';
  end if;

  if arrete is not null then
    return 'employe_arrete';
  end if;

  select * into s
    from public.subscription
   where tenant_id = p_tenant
     and status = 'active'
     and now() >= current_period_start
     and now() <  current_period_end;
  if not found then return 'pas_d_abonnement_actif'; end if;

  if not exists (
    select 1 from public.objective where tenant_id = p_tenant and state = 'actif'
  ) then
    if exists (select 1 from public.objective where tenant_id = p_tenant and state = 'atteint') then
      return 'objectif_atteint';
    elsif exists (select 1 from public.objective where tenant_id = p_tenant and state = 'retire') then
      return 'objectif_retire';
    end if;
    return 'aucun_objectif';
  end if;

  if exists (
    select 1 from public.approvisionnement
     where tenant_id = p_tenant
       and employee_id = p_employee
       and jour = (now() at time zone 'utc')::date
  ) then
    return 'deja_approvisionne_aujourdhui';
  end if;

  select quota_limit into plafond
    from public.plan_quota
   where plan_id = s.plan_id and metric = 'tasks_per_period';

  if plafond is not null then
    select count(*) into deja
      from public.task
     where tenant_id = p_tenant
       and created_at >= s.current_period_start
       and created_at <  s.current_period_end;
    if deja >= plafond then return 'quota_de_periode_atteint'; end if;
  end if;

  return 'ok';
end;
$$;

-- ── 2.b Plus rien ne part ────────────────────────────────────────────────────────────────────
--
-- ⚠️ La garde d'envoi ne connaît pas l'employé : elle raisonne par entreprise et par domaine
-- d'expédition. Tant qu'une entreprise n'a qu'un employé, « un employé de cette entreprise est
-- arrêté » et « cet employé-ci est arrêté » sont la même phrase. Le jour où plusieurs employés
-- coexisteront, cette garde refusera trop plutôt que trop peu — c'est le bon sens du refus, et
-- il faudra alors lui passer l'employé.

-- L'ancienne garde est renommée, pas réécrite : ses six conditions ont été éprouvées une par une
-- (`20260729120038`), et les recopier ici serait en tenir deux versions — donc, un jour, deux
-- réponses différentes à la même question. `peut_relancer` (`20260812120002`) appelle
-- `peut_envoyer` et hérite donc de l'arrêt sans être touchée.
alter function public.peut_envoyer(uuid, uuid, uuid, integer, integer)
  rename to peut_envoyer_hors_arret;

create function public.peut_envoyer(
  p_tenant uuid,
  p_lead uuid,
  p_domain uuid,
  p_envoyes_aujourdhui integer,
  p_plafond_formule integer
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.employee e
     where e.tenant_id = p_tenant and e.en_pause_depuis is not null
  ) then
    return 'employe_arrete';
  end if;

  return public.peut_envoyer_hors_arret(
    p_tenant, p_lead, p_domain, p_envoyes_aujourdhui, p_plafond_formule);
end;
$$;

comment on function public.peut_envoyer(uuid, uuid, uuid, integer, integer) is
  'La garde d''envoi, arrêt compris. L''arrêt du dirigeant passe AVANT toute autre condition : '
  'un employé arrêté ne doit pas rendre « plafond atteint », il doit rendre « arrêté ».';
