-- LADY-D — `employee_definition` cesse d'être un métier et devient le **Lady Core**.
--
-- ══ CE QUI CHANGE, ET POURQUOI ══
--
-- La table portait `unique (profession, version)` : le MÉTIER était l'axe d'identité du noyau.
-- Autrement dit, le produit avait autant de noyaux que de métiers — exactement l'architecture que
-- `docs/adr/0029` déclare obsolète.
--
-- Il n'y a qu'un noyau. Il est versionné, et rien d'autre ne l'identifie.
--
-- ══ LES TROIS SENS QUE `profession` PORTAIT, ET CE QU'ILS DEVIENNENT ══
--
--   1. **l'identité du noyau** — supprimée : c'est la version qui identifie, et elle seule ;
--   2. **le rôle de Lady** — déplacé dans `lady_configuration.role`, où il est une SORTIE du
--      diagnostic (`20260815120003`) ;
--   3. **le gisement de missions** — d'où l'approvisionnement tire ses sujets. Ce sens-là est
--      réel et n'a jamais été un métier : la colonne est donc RENOMMÉE `gisement`, ce qui la
--      décrit enfin. Elle rejoindra `lady_configuration.role` à l'étape 7 du plan, quand le
--      runtime dérivera le travail des missions.
--
-- ══ LA BORNE QUI MANQUAIT ══
--
-- `20260815120003` refusait déjà d'activer une capacité qu'aucun moteur ne sert. C'était la borne
-- de la FORMULE, pas celle du noyau — et elle était annoncée comme provisoire. Le noyau porte
-- désormais `capacites` : ce qu'une Lady peut concevoir de faire, quelle que soit sa
-- configuration. Une configuration retranche dans cette liste ; elle n'y ajoute jamais.
--
-- Réalise : LADY-D

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Un seul noyau, identifié par sa version
-- ═════════════════════════════════════════════════════════════════════════════════════════════

alter table public.employee_definition
  drop constraint employee_definition_profession_version_key;

alter table public.employee_definition
  rename column profession to gisement;

alter table public.employee_definition
  add constraint employee_definition_version_unique unique (version);

comment on column public.employee_definition.gisement is
  'Où l''approvisionnement puise les sujets de mission (« commercial » → les prospects confiés '
  'par le client). Ce n''est PAS un métier : le rôle de Lady vit dans lady_configuration.role, '
  'et il est une sortie du diagnostic (adr/0029).';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Le noyau porte ce qu'il rend concevable
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Le verrou d'écriture de `20260729120006` refuse toute modification de cette table — c'est
-- l'invariant 1, et il ne se contourne pas à la légère. Ici on ne modifie pas une décision : on
-- ajoute une colonne et on l'alimente pour les versions déjà publiées, ce qu'un ALTER seul ne
-- sait pas faire. Le verrou est donc retiré le temps du remplissage, puis REPOSÉ à l'identique —
-- et jamais laissé tombé, car c'est ce qui protège l'ADN de tous les employés vendus.

alter table public.employee_definition
  add column capacites jsonb not null default '[]'::jsonb;

drop trigger employee_definition_immutable on public.employee_definition;

-- Le noyau v1 rend concevables les cinq actes déjà écrits. La liste vient de la base plutôt que
-- d'être recopiée : recopier, c'est se préparer à diverger.
update public.employee_definition
   set capacites = (select jsonb_agg(c.key order by c.key) from public.capability c)
 where capacites = '[]'::jsonb;

create trigger employee_definition_immutable
  before update or delete on public.employee_definition
  for each row execute function public.reject_dna_mutation();

alter table public.employee_definition
  add constraint employee_definition_capacites_tableau
    check (jsonb_typeof(capacites) = 'array' and jsonb_array_length(capacites) > 0);

comment on column public.employee_definition.capacites is
  'Ce qu''une Lady portant ce noyau peut CONCEVOIR de faire. Une configuration retranche dans '
  'cette liste ; elle n''y ajoute jamais (§11 de la vision).';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3. La borne réelle : une configuration ne dépasse jamais le noyau de son employé
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- Remplace la borne provisoire de `20260815120003`, qui ne regardait que la formule. Les deux
-- conditions tiennent maintenant ensemble : concevable PAR LE NOYAU, et servie PAR UN MOTEUR.
-- La première dit ce que Lady peut être ; la seconde, ce qu'elle peut faire aujourd'hui.

create or replace function public.capacite_dans_le_perimetre()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entreprise uuid;
  employe    uuid;
  formule    uuid;
  cle        text;
  concevable jsonb;
begin
  select c.tenant_id, c.employee_id into entreprise, employe
    from public.lady_configuration c where c.id = new.configuration_id;

  select key into cle from public.capability where id = new.capability_id;

  -- ── Borne 1 — le noyau. Ce que cette Lady peut concevoir, figé sur SA version d'ADN.
  select d.capacites into concevable
    from public.employee e
    join public.employee_definition d on d.id = e.employee_definition_id
   where e.id = employe;

  if concevable is null then
    raise exception
      'Capacité refusée : l''employé de cette configuration est introuvable. On ne construit pas '
      'une configuration sur un noyau qu''on ne connaît pas.';
  end if;

  if not (concevable ? cle) then
    raise exception
      'Capacité « % » hors du noyau : cette version de Lady ne la conçoit pas. Une configuration '
      'retranche au périmètre du noyau, elle ne l''étend jamais.', cle;
  end if;

  -- ── Borne 2 — la formule. Ce que Lady peut faire AUJOURD'HUI, moteur à l'appui.
  select p.id into formule
    from public.subscription s
    join public.plan p on p.id = s.plan_id
   where s.tenant_id = entreprise and s.status = 'active'
   limit 1;

  if formule is null then
    raise exception
      'Capacité refusée : cette entreprise n''a aucun abonnement actif, donc aucun périmètre. '
      'Une configuration ne se construit pas sur un périmètre supposé.';
  end if;

  if not exists (
    select 1 from public.capability_binding b
     where b.capability_id = new.capability_id and b.plan_id = formule
  ) then
    raise exception
      'Capacité « % » hors périmètre : aucun moteur ne la sert pour la formule de cette '
      'entreprise. Une configuration peut retrancher au périmètre, jamais l''étendre.', cle;
  end if;

  return new;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 4. La recommandation propose une CONFIGURATION, plus un métier
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Elle ne peut pas POINTER une configuration : la recommandation naît pendant le diagnostic,
-- avant qu'une entreprise et un employé existent. Elle porte donc la configuration **proposée**,
-- comme donnée — celle-là même que le moteur de calibrage produisait déjà et que personne
-- n'écrivait nulle part. Au recrutement, elle devient la version 1 de `lady_configuration`.
--
-- La règle d'honnêteté de `20260729120027` est conservée telle quelle : hors périmètre ⇒ aucune
-- proposition, et réciproquement. On ne recommande rien plutôt que mal.

alter table public.recommendation
  drop constraint recommendation_scope_honesty;

alter table public.recommendation
  drop column employee_definition_id;

alter table public.recommendation
  add column configuration_proposee jsonb;

alter table public.recommendation
  add constraint recommendation_scope_honesty
    check ((status = 'hors_perimetre') = (configuration_proposee is null)),
  add constraint recommendation_proposition_objet
    check (configuration_proposee is null or jsonb_typeof(configuration_proposee) = 'object');

comment on column public.recommendation.configuration_proposee is
  'La configuration que Sentio propose — rôle, priorités, capacités, autonomie. Devient la '
  'version 1 de lady_configuration au recrutement. Nulle si le besoin sort du périmètre.';
