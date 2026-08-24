-- Tests des invariants du schéma.
-- Réalise : TEST-01, TEST-05, TEST-08, TEST-09
--
-- Ces tests ne vérifient pas des colonnes : ils vérifient que les promesses du produit sont
-- MÉCANIQUEMENT tenues, y compris face à un futur chemin de code fautif. Chacun correspond à un
-- invariant de AGENTS.md ou à un critère de docs/13-verification.md.
--
-- Exécution : voir packages/db/tests/run.sh
--
-- Convention : chaque test échoue par `raise exception`, donc le fichier entier échoue au
-- premier problème. Un test qui « passe silencieusement » n'est pas un test.

\set ON_ERROR_STOP on

begin;

-- Jeu d'essai : deux entreprises distinctes, pour éprouver l'isolation.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.tenant (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Entreprise A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Entreprise B');

insert into public.tenant_member (tenant_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner');

-- Les formules et le réservoir d'identités viennent des migrations de seed : les tests
-- s'appuient sur les données RÉELLES du produit, pas sur un jeu d'essai parallèle qui pourrait
-- diverger sans qu'on s'en aperçoive.

-- ADN d'essai, en version 99 : la v1 est l'ADN RÉEL du produit, publié par la migration 0039.
-- Les tests ci-dessous tentent de le modifier et de le supprimer — on ne fait pas ça sur la
-- version que les employés vendus porteront, et une version d'essai laisse le vrai ADN évoluer
-- sans réécrire cette suite.
insert into public.employee_definition (id, gisement, version, dna, capacites) values
  ('dddddddd-0000-0000-0000-000000000001', 'commercial', 99, '{"perimetre": ["prospection"]}'::jsonb,
   '["relancer.prospect","qualifier.prospect"]'::jsonb);

-- Un employé recruté sur une identité prise dans le réservoir semé.
insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
select 'ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
       'dddddddd-0000-0000-0000-000000000001', id
from public.reserve_identity('commercial');

-- Une mission sert toujours un objectif (`20260815120002`) : il n'y a pas de travail « en
-- général ». L'objectif d'essai est donc posé avant la première mission, comme il le serait dans
-- un vrai parcours — le dirigeant déclare son but, puis son employé ouvre du travail pour lui.
insert into public.objective (id, tenant_id, metric, target_value, horizon) values
  ('0b1ec71f-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'chiffre_affaires', 5000, 'mois');

insert into public.task (id, tenant_id, employee_id, objective_id, subject_kind, subject_id) values
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'ffffffff-0000-0000-0000-000000000001', '0b1ec71f-0000-0000-0000-000000000001',
   'lead', gen_random_uuid());


-- ── Invariant 1 — l'ADN n'est jamais modifiable ─────────────────────────────────────────────
-- AGENTS.md invariant 1, docs/04-contextes-memoire.md « verrou d'écriture ».
-- C'est la garantie qu'un commercial reste commercial.
do $$
begin
  begin
    update public.employee_definition set dna = '{"perimetre": ["comptabilite"]}'::jsonb;
    raise exception 'ÉCHEC : l''ADN a pu être modifié.';
  exception when sqlstate 'P0001' then
    if position('immuable' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.employee_definition;
    raise exception 'ÉCHEC : l''ADN a pu être supprimé.';
  exception when sqlstate 'P0001' then
    if position('immuable' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK  invariant 1 — ADN immuable (modification et suppression refusées)';
end;
$$;


-- ── Invariant 3 — idempotence sur toute action à effet extérieur ────────────────────────────
-- AGENTS.md invariant 3, TEST-05 : un rejeu n'envoie jamais deux fois le même email.
do $$
begin
  insert into public.execution_event (tenant_id, task_id, employee_id, idempotency_key, kind)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
          'ffffffff-0000-0000-0000-000000000001', 'envoi-message-42', 'message_envoye');

  begin
    insert into public.execution_event (tenant_id, task_id, employee_id, idempotency_key, kind)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
            'ffffffff-0000-0000-0000-000000000001', 'envoi-message-42', 'message_envoye');
    raise exception 'ÉCHEC : le rejeu d''une action à effet extérieur a été accepté.';
  exception when unique_violation then
    null;
  end;

  -- Une autre entreprise peut porter la même clé : l'idempotence est par entreprise.
  insert into public.execution_event (tenant_id, idempotency_key, kind)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'envoi-message-42', 'message_envoye');

  raise notice 'OK  invariant 3 — idempotence (rejeu refusé, portée par entreprise)';
end;
$$;


-- ── Journal en ajout seul, et son unique chemin de purge ────────────────────────────────────
-- docs/03-modele-de-donnees.md : un journal réinscriptible ne prouve rien.
do $$
declare
  purged bigint;
begin
  begin
    update public.execution_event set kind = 'autre';
    raise exception 'ÉCHEC : le journal a pu être modifié.';
  exception when sqlstate 'P0001' then
    if position('ajout seul' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.execution_event;
    raise exception 'ÉCHEC : le journal a pu être supprimé hors purge.';
  exception when sqlstate 'P0001' then
    if position('ajout seul' in sqlerrm) = 0 then raise; end if;
  end;

  -- La purge de rétention est le seul chemin autorisé (docs/adr/0012 — 30 jours).
  -- Un événement récent n'est pas purgé...
  select public.purge_execution_events(30) into purged;
  if purged <> 0 then
    raise exception 'ÉCHEC : un événement récent a été purgé (% lignes).', purged;
  end if;

  -- ...un événement plus vieux que la fenêtre l'est.
  insert into public.execution_event (tenant_id, kind, created_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'ancien', now() - interval '31 days');

  select public.purge_execution_events(30) into purged;
  if purged <> 1 then
    raise exception 'ÉCHEC : la purge a retiré % lignes au lieu de 1.', purged;
  end if;

  -- Une rétention nulle ou négative doit être refusée, jamais interprétée comme « tout purger ».
  begin
    perform public.purge_execution_events(0);
    raise exception 'ÉCHEC : une rétention de 0 jour a été acceptée.';
  exception when sqlstate 'P0001' then
    if position('invalide' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK  journal — ajout seul, purge à 30 jours, rétention nulle refusée';
end;
$$;


-- ── Aucun chiffre sans preuve : une évolution annoncée exige un changement enregistré ────────
-- AGENTS.md invariant 4, TEST-08. C'est le garde-fou contre le mensonge le plus tentant.
do $$
declare
  change_id uuid;
begin
  begin
    insert into public.notification (tenant_id, employee_id, kind, message)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
            'evolution', 'Carter a amélioré sa stratégie commerciale.');
    raise exception 'ÉCHEC : une évolution a pu être annoncée sans changement enregistré.';
  exception when check_violation then
    null;
  end;

  insert into public.strategy_change (tenant_id, employee_id, description)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
          'Relance décalée à J+4 : meilleur taux de réponse observé.')
  returning id into change_id;

  insert into public.notification (tenant_id, employee_id, kind, message, strategy_change_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
          'evolution', 'Carter a amélioré sa stratégie commerciale.', change_id);

  -- Symétrie : une notification de travail ne peut pas s'inventer une preuve d'évolution.
  begin
    insert into public.notification (tenant_id, employee_id, kind, message, strategy_change_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
            'travail', 'Carter a contacté trois entreprises.', change_id);
    raise exception 'ÉCHEC : une notification de travail porte une preuve d''évolution.';
  exception when check_violation then
    null;
  end;

  raise notice 'OK  invariant 4 — pas d''évolution annoncée sans strategy_change';
end;
$$;


-- ── Une vente est toujours déclarée par le client ───────────────────────────────────────────
-- docs/09-metriques-roi.md : Sentio ne se décerne jamais un chiffre d'affaires tout seul.
do $$
begin
  begin
    insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
            'sale', 4200, 'sentio');
    raise exception 'ÉCHEC : Sentio a pu déclarer une vente lui-même.';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.outcome (tenant_id, task_id, kind, declared_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
            'sale', 'client');
    raise exception 'ÉCHEC : une vente sans montant a été acceptée.';
  exception when check_violation then
    null;
  end;

  insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
          'sale', 4200, 'client');

  raise notice 'OK  attribution — une vente exige un montant et une déclaration du client';
end;
$$;


-- ── Réservation d'identité atomique et unicité globale ──────────────────────────────────────
-- projet.md §9 : une identité n'est jamais réutilisée, chaque employé est unique.
do $$
declare
  first_reserved public.identity;
  second_reserved public.identity;
begin
  select * into first_reserved from public.reserve_identity('commercial');
  if first_reserved.status <> 'taken' or first_reserved.taken_at is null then
    raise exception 'ÉCHEC : identité réservée sans statut ni date.';
  end if;

  select * into second_reserved from public.reserve_identity('commercial');
  if second_reserved.id = first_reserved.id then
    raise exception 'ÉCHEC : la même identité a été réservée deux fois.';
  end if;

  -- Réservoir épuisé : on échoue franchement plutôt que de rendre une identité déjà prise.
  -- Un métier sans réservoir est le cas le plus proche : c'est exactement ce qui arriverait le
  -- jour où un second métier serait vendu sans que son réservoir ait été garni.
  begin
    perform public.reserve_identity('metier_sans_reservoir');
    raise exception 'ÉCHEC : une identité a été servie pour un métier sans réservoir.';
  exception when sqlstate 'P0001' then
    if position('épuisé' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK  identités — réservation atomique, jamais deux fois la même';
end;
$$;


-- ── Le diagnostic reste honnête hors périmètre ──────────────────────────────────────────────
-- docs/adr/0008 : jamais la vente d'un employé incapable de faire le travail.
do $$
declare
  session_id uuid;
begin
  insert into public.diagnostic_session (visitor_fingerprint)
  values ('empreinte-test') returning id into session_id;

  begin
    -- Depuis `20260815120004`, la recommandation ne désigne plus un métier : elle porte la
    -- configuration PROPOSÉE. La règle d'honnêteté est la même — hors périmètre ⇒ rien de proposé.
    insert into public.recommendation
      (diagnostic_session_id, configuration_proposee, justification, status)
    values (session_id, '{"role":"prospection"}'::jsonb, 'Une Lady fera l''affaire.',
            'hors_perimetre');
    raise exception
      'ÉCHEC : une configuration a été proposée alors que le besoin est hors périmètre.';
  exception when check_violation then
    null;
  end;

  insert into public.recommendation (diagnostic_session_id, justification, status)
  values (session_id, 'Votre besoin porte sur la comptabilité, hors de ce que Sentio sait faire aujourd''hui.', 'hors_perimetre');

  raise notice 'OK  diagnostic — hors périmètre, aucune configuration proposée';
end;
$$;


-- ── TEST-01 — isolation par entreprise ──────────────────────────────────────────────────────
-- docs/13-verification.md. Le point qu'on ne rattrape jamais (point 1 sur 8).
do $$
declare
  visible integer;
begin
  set local role authenticated;

  -- Session du membre de l'entreprise A.
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  select count(*) into visible from public.tenant;
  if visible <> 1 then
    raise exception 'ÉCHEC : A voit % entreprises au lieu de la sienne seule.', visible;
  end if;

  select count(*) into visible from public.employee;
  if visible <> 1 then
    raise exception 'ÉCHEC : A voit % employés au lieu de 1.', visible;
  end if;

  -- Identifiant deviné : connaître l'identifiant de B n'est pas une autorisation
  -- (docs/10-securite-rgpd.md — « aucun accès par URL devinable »).
  select count(*) into visible from public.tenant
  where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if visible <> 0 then
    raise exception 'ÉCHEC : A atteint l''entreprise B par son identifiant.';
  end if;

  -- Session du membre de l'entreprise B : il ne voit rien de A.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  select count(*) into visible from public.employee;
  if visible <> 0 then
    raise exception 'ÉCHEC : B voit % employés de A.', visible;
  end if;

  select count(*) into visible from public.notification;
  if visible <> 0 then
    raise exception 'ÉCHEC : B voit % notifications de A.', visible;
  end if;

  -- Visiteur non authentifié : refusé au niveau des DROITS, avant même d'atteindre RLS.
  -- C'est une garantie plus forte qu'un résultat vide : la vitrine n'a aucun accès aux données
  -- client, elle n'a pas « accès à zéro ligne » (docs/02-architecture.md, zones étanches).
  set local role anon;
  begin
    select count(*) into visible from public.tenant;
    raise exception 'ÉCHEC : un visiteur anonyme a pu interroger les entreprises (% lignes).', visible;
  exception when insufficient_privilege then
    null;
  end;

  reset role;
  raise notice 'OK  TEST-01 — isolation (lecture, identifiant deviné, anonyme refusé aux droits)';
end;
$$;


-- ── Le journal et la file restent invisibles au client ──────────────────────────────────────
-- docs/07-parcours-produit.md : jamais la mécanique.
-- Deux couches doivent refuser : les droits (aucun grant) ET la RLS (aucune politique). On
-- vérifie la première ici — c'est celle qui échoue en premier, donc celle qui protège vraiment.
do $$
declare
  visible integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  begin
    select count(*) into visible from public.execution_event;
    raise exception 'ÉCHEC : le client a pu interroger le journal (% lignes).', visible;
  exception when insufficient_privilege then
    null;
  end;

  begin
    select count(*) into visible from public.job;
    raise exception 'ÉCHEC : le client a pu interroger la file (% lignes).', visible;
  exception when insufficient_privilege then
    null;
  end;

  -- Le réservoir d'identités n'est pas fermé de la même façon que le journal et la file, et la
  -- nuance compte (`20260815120012`). Le dirigeant doit voir QUI travaille pour lui : sa fiche
  -- d'employé sans nom n'a pas de sens. Ce qui reste interdit, c'est d'ÉNUMÉRER — le réservoir
  -- libre laisserait déduire combien d'employés Sentio a vendus, et les identités des autres
  -- entreprises n'ont jamais à être visibles.
  select count(*) into visible from public.identity where status = 'free';
  if visible <> 0 then
    raise exception
      'ÉCHEC : le client voit % identité(s) libre(s) — le réservoir global est énumérable.',
      visible;
  end if;

  select count(*) into visible
    from public.identity i
    join public.employee e on e.identity_id = i.id
   where e.tenant_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if visible <> 0 then
    raise exception
      'ÉCHEC : le client voit % identité(s) appartenant à une autre entreprise.', visible;
  end if;

  reset role;
  raise notice
    'OK  mécanique — journal et file hors d''atteinte, réservoir non énumérable';
end;
$$;


-- ── Une table ajoutée demain naît fermée ────────────────────────────────────────────────────
-- Le stub reproduit le défaut permissif de Supabase (voir supabase-stub.sql) : sans la
-- migration 030, la table créée ci-dessous serait immédiatement lisible par un visiteur.
do $$
declare
  leaked text;
begin
  create table public.table_creee_apres_coup (id uuid primary key default gen_random_uuid());

  select string_agg(distinct privilege_type, ', ' order by privilege_type)
  into leaked
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'table_creee_apres_coup'
    and grantee in ('anon', 'authenticated');

  if leaked is not null then
    raise exception
      'ÉCHEC : une table créée après les migrations reçoit des droits clients (%). Les droits par défaut ne sont pas neutralisés.',
      leaked;
  end if;

  raise notice 'OK  droits par défaut — une table ajoutée après coup naît inaccessible';
end;
$$;


-- ── Les formules sont des données, pas du code ──────────────────────────────────────────────
-- TEST-09 : activer Growth doit être une modification de données, sans déploiement ni
-- redémarrage (docs/13-verification.md).
do $$
declare
  vendables integer;
  quotas_start integer;
begin
  if (select count(*) from public.plan) <> 3 then
    raise exception 'ÉCHEC : les trois formules ne sont pas toutes en base.';
  end if;

  select count(*) into vendables from public.plan where commercialisable;
  if vendables <> 1 then
    raise exception 'ÉCHEC : % formules commercialisables au lieu de Start seule.', vendables;
  end if;

  -- Le seul geste nécessaire pour ouvrir Growth : un update.
  update public.plan set commercialisable = true where tier = 'growth';
  select count(*) into vendables from public.plan where commercialisable;
  if vendables <> 2 then
    raise exception 'ÉCHEC : ouvrir Growth par modification de données n''a pas fonctionné.';
  end if;

  -- La priorité d'exécution des formules supérieures est bien une donnée, pas une condition.
  if (select job_priority from public.plan where tier = 'growth')
     <= (select job_priority from public.plan where tier = 'start') then
    raise exception 'ÉCHEC : Growth n''a pas une priorité d''exécution supérieure à Start.';
  end if;

  select count(*) into quotas_start
  from public.plan_quota q join public.plan p on p.id = q.plan_id
  where p.tier = 'start';
  if quotas_start < 5 then
    raise exception 'ÉCHEC : Start ne porte que % quotas.', quotas_start;
  end if;

  raise notice 'OK  TEST-09 — formules en données, Growth ouvrable sans déploiement';
end;
$$;


-- ── Le réservoir d'identités est garni ──────────────────────────────────────────────────────
-- Un recrutement qui échoue faute d'identité est un paiement encaissé sans employé livré.
do $$
declare
  libres integer;
begin
  select count(*) into libres
  from public.identity where profession = 'commercial' and status = 'free';

  -- Trois identités ont été consommées par les tests précédents.
  if libres < 297 then
    raise exception 'ÉCHEC : seulement % identités libres.', libres;
  end if;

  raise notice 'OK  réservoir — % identités commerciales disponibles', libres;
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
--  DEUX PARCOURS COMPLETS, JOUÉS COMME LE CLIENT LES JOUERA
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- Les tests ci-dessus vérifient des invariants un par un, la plupart avec les droits du serveur.
-- Ceux qui suivent jouent une vie de client entière avec le rôle `authenticated` et un jeton —
-- exactement le chemin qu'emprunte l'interface, celui où une politique manquante se voit.
--
-- Deux formes d'entreprise, parce qu'elles n'éprouvent pas les mêmes choses :
--
--   INDIVIDUEL — un dirigeant seul. C'est le cas de vente du lancement. Il éprouve les droits
--   d'un membre unique : tout ce qu'il doit pouvoir faire, et tout ce qu'il ne doit pas.
--
--   GROUPE — plusieurs membres dans la même entreprise, dont un consultant présent chez deux
--   clients. Il éprouve ce que l'individuel ne peut pas montrer : le partage à l'intérieur d'une
--   entreprise, le retrait d'un membre, et la double appartenance — le seul cas où un même
--   compte est légitimement des deux côtés d'une frontière.


-- ── PARCOURS 1 — entreprise individuelle ────────────────────────────────────────────────────
-- Camille dirige seule. Elle recrute un employé, fixe son objectif, déclare une vente, corrige
-- sa mémoire d'entreprise, tranche une validation. Rien de plus, et rien de moins.

insert into auth.users (id) values ('0c000000-0000-0000-0000-0000000000c1');

insert into public.tenant (id, name) values
  ('c0000000-0000-0000-0000-00000000000c', 'Atelier Camille');

insert into public.tenant_member (tenant_id, user_id, role) values
  ('c0000000-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-0000000000c1', 'owner');

insert into public.subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
select 'c0000000-0000-0000-0000-00000000000c', id, 'active', now(), now() + interval '30 days'
from public.plan where tier = 'start';

insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
select '0c000000-0000-0000-0000-0000000000ce', 'c0000000-0000-0000-0000-00000000000c',
       'dddddddd-0000-0000-0000-000000000001', id
from public.reserve_identity('commercial');

insert into public.objective (id, tenant_id, metric, target_value, horizon) values
  ('0c000000-0000-0000-0000-0000000000c0', 'c0000000-0000-0000-0000-00000000000c',
   'chiffre_affaires', 5000, 'mois');

insert into public.task (id, tenant_id, employee_id, objective_id, subject_kind, subject_id) values
  ('0c000000-0000-0000-0000-0000000000ca', 'c0000000-0000-0000-0000-00000000000c',
   '0c000000-0000-0000-0000-0000000000ce', '0c000000-0000-0000-0000-0000000000c0',
   'lead', gen_random_uuid());

insert into public.notification (tenant_id, employee_id, kind, message) values
  ('c0000000-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-0000000000ce',
   'recrutement', 'Votre commercial a rejoint votre équipe.');

insert into public.approval (tenant_id, task_id) values
  ('c0000000-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-0000000000ca');

-- Un fait appris par l'employé : c'est la pièce que la cliente pourra contester, jamais réécrire.
insert into public.learned_fact (id, tenant_id, employee_id, fact, author) values
  ('0c000000-0000-0000-0000-0000000000cf', 'c0000000-0000-0000-0000-00000000000c',
   '0c000000-0000-0000-0000-0000000000ce', 'Les relances du mardi obtiennent plus de réponses.',
   'apprentissage');

do $$
declare
  visible integer;
  objectif_id uuid;
  passe boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '0c000000-0000-0000-0000-0000000000c1', true);

  -- ── Ce qu'elle voit : son entreprise, et le catalogue public des formules.
  select count(*) into visible from public.tenant;
  if visible <> 1 then raise exception 'ÉCHEC individuel : % entreprises visibles.', visible; end if;

  select count(*) into visible from public.employee;
  if visible <> 1 then raise exception 'ÉCHEC individuel : % employés visibles.', visible; end if;

  select count(*) into visible from public.subscription;
  if visible <> 1 then raise exception 'ÉCHEC individuel : % abonnements visibles.', visible; end if;

  select count(*) into visible from public.plan;
  if visible <> 3 then raise exception 'ÉCHEC individuel : % formules au catalogue.', visible; end if;

  -- ── Ce qu'elle fait : corriger son objectif — et ne pas pouvoir en empiler un second.
  --
  -- Depuis `20260815120002`, une entreprise n'a qu'UN objectif actif : c'est ce qui rend « quel
  -- objectif cette mission sert-elle » décidable. Un dirigeant ne pose donc pas un objectif de
  -- plus, il change le sien — ce que la politique lui permet déjà.
  select id into objectif_id from public.objective
   where tenant_id = 'c0000000-0000-0000-0000-00000000000c' and state = 'actif';
  if objectif_id is null then
    raise exception 'ÉCHEC individuel : la dirigeante ne voit pas son propre objectif.';
  end if;

  update public.objective set target_value = 6000 where id = objectif_id;
  if (select target_value from public.objective where id = objectif_id) <> 6000 then
    raise exception 'ÉCHEC individuel : l''objectif n''a pas été corrigé.';
  end if;

  -- Un second objectif actif est refusé PAR LA BASE. Sans ce refus, une mission ne saurait plus
  -- lequel des deux elle sert, et le rattachement redeviendrait une convention de tri.
  begin
    insert into public.objective (tenant_id, metric, target_value, horizon)
    values ('c0000000-0000-0000-0000-00000000000c', 'marges', 20, 'mensuel');
    raise exception 'ÉCHEC individuel : une entreprise a pu porter deux objectifs actifs.';
  exception when unique_violation then null;
  end;

  -- Poser un objectif chez quelqu'un d'autre : refusé par la politique, pas par l'interface.
  begin
    insert into public.objective (tenant_id, metric, target_value, horizon)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'chiffre_affaires', 1, 'mensuel');
    raise exception 'ÉCHEC individuel : un objectif a été posé chez une autre entreprise.';
  exception when insufficient_privilege then null;
  end;

  -- Supprimer : jamais. Aucun droit de suppression n'est accordé au client.
  begin
    delete from public.objective where id = objectif_id;
    raise exception 'ÉCHEC individuel : une suppression a été acceptée.';
  exception when insufficient_privilege then null;
  end;

  -- ── Ce qu'elle déclare : sa vente, et seulement la sienne.
  insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
  values ('c0000000-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-0000000000ca',
          'sale', 4200, 'client');

  -- Signer « sentio » un résultat qu'on déclare soi-même : refusé (docs/09-metriques-roi.md).
  begin
    insert into public.outcome (tenant_id, task_id, kind, declared_by)
    values ('c0000000-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-0000000000ca',
            'meeting', 'sentio');
    raise exception 'ÉCHEC individuel : un résultat a été signé « sentio » par le client.';
  exception when insufficient_privilege then null;
  end;

  -- Rattacher sa vente à la tâche d'une autre entreprise : refusé par la clé étrangère, qui
  -- porte désormais l'entreprise (migration 0033). La politique, elle, laissait passer.
  begin
    insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
    values ('c0000000-0000-0000-0000-00000000000c', '99999999-0000-0000-0000-000000000001',
            'sale', 9999, 'client');
    raise exception 'ÉCHEC individuel : une vente a été rattachée à la tâche d''une autre entreprise.';
  exception when foreign_key_violation then null;
  end;

  -- ── Sa notification : elle la lit, elle la marque comme lue.
  update public.notification set read_at = now()
  where tenant_id = 'c0000000-0000-0000-0000-00000000000c';
  if (select count(*) from public.notification where read_at is not null) <> 1 then
    raise exception 'ÉCHEC individuel : la notification n''a pas été marquée comme lue.';
  end if;

  -- ── Sa mémoire d'entreprise : elle écrit la sienne, elle retire celle de son employé.
  insert into public.company_profile (tenant_id, key, value, author)
  values ('c0000000-0000-0000-0000-00000000000c', 'secteur', '"menuiserie"'::jsonb, 'client');

  -- Signer « apprentissage » ce qu'on écrit soi-même : refusé à l'insertion.
  begin
    insert into public.company_profile (tenant_id, key, value, author)
    values ('c0000000-0000-0000-0000-00000000000c', 'cible', '"artisans"'::jsonb, 'apprentissage');
    raise exception 'ÉCHEC individuel : le client a signé « apprentissage » une ligne de mémoire.';
  exception when insufficient_privilege then null;
  end;

  -- Contester un fait appris = le retirer. Le texte reste lisible : on doit pouvoir expliquer
  -- ce que l'employé croyait au moment où il a agi (migration 0035).
  update public.learned_fact set status = 'retire'
  where id = '0c000000-0000-0000-0000-0000000000cf';
  if (select status from public.learned_fact where id = '0c000000-0000-0000-0000-0000000000cf')
     <> 'retire' then
    raise exception 'ÉCHEC individuel : le droit de contestation ne fonctionne pas.';
  end if;

  -- ⚠️ Un `raise exception` posé DANS le bloc serait attrapé par son propre gestionnaire : le
  -- déclencheur et l'échec de test portent tous deux le code P0001. On note donc le passage, et
  -- on échoue au-dehors. Le message est vérifié, sinon n'importe quelle erreur ferait « passer »
  -- le test.
  passe := false;
  begin
    update public.learned_fact set fact = 'Ce que je préfère lire.'
    where id = '0c000000-0000-0000-0000-0000000000cf';
    passe := true;
  exception when raise_exception then
    if position('ne se réécrit pas' in sqlerrm) = 0 then raise; end if;
  end;
  if passe then
    raise exception 'ÉCHEC individuel : un fait appris a été réécrit en place par le client.';
  end if;

  passe := false;
  begin
    update public.learned_fact set author = 'client'
    where id = '0c000000-0000-0000-0000-0000000000cf';
    passe := true;
  exception when raise_exception then
    if position('auteur' in sqlerrm) = 0 then raise; end if;
  end;
  if passe then
    raise exception 'ÉCHEC individuel : l''auteur d''une ligne de mémoire a été réécrit.';
  end if;

  -- ── Sa validation humaine : elle tranche (RGPD, décisions automatisées).
  update public.approval set state = 'granted', resolved_at = now()
  where tenant_id = 'c0000000-0000-0000-0000-00000000000c';
  if (select state from public.approval where tenant_id = 'c0000000-0000-0000-0000-00000000000c')
     <> 'granted' then
    raise exception 'ÉCHEC individuel : la validation humaine n''a pas été enregistrée.';
  end if;

  -- ── Ce qu'elle ne voit jamais : les autres entreprises, et la mécanique.
  select count(*) into visible from public.employee
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if visible <> 0 then raise exception 'ÉCHEC individuel : accès à l''employé d''une autre entreprise.'; end if;

  begin
    select count(*) into visible from public.execution_event;
    raise exception 'ÉCHEC individuel : accès au journal (% lignes).', visible;
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'OK  parcours individuel — un dirigeant seul fait tout son parcours, et rien d''autre';
end;
$$;


-- ── PARCOURS 2 — entreprise en groupe ───────────────────────────────────────────────────────
-- Trois membres dans la même entreprise, dont un consultant également membre de l'entreprise
-- individuelle ci-dessus. L'employé appartient à l'ENTREPRISE, pas à celui qui l'a recruté.

insert into auth.users (id) values
  ('0d000000-0000-0000-0000-0000000000d1'),   -- la dirigeante
  ('0d000000-0000-0000-0000-0000000000d2'),   -- un salarié
  ('0d000000-0000-0000-0000-0000000000d3');   -- un consultant, membre de deux entreprises

insert into public.tenant (id, name) values
  ('d0000000-0000-0000-0000-00000000000d', 'Groupe Duval');

insert into public.tenant_member (tenant_id, user_id, role) values
  ('d0000000-0000-0000-0000-00000000000d', '0d000000-0000-0000-0000-0000000000d1', 'owner'),
  ('d0000000-0000-0000-0000-00000000000d', '0d000000-0000-0000-0000-0000000000d2', 'member'),
  ('d0000000-0000-0000-0000-00000000000d', '0d000000-0000-0000-0000-0000000000d3', 'member'),
  -- Double appartenance : le consultant intervient aussi chez Camille.
  ('c0000000-0000-0000-0000-00000000000c', '0d000000-0000-0000-0000-0000000000d3', 'member');

insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
select '0d000000-0000-0000-0000-0000000000de', 'd0000000-0000-0000-0000-00000000000d',
       'dddddddd-0000-0000-0000-000000000001', id
from public.reserve_identity('commercial');

insert into public.objective (id, tenant_id, metric, target_value, horizon) values
  ('0d000000-0000-0000-0000-0000000000d0', 'd0000000-0000-0000-0000-00000000000d',
   'chiffre_affaires', 5000, 'mois');

insert into public.task (id, tenant_id, employee_id, objective_id, subject_kind, subject_id) values
  ('0d000000-0000-0000-0000-0000000000da', 'd0000000-0000-0000-0000-00000000000d',
   '0d000000-0000-0000-0000-0000000000de', '0d000000-0000-0000-0000-0000000000d0',
   'lead', gen_random_uuid());

do $$
declare
  visible integer;
  objectif_id uuid;
  passe boolean;
begin
  set local role authenticated;

  -- ── La dirigeante fixe l'objectif de l'entreprise.
  perform set_config('request.jwt.claim.sub', '0d000000-0000-0000-0000-0000000000d1', true);

  select count(*) into visible from public.tenant_member;
  if visible <> 3 then
    raise exception 'ÉCHEC groupe : la dirigeante voit % membres au lieu de 3.', visible;
  end if;

  -- L'entreprise porte déjà son unique objectif actif : la dirigeante le corrige, elle n'en
  -- empile pas un second (`20260815120002`). Ce que le salarié verra ensuite est donc bien la
  -- valeur écrite par un autre membre, sur le même objectif.
  select id into objectif_id from public.objective
   where tenant_id = 'd0000000-0000-0000-0000-00000000000d' and state = 'actif';
  update public.objective set target_value = 12000 where id = objectif_id;

  -- ── Le salarié voit le même employé et le même objectif : il n'a rien créé, il est membre.
  perform set_config('request.jwt.claim.sub', '0d000000-0000-0000-0000-0000000000d2', true);

  select count(*) into visible from public.employee;
  if visible <> 1 then
    raise exception 'ÉCHEC groupe : le salarié voit % employés au lieu de 1.', visible;
  end if;

  if (select target_value from public.objective where id = objectif_id) <> 12000 then
    raise exception 'ÉCHEC groupe : ce qu''écrit un membre n''est pas visible des autres.';
  end if;

  -- Il déclare une vente sur le travail de l'employé de l'entreprise.
  insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
  values ('d0000000-0000-0000-0000-00000000000d', '0d000000-0000-0000-0000-0000000000da',
          'sale', 3000, 'client');

  -- ── Le consultant est membre des deux entreprises : il voit les deux, et rien de plus.
  perform set_config('request.jwt.claim.sub', '0d000000-0000-0000-0000-0000000000d3', true);

  select count(*) into visible from public.tenant;
  if visible <> 2 then
    raise exception 'ÉCHEC groupe : le consultant voit % entreprises au lieu de ses 2.', visible;
  end if;

  select count(*) into visible from public.employee;
  if visible <> 2 then
    raise exception 'ÉCHEC groupe : le consultant voit % employés au lieu des 2 de ses clients.', visible;
  end if;

  select count(*) into visible from public.employee
  where tenant_id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
  if visible <> 0 then
    raise exception 'ÉCHEC groupe : le consultant atteint une entreprise dont il n''est pas membre.';
  end if;

  -- Le cas que la double appartenance rend possible, et que rien n'interdisait avant la
  -- migration 0034 : faire passer une ligne d'un client à l'autre. Les deux entreprises sont
  -- les siennes, la politique dit oui — le verrou dit non.
  passe := false;
  begin
    update public.objective set tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    where id = objectif_id;
    passe := true;
  exception when raise_exception then
    if position('ne change jamais d''entreprise' in sqlerrm) = 0 then raise; end if;
  end;
  if passe then
    raise exception 'ÉCHEC groupe : une ligne a changé d''entreprise.';
  end if;

  -- ── Un membre retiré perd l'accès immédiatement, sans redéploiement ni expiration de cache.
  reset role;
  delete from public.tenant_member
  where tenant_id = 'd0000000-0000-0000-0000-00000000000d'
    and user_id = '0d000000-0000-0000-0000-0000000000d2';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '0d000000-0000-0000-0000-0000000000d2', true);

  select count(*) into visible from public.tenant;
  if visible <> 0 then
    raise exception 'ÉCHEC groupe : un membre retiré voit encore % entreprise(s).', visible;
  end if;

  select count(*) into visible from public.employee;
  if visible <> 0 then
    raise exception 'ÉCHEC groupe : un membre retiré voit encore l''employé.';
  end if;

  -- Ce qu'il avait déclaré reste : la donnée appartient à l'entreprise, pas à lui.
  reset role;
  if (select count(*) from public.outcome
      where tenant_id = 'd0000000-0000-0000-0000-00000000000d') <> 1 then
    raise exception 'ÉCHEC groupe : le départ d''un membre a emporté une donnée de l''entreprise.';
  end if;

  raise notice 'OK  parcours groupe — partage interne, double appartenance, retrait immédiat';
end;
$$;


-- ── Droit à l'effacement — la procédure s'exécute vraiment ──────────────────────────────────
-- RGPD art. 17, et art. 5.2 pour la preuve. Un droit qu'on ne sait pas exercer le jour où on le
-- demande n'est pas un droit : on l'exerce donc ici, sur l'entreprise individuelle du parcours
-- précédent, qui porte de vraies données — objectif, vente, mémoire, notification, journal.
do $$
declare
  rapport jsonb;
  reste integer;
  contenu integer;
begin
  -- L'entreprise a bien quelque chose à effacer : sinon le test ne prouverait rien.
  select count(*) into contenu from public.company_profile
  where tenant_id = 'c0000000-0000-0000-0000-00000000000c';
  if contenu = 0 then
    raise exception 'ÉCHEC effacement : rien à effacer, le test ne prouve rien.';
  end if;

  insert into public.execution_event (tenant_id, task_id, employee_id, kind, payload, idempotency_key)
  values ('c0000000-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-0000000000ca',
          '0c000000-0000-0000-0000-0000000000ce', 'message_envoye',
          '{"destinataire": "prenom.nom@exemple.fr"}'::jsonb, 'envoi-effacement-1');

  select jsonb_object_agg(relation, lignes) into rapport
  from public.erase_tenant('c0000000-0000-0000-0000-00000000000c');

  -- Le compte-rendu est la preuve remise à la personne : il doit être renseigné.
  if rapport is null or (rapport ->> 'company_profile')::int = 0 then
    raise exception 'ÉCHEC effacement : compte-rendu vide (%).', rapport;
  end if;

  -- Plus rien de ce que le client a écrit ou reçu.
  select count(*) into reste from (
    select 1 from public.company_profile where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    union all select 1 from public.learned_fact where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    union all select 1 from public.objective where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    union all select 1 from public.lady_configuration where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    union all select 1 from public.outcome where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    union all select 1 from public.notification where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    union all select 1 from public.tenant_member where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
  ) restant;
  if reste <> 0 then
    raise exception 'ÉCHEC effacement : % ligne(s) de données client ont survécu.', reste;
  end if;

  -- Le journal survit, dépouillé : on sait qu'il s'est passé quelque chose, plus quoi.
  select count(*) into reste from public.execution_event
  where tenant_id = 'c0000000-0000-0000-0000-00000000000c';
  if reste = 0 then
    raise exception 'ÉCHEC effacement : le journal a été détruit au lieu d''être anonymisé.';
  end if;

  select count(*) into reste from public.execution_event
  where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
    and kind <> 'effacement'
    and (payload <> '{}'::jsonb or idempotency_key is not null);
  if reste <> 0 then
    raise exception 'ÉCHEC effacement : % ligne(s) de journal portent encore un contenu.', reste;
  end if;

  -- La preuve de l'effacement existe, et elle n'a pas été dépouillée avec le reste (art. 5.2).
  if not exists (
    select 1 from public.execution_event
    where tenant_id = 'c0000000-0000-0000-0000-00000000000c'
      and kind = 'effacement' and payload ? 'journal_depouille') then
    raise exception 'ÉCHEC effacement : aucune trace prouvant que l''effacement a eu lieu.';
  end if;

  -- Le nom de l'entreprise est une donnée : la ligne survit, le nom non.
  if (select name from public.tenant where id = 'c0000000-0000-0000-0000-00000000000c')
     not like 'Entreprise effacée%' then
    raise exception 'ÉCHEC effacement : le nom de l''entreprise a survécu.';
  end if;

  -- Ce qui fonde une facture reste : l'obligation comptable prime (art. 17.3.b).
  if (select count(*) from public.subscription
      where tenant_id = 'c0000000-0000-0000-0000-00000000000c') <> 1 then
    raise exception 'ÉCHEC effacement : l''abonnement a été effacé, la comptabilité ne tient plus.';
  end if;

  raise notice 'OK  effacement — données parties, journal dépouillé, preuve conservée';
end;
$$;


-- ── Le verrou du journal reste un verrou ────────────────────────────────────────────────────
-- L'effacement élargit le droit d'écrire sur le journal. C'est le geste risqué de la migration
-- 0036 : on vérifie donc que la porte ne s'ouvre que dans un sens.
do $$
declare
  passe boolean;
begin
  -- Sans le drapeau, aucune mise à jour, même vidante.
  passe := false;
  begin
    update public.execution_event set payload = '{}'::jsonb, idempotency_key = null
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    passe := true;
  exception when raise_exception then
    if position('ajout seul' in sqlerrm) = 0 then raise; end if;
  end;
  if passe then
    raise exception 'ÉCHEC : le journal a été modifié sans passer par la procédure d''effacement.';
  end if;

  -- Avec le drapeau, on peut dépouiller — mais pas réécrire l'histoire.
  passe := false;
  begin
    perform set_config('sentio.erasure', 'on', true);
    update public.execution_event set payload = '{}'::jsonb, idempotency_key = null,
                                      kind = 'autre chose'
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    passe := true;
  exception when raise_exception then
    if position('ajout seul' in sqlerrm) = 0 then raise; end if;
  end;
  perform set_config('sentio.erasure', 'off', true);
  if passe then
    raise exception 'ÉCHEC : la nature d''un événement a pu être réécrite sous couvert d''effacement.';
  end if;

  raise notice 'OK  journal — dépouillable par l''effacement, réécrivable par personne';
end;
$$;


-- ── La garde d'envoi — sept conditions, aucune facultative ──────────────────────────────────
-- `docs/adr/0017` : ne jamais délivrer un message qui pourrait brûler la réputation du client.
-- La règle n'est tenue que si chaque condition refuse SEULE. On les éprouve donc une par une, en
-- partant d'une situation qui échoue et en la réparant condition après condition — la dernière
-- ligne doit être « ok », sinon le test ne prouverait rien de ce qu'il prétend.
do $$
declare
  t constant uuid := 'e0000000-0000-0000-0000-00000000000e';
  emp constant uuid := 'e0000000-0000-0000-0000-0000000000ee';
  dom uuid;
  prospect uuid;
  verdict text;
begin
  insert into public.tenant (id, name) values (t, 'Entreprise prospection');
  insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
  select emp, t, 'dddddddd-0000-0000-0000-000000000001', id
  from public.reserve_identity('commercial');

  insert into public.sending_domain (tenant_id, domain) values (t, 'client.fr') returning id into dom;
  insert into public.lead (tenant_id, company_name, email, source)
  values (t, 'Prospect SARL', 'contact@prospect.fr', 'import_client') returning id into prospect;

  -- 1. Domaine non authentifié : rien ne part, quoi qu'il arrive par ailleurs.
  verdict := public.peut_envoyer(t, prospect, dom, 0, 30);
  if verdict <> 'domaine_non_authentifie' then
    raise exception 'ÉCHEC garde : domaine non authentifié accepté (%).', verdict;
  end if;

  update public.sending_domain
     set spf_verified_at = now(), dkim_verified_at = now(), dmarc_verified_at = now()
   where id = dom;

  -- 2. Montée en charge non commencée : authentifier ne suffit pas.
  verdict := public.peut_envoyer(t, prospect, dom, 0, 30);
  if verdict <> 'montee_en_charge_non_commencee' then
    raise exception 'ÉCHEC garde : envoi autorisé sans montée en charge (%).', verdict;
  end if;

  update public.sending_domain set warmup_started_on = current_date where id = dom;

  -- 3. Prospect non qualifié : une liste fournie n'est pas une liste propre (docs/adr/0016).
  verdict := public.peut_envoyer(t, prospect, dom, 0, 30);
  if verdict <> 'prospect_non_qualifie' then
    raise exception 'ÉCHEC garde : prospect non qualifié accepté (%).', verdict;
  end if;

  update public.lead set qualification = 'qualifie' where id = prospect;

  -- 4. Plafond du jour : le plus BAS des deux plafonds gagne. Le domaine a un jour d'âge, donc 5.
  verdict := public.peut_envoyer(t, prospect, dom, 5, 30);
  if verdict <> 'plafond_du_jour_atteint' then
    raise exception 'ÉCHEC garde : le plafond de montée en charge a été ignoré (%).', verdict;
  end if;
  verdict := public.peut_envoyer(t, prospect, dom, 3, 3);
  if verdict <> 'plafond_du_jour_atteint' then
    raise exception 'ÉCHEC garde : le plafond de la formule a été ignoré (%).', verdict;
  end if;

  -- 5. Tout est réuni : et seulement maintenant, l'envoi devient possible.
  verdict := public.peut_envoyer(t, prospect, dom, 0, 30);
  if verdict <> 'ok' then
    raise exception 'ÉCHEC garde : envoi refusé alors que tout est en règle (%).', verdict;
  end if;

  -- 6. Exclusion par domaine entier : préventive, vérifiée AVANT l'envoi.
  insert into public.suppression (tenant_id, pattern, kind)
  values (t, '@prospect.fr', 'exclusion');
  verdict := public.peut_envoyer(t, prospect, dom, 0, 30);
  if verdict <> 'destinataire_sur_liste_d_exclusion' then
    raise exception 'ÉCHEC garde : une exclusion par domaine a été ignorée (%).', verdict;
  end if;
  delete from public.suppression where tenant_id = t;

  -- 7. Suspension : elle prime sur tout le reste, même quand tout est en règle.
  update public.sending_domain
     set suspended_at = now(), suspension_reason = 'taux de rebond au-dessus de 2 %'
   where id = dom;
  verdict := public.peut_envoyer(t, prospect, dom, 0, 30);
  if verdict <> 'domaine_suspendu' then
    raise exception 'ÉCHEC garde : envoi autorisé sur un domaine suspendu (%).', verdict;
  end if;

  raise notice 'OK  garde d''envoi — sept conditions, chacune refuse seule';
end;
$$;


-- ── Ce que la prospection rend impossible ───────────────────────────────────────────────────
do $$
declare
  t constant uuid := 'e0000000-0000-0000-0000-00000000000e';
begin
  -- Un prospect sans origine : impossible. Donc rien à contacter sans savoir d'où vient la donnée.
  begin
    insert into public.lead (tenant_id, company_name, email, source)
    values (t, 'Sans origine', 'x@exemple.fr', '   ');
    raise exception 'ÉCHEC : un prospect sans origine a été accepté.';
  exception when check_violation then null;
  end;

  -- Un message sans moyen d'opposition ni information due : impossible à enregistrer, donc
  -- l'envoi ne peut pas être considéré comme fait.
  begin
    insert into public.outbound_message
      (tenant_id, lead_id, employee_id, sending_domain_id, subject,
       carried_optout, carried_notice, idempotency_key)
    select t, l.id, 'e0000000-0000-0000-0000-0000000000ee', d.id, 'Bonjour', false, true, 'k1'
    from public.lead l, public.sending_domain d
    where l.tenant_id = t and d.tenant_id = t limit 1;
    raise exception 'ÉCHEC : un message sans mention d''opposition a été enregistré.';
  exception when check_violation then null;
  end;

  -- Une suspension muette : impossible. Une suspension sans raison ne se lève jamais bien.
  begin
    update public.sending_domain set suspension_reason = null where tenant_id = t;
    raise exception 'ÉCHEC : une suspension sans raison a été acceptée.';
  exception when check_violation then null;
  end;

  raise notice 'OK  prospection — origine obligatoire, message toujours porteur de ses obligations';
end;
$$;


-- ── Filets structurels, appliqués au schéma FINAL ───────────────────────────────────────────
-- Les migrations 0033 et 0034 portent le même contrôle, mais chacune ne voit que les tables
-- existant à son propre instant. Ici, on regarde le schéma tel qu'il est après TOUTES les
-- migrations — c'est ce contrôle-ci qui attrapera la table ajoutée le mois prochain.
do $$
declare
  incomplete text;
  unprotected text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
  into incomplete
  from pg_constraint c
  join pg_class child on child.oid = c.conrelid
  join pg_namespace n on n.oid = child.relnamespace
  where c.contype = 'f'
    and n.nspname = 'public'
    and c.confrelid <> 'public.tenant'::regclass
    and exists (select 1 from pg_attribute a
                where a.attrelid = c.conrelid and a.attname = 'tenant_id' and a.attnum > 0)
    and exists (select 1 from pg_attribute a
                where a.attrelid = c.confrelid and a.attname = 'tenant_id' and a.attnum > 0)
    and not exists (select 1 from pg_attribute a
                    where a.attrelid = c.conrelid and a.attname = 'tenant_id'
                      and a.attnum = any (c.conkey));

  if incomplete is not null then
    raise exception
      'ÉCHEC : clé(s) étrangère(s) entre tables client sans l''entreprise dans la clé : %.',
      incomplete;
  end if;

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
      'ÉCHEC : table(s) portant tenant_id sans le verrou de changement d''entreprise : %.',
      unprotected;
  end if;

  raise notice 'OK  filets structurels — clés étrangères et verrou d''entreprise sur tout le schéma';
end;
$$;


-- ── METIER-24 — publier un profil sectoriel n'abîme jamais les versions déjà publiées ────────
-- La garantie tient en une phrase : un employé figé sur une version continue de lire CETTE
-- version, quoi qu'on publie ensuite. Tout le reste du bloc n'est là que pour la défendre par
-- la négative — c'est-à-dire en essayant vraiment de la casser.
do $$
declare
  version_publiee integer;
  contenu         jsonb;
  lignes          integer;
begin
  -- La version est calculée par la base, jamais déclarée par l'appelant.
  version_publiee := public.publier_profil_sectoriel(
    'boulangerie',
    jsonb_build_object('secteur', 'boulangerie',
                       'vocabulaire', jsonb_build_array('fournée', 'levain')));
  if version_publiee <> 1 then
    raise exception 'ÉCHEC : première publication numérotée % au lieu de 1.', version_publiee;
  end if;

  version_publiee := public.publier_profil_sectoriel(
    'boulangerie',
    jsonb_build_object('secteur', 'boulangerie',
                       'vocabulaire', jsonb_build_array('fournée', 'levain', 'pousse')));
  if version_publiee <> 2 then
    raise exception 'ÉCHEC : seconde publication numérotée % au lieu de 2.', version_publiee;
  end if;

  -- LE test : la v1 est-elle intacte après publication de la v2 ?
  select content into contenu
    from public.sector_profile where sector = 'boulangerie' and version = 1;
  if contenu -> 'vocabulaire' <> jsonb_build_array('fournée', 'levain') then
    raise exception 'ÉCHEC : publier une v2 a modifié la v1 — le figeage ne tient pas.';
  end if;

  -- Et une version publiée reste immuable, comme l'ADN.
  begin
    update public.sector_profile set content = '{}'::jsonb
     where sector = 'boulangerie' and version = 1;
    raise exception 'ÉCHEC : une version publiée a pu être modifiée.';
  exception when sqlstate 'P0001' then
    if position('immuable' in sqlerrm) = 0 then raise; end if;
  end;

  -- La vue rend une seule ligne par secteur, et c'est la plus récente.
  select count(*) into lignes
    from public.sector_profile_courant where sector = 'boulangerie';
  if lignes <> 1 then
    raise exception 'ÉCHEC : la vue rend % lignes pour un secteur au lieu d''une seule.', lignes;
  end if;

  select content into contenu
    from public.sector_profile_courant where sector = 'boulangerie';
  if jsonb_array_length(contenu -> 'vocabulaire') <> 3 then
    raise exception 'ÉCHEC : la vue courante ne rend pas la dernière version publiée.';
  end if;

  -- Un secteur inconnu s'ajoute sans rien demander à personne, et repart à 1.
  version_publiee := public.publier_profil_sectoriel(
    'plomberie', jsonb_build_object('secteur', 'plomberie'));
  if version_publiee <> 1 then
    raise exception
      'ÉCHEC : un secteur neuf démarre à la version % au lieu de 1.', version_publiee;
  end if;

  -- ── Ce que la base doit refuser, exactement comme parseSectorKnowledge le refuse ──────────
  begin
    perform public.publier_profil_sectoriel(
      'boulangerie', jsonb_build_object('vocabulaire', jsonb_build_array('levain')));
    raise exception 'ÉCHEC : un profil sans secteur a été accepté.';
  exception when sqlstate 'P0001' then
    if position('le secteur est obligatoire' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.publier_profil_sectoriel(
      'boulangerie',
      jsonb_build_object('secteur', 'boulangerie', 'vocabulaire', 'pas une liste'));
    raise exception 'ÉCHEC : un vocabulaire qui n''est pas une liste a été accepté.';
  exception when sqlstate 'P0001' then
    if position('liste de textes' in sqlerrm) = 0 then raise; end if;
  end;

  -- Le cas qu'une vérification paresseuse laisse passer : la liste existe, mais un élément
  -- n'est pas un texte.
  begin
    perform public.publier_profil_sectoriel(
      'boulangerie',
      jsonb_build_object('secteur', 'boulangerie', 'angles', jsonb_build_array('prix', 42)));
    raise exception 'ÉCHEC : une liste contenant un nombre a été acceptée.';
  exception when sqlstate 'P0001' then
    if position('liste de textes' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.publier_profil_sectoriel(
      'boulangerie',
      jsonb_build_object('secteur', 'boulangerie', 'cycleAchat', jsonb_build_array('long')));
    raise exception 'ÉCHEC : un cycle d''achat non textuel a été accepté.';
  exception when sqlstate 'P0001' then
    if position('doit être un texte' in sqlerrm) = 0 then raise; end if;
  end;

  -- La divergence que le code seul ne peut pas voir : la colonne dit un métier, le contenu
  -- en dit un autre. La couche de contexte lit le contenu ; la requête filtre sur la colonne.
  begin
    insert into public.sector_profile (sector, version, content)
    values ('plomberie', 99, jsonb_build_object('secteur', 'boulangerie'));
    raise exception 'ÉCHEC : colonne et contenu ont pu désigner deux secteurs différents.';
  exception when sqlstate 'P0001' then
    if position('incohérent' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK  METIER-24 — publication versionnée, versions figées, contenu validé à l''écriture';
end;
$$;


-- ── METIER-12 — la garde de relance : trois conditions de plus, et aucune recopiée ───────────
-- Même exigence que pour la garde d'envoi : chaque condition doit refuser SEULE. On part d'une
-- situation en règle et on casse une chose à la fois.
do $$
declare
  t   constant uuid := 'e0000000-0000-0000-0000-00000000001a';
  emp constant uuid := 'e0000000-0000-0000-0000-00000000001b';
  dom      uuid;
  prospect uuid;
  premier  uuid;
  second   uuid;
  verdict  text;
begin
  insert into public.tenant (id, name) values (t, 'Entreprise relance');
  insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
  select emp, t, 'dddddddd-0000-0000-0000-000000000001', id
  from public.reserve_identity('commercial');

  insert into public.sending_domain (tenant_id, domain, spf_verified_at, dkim_verified_at,
                                     dmarc_verified_at, warmup_started_on)
  values (t, 'relance.fr', now(), now(), now(), current_date) returning id into dom;

  insert into public.lead (tenant_id, company_name, email, source, qualification)
  values (t, 'Prospect Relance SARL', 'contact@relance-prospect.fr', 'import_client', 'qualifie')
  returning id into prospect;

  -- 1. Relancer quelqu'un qu'on n'a jamais contacté n'est pas une relance : ce serait un premier
  --    message qui contourne l'obligation d'annoncer l'origine de la donnée.
  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'aucun_message_a_relancer' then
    raise exception 'ÉCHEC relance : relance acceptée sans message initial (%).', verdict;
  end if;

  insert into public.outbound_message (tenant_id, lead_id, employee_id, sending_domain_id,
                                       subject, carried_optout, carried_notice, idempotency_key)
  values (t, prospect, emp, dom, 'Premier message', true, true, 'relance-test:1')
  returning id into premier;

  -- 2. L'espacement : un message parti à l'instant interdit la relance du jour.
  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'trop_tot_pour_relancer' then
    raise exception 'ÉCHEC relance : relance acceptée le jour même (%).', verdict;
  end if;

  update public.outbound_message set sent_at = now() - interval '5 days' where id = premier;

  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'ok' then
    raise exception 'ÉCHEC relance : première relance refusée alors que tout est en règle (%).', verdict;
  end if;

  -- 3. Une réponse arrête tout — constatée sur la fiche…
  update public.lead set status = 'repondu' where id = prospect;
  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'prospect_a_deja_repondu' then
    raise exception 'ÉCHEC relance : prospect ayant répondu relancé (fiche) (%).', verdict;
  end if;
  update public.lead set status = 'contacte' where id = prospect;

  -- … ou constatée sur le message. Un seul des deux chemins suffit à arrêter.
  update public.outbound_message set status = 'repondu' where id = premier;
  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'prospect_a_deja_repondu' then
    raise exception 'ÉCHEC relance : prospect ayant répondu relancé (message) (%).', verdict;
  end if;
  update public.outbound_message set status = 'envoye' where id = premier;

  -- 4. Le rang commande l'espacement, et il croît. Deux messages partis → rang 2 → sept jours.
  --    Le message initial recule pour que la chronologie reste possible : une relance ne peut pas
  --    être antérieure au message qu'elle relance, et l'espacement se compte depuis le DERNIER.
  update public.outbound_message set sent_at = now() - interval '15 days' where id = premier;

  insert into public.outbound_message (tenant_id, lead_id, employee_id, sending_domain_id,
                                       subject, carried_optout, carried_notice, idempotency_key,
                                       sent_at)
  values (t, prospect, emp, dom, 'Relance 1', true, true, 'relance-test:2',
          now() - interval '5 days')
  returning id into second;

  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'trop_tot_pour_relancer' then
    raise exception
      'ÉCHEC relance : la seconde relance a réutilisé l''espacement de la première (%).', verdict;
  end if;

  update public.outbound_message set sent_at = now() - interval '8 days' where id = second;
  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'ok' then
    raise exception 'ÉCHEC relance : seconde relance refusée après huit jours (%).', verdict;
  end if;

  -- 5. Deux relances, pas trois. C'est l'ADN qui le dit, pas une préférence.
  insert into public.outbound_message (tenant_id, lead_id, employee_id, sending_domain_id,
                                       subject, carried_optout, carried_notice, idempotency_key,
                                       sent_at)
  values (t, prospect, emp, dom, 'Relance 2', true, true, 'relance-test:3',
          now() - interval '20 days');

  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'relances_epuisees' then
    raise exception 'ÉCHEC relance : une troisième relance a été autorisée (%).', verdict;
  end if;

  -- 6. Et tout ce qui interdit un envoi interdit une relance, sans que ce soit réécrit ici.
  delete from public.outbound_message where tenant_id = t and idempotency_key = 'relance-test:3';
  update public.sending_domain
     set suspended_at = now(), suspension_reason = 'taux de plainte au-dessus du seuil'
   where id = dom;
  verdict := public.peut_relancer(t, prospect, dom, 0, 30);
  if verdict <> 'domaine_suspendu' then
    raise exception
      'ÉCHEC relance : relance autorisée sur un domaine suspendu — la garde d''envoi n''est pas consultée (%).',
      verdict;
  end if;

  raise notice 'OK  METIER-12 — garde de relance : réponse, rang, espacement, et les sept d''avant';
end;
$$;


-- ── METIER-15 — les variantes sont des données, et ce qui a tourné ne se réécrit pas ─────────
do $$
declare
  espace_4_7  uuid;
  espace_3_10 uuid;
begin
  select id into espace_4_7 from public.strategy_variant
   where profession = 'commercial' and kind = 'moment_de_relance' and key = 'espace_4_7';
  select id into espace_3_10 from public.strategy_variant
   where profession = 'commercial' and kind = 'moment_de_relance' and key = 'espace_3_10';

  -- 1. La cadence de relance se LIT dans la variante par défaut : c'est ce qui la rend
  --    ajustable sans redéploiement.
  if public.cadence_de_relance(1) <> 4 or public.cadence_de_relance(2) <> 7 then
    raise exception 'ÉCHEC variantes : la cadence par défaut ne vient pas de la variante (% puis %).',
      public.cadence_de_relance(1), public.cadence_de_relance(2);
  end if;

  -- Changer la variante par défaut change la cadence, sans toucher une ligne de code.
  update public.strategy_variant set par_defaut = false where id = espace_4_7;
  update public.strategy_variant set par_defaut = true  where id = espace_3_10;

  if public.cadence_de_relance(1) <> 3 or public.cadence_de_relance(2) <> 10 then
    raise exception
      'ÉCHEC variantes : changer la variante par défaut n''a pas changé la cadence (% puis %).',
      public.cadence_de_relance(1), public.cadence_de_relance(2);
  end if;

  -- Au-delà des rangs déclarés : NULL, et surtout aucun repli sur une valeur écrite en dur.
  if public.cadence_de_relance(3) is not null then
    raise exception 'ÉCHEC variantes : un rang non déclaré a reçu une cadence.';
  end if;

  update public.strategy_variant set par_defaut = false where id = espace_3_10;
  update public.strategy_variant set par_defaut = true  where id = espace_4_7;

  -- 2. Deux variantes par défaut pour un même genre rendraient le comportement dépendant de
  --    l'ordre de lecture. L'index unique partiel l'interdit.
  begin
    update public.strategy_variant set par_defaut = true where id = espace_3_10;
    raise exception 'ÉCHEC variantes : deux variantes par défaut ont coexisté.';
  exception when unique_violation then
    null;
  end;

  -- 3. Les leviers bougent : désactiver une variante est un geste normal.
  update public.strategy_variant set actif = false where id = espace_3_10;
  if exists (select 1 from public.strategy_variant where id = espace_3_10 and actif) then
    raise exception 'ÉCHEC variantes : une variante n''a pas pu être désactivée.';
  end if;
  update public.strategy_variant set actif = true where id = espace_3_10;

  -- 4. L'identité ne bouge pas : réécrire le contenu d'une variante déjà jouée réattribuerait
  --    des résultats mesurés à une stratégie qui n'a jamais tourné.
  begin
    update public.strategy_variant set content = '{"jours": [1, 2]}'::jsonb where id = espace_4_7;
    raise exception 'ÉCHEC variantes : le contenu d''une variante a pu être réécrit.';
  exception when sqlstate 'P0001' then
    if position('immuable' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.strategy_variant set key = 'autre_cle' where id = espace_4_7;
    raise exception 'ÉCHEC variantes : la clé d''une variante a pu être changée.';
  exception when sqlstate 'P0001' then
    if position('immuable' in sqlerrm) = 0 then raise; end if;
  end;

  -- 5. Et une variante ne se supprime pas : elle orphelinerait les résultats déjà mesurés.
  begin
    delete from public.strategy_variant where id = espace_3_10;
    raise exception 'ÉCHEC variantes : une variante a pu être supprimée.';
  exception when sqlstate 'P0001' then
    if position('se supprime pas' in sqlerrm) = 0 then raise; end if;
  end;

  -- 6. La vue des résultats compte des lignes réelles, et rend zéro tant qu'il n'y en a pas —
  --    jamais une estimation (AGENTS.md, invariant 4).
  if not exists (
    select 1 from public.strategy_variant_resultats
     where key = 'espace_4_7' and missions = 0 and ventes = 0 and chiffre_affaires = 0
  ) then
    raise exception 'ÉCHEC variantes : une variante sans mission ne rend pas des compteurs à zéro.';
  end if;

  raise notice 'OK  METIER-15 — cadence en données, identité figée, désactivation possible, résultats comptés';
end;
$$;


-- ── ACQUIS-16 — une adresse ne survit jamais à son consentement ──────────────────────────────
do $$
declare
  restantes integer;
  politiques integer;
  rls_active boolean;
begin
  -- 1. Le besoin s'enregistre seul. C'est le cas normal, pas le cas dégradé.
  insert into public.waiting_list_entry (besoin, secteur) values ('support_client', 'boulangerie');

  -- 2. Une adresse sans consentement daté ne peut pas exister — la règle est dans la table, pas
  --    dans la discipline de l'appelant.
  begin
    insert into public.waiting_list_entry (besoin, email) values ('juridique', 'a@b.fr');
    raise exception 'ÉCHEC liste d''attente : une adresse a été gardée sans consentement.';
  exception when check_violation then
    null;
  end;

  -- 3. Et l'inverse : un consentement sans adresse est une trace sans objet.
  begin
    insert into public.waiting_list_entry (besoin, consenti_le)
    values ('juridique', now());
    raise exception 'ÉCHEC liste d''attente : un consentement sans adresse a été accepté.';
  exception when check_violation then
    null;
  end;

  -- 4. Le couple complet passe.
  insert into public.waiting_list_entry (besoin, email, consenti_le)
  values ('comptabilite', 'dirigeant@entreprise.fr', now());

  -- 5. L'effacement retire l'adresse ET son consentement, mais conserve le besoin : une fois
  --    l'adresse partie, la ligne n'identifie plus personne et reste un signal produit.
  if public.oublier_une_adresse_de_liste_attente('DIRIGEANT@ENTREPRISE.FR') <> 1 then
    raise exception 'ÉCHEC liste d''attente : l''effacement n''a pas trouvé l''adresse.';
  end if;

  select count(*) into restantes
    from public.waiting_list_entry
   where email is not null or consenti_le is not null;
  if restantes <> 0 then
    raise exception 'ÉCHEC liste d''attente : % ligne(s) portent encore une adresse.', restantes;
  end if;

  select count(*) into restantes from public.waiting_list_entry where besoin = 'comptabilite';
  if restantes <> 1 then
    raise exception 'ÉCHEC liste d''attente : l''effacement a supprimé le besoin lui-même.';
  end if;

  -- 6. La table naît fermée : RLS active et AUCUNE politique. L'absence de politique est ici
  --    l'intention, pas un oubli — la vérifier empêche qu'on en ajoute une par réflexe.
  select c.relrowsecurity into rls_active
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'waiting_list_entry';
  if not rls_active then
    raise exception 'ÉCHEC liste d''attente : la table est ouverte, RLS n''est pas activée.';
  end if;

  select count(*) into politiques from pg_policies
   where schemaname = 'public' and tablename = 'waiting_list_entry';
  if politiques <> 0 then
    raise exception
      'ÉCHEC liste d''attente : % politique(s) exposent la table à un rôle applicatif.', politiques;
  end if;

  raise notice 'OK  ACQUIS-16 — besoin compté seul, adresse jamais sans consentement, table fermée';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-A — une capacité est un ACTE appliqué à un OBJET, et sa clé ne peut pas les contredire.
--
-- Ce que ces quatre refus protègent : la seule chose qui empêche la bibliothèque de redevenir un
-- catalogue de métiers est que l'acte ne nomme jamais son objet (`docs/adr/0029`). Une garantie
-- tenue par la relecture tombe ; celle-ci est tenue par la base.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  cle_lue    text;
  actes_avec_objet integer;
begin
  -- 1. La clé est ENGENDRÉE : la saisir est refusé. C'est ce qui rend impossible le cas classique
  --    où l'on renomme l'acte en oubliant la clé, et où les deux se contredisent en silence.
  begin
    insert into public.capability (acte, objet, name, contract, key)
    values ('relancer', 'facture', 'Relancer une facture', '{}'::jsonb, 'autre_chose');
    raise exception 'ÉCHEC capacité : une clé saisie à la main a été acceptée.';
  exception
    when generated_always then null;
  end;

  -- 2. Un acte s'applique à un nouvel objet sans qu'on écrive une capacité de plus. C'est
  --    l'intérêt entier de la séparation : `relancer` sert le prospect ET la facture.
  insert into public.capability (acte, objet, name, contract)
  values ('relancer', 'facture', 'Relancer une facture impayée', '{}'::jsonb);

  select key into cle_lue from public.capability where acte = 'relancer' and objet = 'facture';
  if cle_lue <> 'relancer.facture' then
    raise exception 'ÉCHEC capacité : clé engendrée « % », attendue « relancer.facture ».', cle_lue;
  end if;

  -- 3. La même chose ne peut pas être déclarée deux fois sous deux contrats différents.
  begin
    insert into public.capability (acte, objet, name, contract)
    values ('relancer', 'facture', 'Doublon', '{}'::jsonb);
    raise exception 'ÉCHEC capacité : (acte, objet) accepte un doublon.';
  exception
    when unique_violation then null;
  end;

  -- 4. Le séparateur n'appartient qu'à la clé. Toléré dans un axe, il rendrait
  --    « relancer » + « facture.impayee » et « relancer.facture » + « impayee » indiscernables.
  begin
    insert into public.capability (acte, objet, name, contract)
    values ('relancer.facture', 'impayee', 'Ambiguë', '{}'::jsonb);
    raise exception 'ÉCHEC capacité : un acte contenant le séparateur a été accepté.';
  exception
    when check_violation then null;
  end;

  -- 5. Et le socle : aucune des capacités livrées ne nomme son objet dans son acte.
  select count(*) into actes_avec_objet
    from public.capability
   where acte like '%_' || objet || '%' or acte like '%prospect%' or acte like '%message%';
  if actes_avec_objet <> 0 then
    raise exception
      'ÉCHEC capacité : % acte(s) portent encore leur objet dans leur nom.', actes_avec_objet;
  end if;

  raise notice 'OK  LADY-A — acte × objet, clé engendrée, doublon et séparateur refusés';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-B — aucune mission ne s'ouvre sans objectif, et une entreprise n'en a qu'un actif.
--
-- Le risque que ces refus ferment est écrit dans `docs/28` §6 : « des tâches sans objectif ».
-- Il n'était pas théorique — il était réalisé, `task` ne portant aucun lien vers `objective`.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  objectif_ancien uuid;
  restant integer;
begin
  -- 1. Une mission sans objectif est refusée à la naissance, même insérée à la main.
  begin
    insert into public.task (tenant_id, employee_id, subject_kind, subject_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
            'lead', gen_random_uuid());
    raise exception 'ÉCHEC mission : une mission sans objectif a été ouverte.';
  exception
    when raise_exception then
      if position('sans objectif' in sqlerrm) = 0 then raise; end if;
  end;

  -- 2. Un second objectif actif est refusé : sans ça, « quel objectif cette mission sert-elle »
  --    redeviendrait indécidable, et le rattachement une convention de tri (EXEC-16).
  begin
    insert into public.objective (tenant_id, metric, target_value, horizon)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'marges', 20, 'mois');
    raise exception 'ÉCHEC mission : deux objectifs actifs coexistent dans une entreprise.';
  exception when unique_violation then null;
  end;

  -- 3. Changer d'objectif reste possible — on retire l'ancien, on en pose un neuf — et les
  --    missions déjà ouvertes gardent le leur. C'est ce qui rend l'histoire relisible.
  select id into objectif_ancien from public.objective
   where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and state = 'actif';

  update public.objective set state = 'retire' where id = objectif_ancien;

  insert into public.objective (tenant_id, metric, target_value, horizon)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'marges', 20, 'mois');

  if (select objective_id from public.task
       where id = '99999999-0000-0000-0000-000000000001') <> objectif_ancien then
    raise exception
      'ÉCHEC mission : une mission a changé d''objectif toute seule au moment du remplacement.';
  end if;

  -- 4. Une mission ne peut pas emprunter l'objectif d'une AUTRE entreprise : la clé étrangère
  --    porte l'entreprise (`20260729120033`), donc le lien ne peut pas traverser.
  -- L'entreprise de groupe est intacte ici — celle du parcours individuel a été effacée plus
  -- haut, et ses objectifs avec elle. Viser une entreprise effacée aurait rendu NULL, donc
  -- détaché la mission au lieu de prouver l'étanchéité : le test n'aurait rien testé.
  begin
    update public.task
       set objective_id = (select id from public.objective
                            where tenant_id = 'd0000000-0000-0000-0000-00000000000d' limit 1)
     where id = '99999999-0000-0000-0000-000000000001';
    raise exception 'ÉCHEC mission : une mission pointe l''objectif d''une autre entreprise.';
  exception when foreign_key_violation then null;
  end;

  -- 5. Et le lien survit à ce qui compte : supprimer l'objectif détache la mission sans
  --    l'effacer, parce que le journal la référence et doit rester ancré.
  select count(*) into restant from public.task
   where id = '99999999-0000-0000-0000-000000000001';
  if restant <> 1 then
    raise exception 'ÉCHEC mission : la mission a disparu au cours du test.';
  end if;

  raise notice 'OK  LADY-B — mission sans objectif refusée, un seul objectif actif, lien étanche';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-C — une configuration est une VERSION justifiée, et elle ne peut que retrancher.
--
-- Les trois questions que ce bloc rend décidables, et qui étaient sans réponse avant lui :
-- pourquoi Lady a changé, quand, et ce qu'il y avait avant.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise  constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe     constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  v1          uuid;
  v2          uuid;
  autre_conf  uuid;
  hors_perim  uuid;
  dans_perim  uuid;
begin
  -- Un périmètre suppose une formule : sans abonnement actif, aucune capacité n'est activable.
  if not exists (select 1 from public.subscription
                  where tenant_id = entreprise and status = 'active') then
    insert into public.subscription (tenant_id, plan_id, status,
                                     current_period_start, current_period_end)
    select entreprise, p.id, 'active', now() - interval '1 day', now() + interval '29 days'
      from public.plan p where p.tier = 'start';
  end if;

  -- ── 1. La v1 naît sans passé. Prétendre le contraire est refusé.
  begin
    insert into public.lady_configuration
      (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id)
    values (entreprise, employe, 1, 'relation_client', 'confirm', 'recrutement', 'essai',
            gen_random_uuid());
    raise exception 'ÉCHEC configuration : une v1 avec un passé a été acceptée.';
  -- Deux filets la refusent — la contrainte de chaîne et la clé étrangère — et l'ordre entre
  -- eux n'est pas garanti. On accepte l'un ou l'autre : ce qui compte est le refus.
  exception
    when check_violation then null;
    when foreign_key_violation then null;
  end;

  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, priorites, autonomie, declencheur, raison)
  values (entreprise, employe, 1, 'prospection',
          '["élargir le nombre d''entreprises approchées"]'::jsonb,
          'confirm', 'recrutement',
          'Au recrutement, le frein déclaré était le manque d''entreprises approchées.')
  returning id into v1;

  -- ── 2. Toute version suivante DIT ce qu'elle remplace. Sans ça, la chaîne casse en silence.
  begin
    insert into public.lady_configuration
      (tenant_id, employee_id, version, role, autonomie, declencheur, raison)
    values (entreprise, employe, 2, 'relation_client', 'confirm', 'resultats', 'essai');
    raise exception 'ÉCHEC configuration : une v2 sans version précédente a été acceptée.';
  exception when check_violation then null;
  end;

  -- ── 3. Et elle ne saute pas de version : « avant » doit rester vrai.
  begin
    insert into public.lady_configuration
      (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id)
    values (entreprise, employe, 3, 'relation_client', 'confirm', 'resultats', 'essai', v1);
    raise exception 'ÉCHEC configuration : une v3 succédant à une v1 a été acceptée.';
  exception when raise_exception then
    if position('manque une version' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 4. Une chaîne décrit UNE Lady : elle ne traverse pas deux employés.
  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, autonomie, declencheur, raison)
  values ('d0000000-0000-0000-0000-00000000000d', '0d000000-0000-0000-0000-0000000000de',
          1, 'prospection', 'confirm', 'recrutement', 'essai')
  returning id into autre_conf;

  begin
    insert into public.lady_configuration
      (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id)
    values (entreprise, employe, 2, 'relation_client', 'confirm', 'resultats', 'essai', autre_conf);
    raise exception 'ÉCHEC configuration : une chaîne a traversé deux entreprises.';
  exception
    -- Le déclencheur devance la clé étrangère composite — il s'exécute avant la vérification
    -- des contraintes — et rend un message qui dit ce qui ne va pas. La clé reste le second
    -- filet, pour le jour où quelqu'un désactiverait le déclencheur.
    when raise_exception then
      if position('autre employé' in sqlerrm) = 0 then raise; end if;
    when foreign_key_violation then null;
  end;

  -- ── 5. Une seule configuration active : « laquelle s'applique » ne se devine pas.
  begin
    insert into public.lady_configuration
      (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id)
    values (entreprise, employe, 2, 'relation_client', 'confirm', 'resultats', 'essai', v1);
    raise exception 'ÉCHEC configuration : deux configurations actives coexistent.';
  exception when unique_violation then null;
  end;

  -- Le passage de relais : on désactive, puis on publie. C'est le seul chemin.
  update public.lady_configuration set active = false where id = v1;

  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, priorites, autonomie, declencheur, raison,
     precedente_id)
  values (entreprise, employe, 2, 'relation_client',
          '["reprendre les demandes entrantes laissées sans réponse"]'::jsonb,
          'confirm', 'resultats',
          'La prospection produit ; ce sont les demandes entrantes qui se perdent.', v1)
  returning id into v2;

  -- ── 6. Une configuration publiée ne se réécrit pas, et ne se supprime pas.
  begin
    update public.lady_configuration set raison = 'autre chose' where id = v1;
    raise exception 'ÉCHEC configuration : une configuration publiée a été réécrite.';
  exception when raise_exception then
    if position('ne se réécrit pas' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.lady_configuration where id = v1;
    raise exception 'ÉCHEC configuration : une configuration a été supprimée.';
  exception when raise_exception then
    if position('ne se supprime pas' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 7. ⭐ LA garantie : une configuration RETRANCHE au périmètre, elle ne l'étend jamais.
  --
  -- `rappeler.echeance` est un acte parfaitement légitime — et aucun moteur ne le sert pour la
  -- formule de cette entreprise. L'activer promettrait un geste que rien n'exécute.
  insert into public.capability (acte, objet, name, contract)
  values ('rappeler', 'echeance', 'Rappeler une échéance',
          jsonb_build_object('effect_class', 'external_irreversible'))
  returning id into hors_perim;

  begin
    insert into public.lady_configuration_capability (configuration_id, capability_id)
    values (v2, hors_perim);
    raise exception
      'ÉCHEC configuration : une capacité hors périmètre a été activée. C''est LA limite que le '
      'produit promet — une configuration ne peut pas donner un pouvoir que le noyau ne sert pas.';
  -- Depuis `20260815120004`, deux bornes tiennent ensemble et celle du NOYAU s'applique la
  -- première : cette capacité n'est pas concevable pour cette version de Lady. La borne de la
  -- formule — « aucun moteur ne la sert » — est éprouvée séparément par LADY-D.
  exception when raise_exception then
    if position('hors du noyau' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 8. Et ce qui EST servi passe, sinon le refus ne prouverait rien.
  select id into dans_perim from public.capability where key = 'relancer.prospect';

  insert into public.lady_configuration_capability (configuration_id, capability_id)
  values (v2, dans_perim);

  if not exists (select 1 from public.lady_configuration_capability
                  where configuration_id = v2 and capability_id = dans_perim) then
    raise exception 'ÉCHEC configuration : une capacité du périmètre a été refusée.';
  end if;

  -- ── 9. Et l'histoire se relit : v2 sait ce qu'elle remplace, et pourquoi.
  if (select precedente_id from public.lady_configuration where id = v2) <> v1 then
    raise exception 'ÉCHEC configuration : la version 2 ne désigne pas celle qu''elle remplace.';
  end if;

  if (select raison from public.lady_configuration where id = v1) not like '%frein déclaré%' then
    raise exception 'ÉCHEC configuration : la raison d''origine ne se relit plus.';
  end if;

  raise notice
    'OK  LADY-C — versions chaînées et immuables, une seule active, périmètre jamais étendu';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-D — le noyau n'est plus un métier, et c'est LUI qui borne ce qu'une Lady peut concevoir.
--
-- Ce que ce bloc éprouve, et que rien ne tenait avant lui : `employee_definition` portait
-- `unique (profession, version)`, donc le produit avait autant de noyaux que de métiers.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise  constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  noyau_v1    uuid;
  noyau_v2    uuid;
  employe_v2  uuid;
  conf_v2     uuid;
  cap_sans_moteur uuid;
  concevables jsonb;
  noyau_avant uuid;
begin
  -- On note à quoi l'employé du jeu d'essai est attaché AVANT toute publication : c'est ce
  -- rattachement qui ne doit pas bouger, quel que soit le noyau publié ensuite.
  select employee_definition_id into noyau_avant
    from public.employee where id = 'ffffffff-0000-0000-0000-000000000001';
  -- ── 1. Le noyau est identifié par sa VERSION, et rien d'autre. Deux noyaux de même version
  --    sont refusés, quel que soit le gisement qu'ils alimentent.
  select id into noyau_v1 from public.employee_definition where version = 1;
  if noyau_v1 is null then
    raise exception 'ÉCHEC noyau : la version 1 du noyau est introuvable.';
  end if;

  begin
    insert into public.employee_definition (gisement, version, dna, capacites)
    values ('recrutement', 1, '{"mission":"x","perimetre":["y"],"limites":["z"]}'::jsonb,
            '["relancer.prospect"]'::jsonb);
    raise exception
      'ÉCHEC noyau : deux noyaux de version 1 coexistent. Le métier est redevenu un axe d''identité.';
  exception when unique_violation then null;
  end;

  -- ── 2. Le noyau dit ce qu'il rend concevable — et ce n'est pas vide.
  select capacites into concevables from public.employee_definition where id = noyau_v1;
  if jsonb_array_length(concevables) = 0 then
    raise exception 'ÉCHEC noyau : la version 1 ne rend aucune capacité concevable.';
  end if;
  if not (concevables ? 'relancer.prospect') then
    raise exception 'ÉCHEC noyau : « relancer.prospect » n''est pas concevable pour le noyau v1.';
  end if;

  -- ── 3. Le noyau reste IMMUABLE. La colonne ajoutée ne rouvre pas la porte fermée par
  --    l'invariant 1 : le verrou d'écriture a été reposé après le remplissage.
  begin
    update public.employee_definition set capacites = '["tout"]'::jsonb where id = noyau_v1;
    raise exception 'ÉCHEC noyau : le noyau a été modifié après publication.';
  exception when raise_exception then
    if position('immuable' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 4. ⭐ La borne de la FORMULE, distincte de celle du noyau.
  --
  -- On publie un noyau v2 qui rend `rappeler.echeance` concevable — donc la borne du noyau
  -- laisse passer — mais aucun moteur ne la sert pour la formule de cette entreprise. Sans les
  -- deux bornes, une configuration promettrait un geste que rien n'exécute.
  select id into cap_sans_moteur from public.capability where key = 'rappeler.echeance';

  insert into public.employee_definition (gisement, version, dna, capacites)
  values ('commercial', 2,
          '{"mission":"servir l''entreprise là où elle a le plus besoin de renfort",
            "perimetre":["ce que la configuration active"],
            "limites":["professions réglementées","engagement contractuel au nom du client"]}'::jsonb,
          jsonb_build_array('relancer.prospect', 'rappeler.echeance'))
  returning id into noyau_v2;

  insert into public.employee (tenant_id, employee_definition_id, identity_id)
  select entreprise, noyau_v2, id from public.reserve_identity('commercial')
  returning id into employe_v2;

  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, autonomie, declencheur, raison)
  values (entreprise, employe_v2, 1, 'relation_client', 'confirm', 'recrutement',
          'Essai de la borne de formule.')
  returning id into conf_v2;

  begin
    insert into public.lady_configuration_capability (configuration_id, capability_id)
    values (conf_v2, cap_sans_moteur);
    raise exception
      'ÉCHEC noyau : une capacité concevable mais qu''aucun moteur ne sert a été activée.';
  exception when raise_exception then
    if position('hors périmètre' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 5. Un employé reste attaché à SA version de noyau. C'est la promesse de l'invariant 1 :
  --    publier une version neuve ne change le comportement d'aucun employé déjà vendu.
  if (select employee_definition_id from public.employee
       where id = 'ffffffff-0000-0000-0000-000000000001') <> noyau_avant then
    raise exception
      'ÉCHEC noyau : un employé a changé de version de noyau à la publication d''une suivante.';
  end if;

  -- ── 6. La recommandation propose une CONFIGURATION, plus un métier — et reste honnête :
  --    hors périmètre ⇒ aucune proposition, et réciproquement.
  begin
    insert into public.recommendation (diagnostic_session_id, justification, status)
    select id, 'On recommande sans rien proposer.', 'proposed'
      from public.diagnostic_session limit 1;
    raise exception
      'ÉCHEC recommandation : une recommandation sans configuration proposée a été acceptée.';
  exception
    when check_violation then null;
    -- Aucune session de diagnostic dans ce jeu d'essai : le cas ne s'applique pas, et le dire
    -- vaut mieux que faire croire qu'il a été éprouvé.
    when not_null_violation then null;
  end;

  raise notice
    'OK  LADY-D — un seul noyau versionné, capacités concevables bornées, employés figés';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-E — ce que le client dit, ce qu'on constate, et ce qu'on en conclut sont trois choses.
--
-- Sans cette séparation, la déclaration du dirigeant EST la décision — et Sentio n'apporte rien
-- de plus qu'un formulaire (`docs/adr/0029`).
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  session_id uuid;
  premier    uuid;
begin
  insert into public.diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
  values ('essai-constats', '{"secteur":"menuiserie"}'::jsonb, 'pas_assez_de_prospects')
  returning id into session_id;

  -- ── 1. Un constat porte toujours d'où il vient. Une déduction n'est pas une mesure.
  insert into public.audit_finding
    (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
  values (session_id, 'goulot', 'recherche_selection', 'prospect', 'declare', 'moyenne',
          'trop peu d''entreprises approchées')
  returning id into premier;

  -- ── 1 bis. ⭐ Le MÊME constat sur un AUTRE objet est un constat distinct. Sans l'objet, les
  --    deux se confondraient et le moteur servirait des factures avec les actes du prospect.
  insert into public.audit_finding
    (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
  values (session_id, 'goulot', 'recherche_selection', 'facture', 'declare', 'moyenne',
          'trop peu d''entreprises approchées');

  -- ── 2. Le vocabulaire est fermé : un genre inventé ne se constate pas.
  begin
    insert into public.audit_finding
      (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
    values (session_id, 'intuition', 'recherche_selection', 'prospect', 'declare', 'moyenne', 'au feeling');
    raise exception 'ÉCHEC constat : un genre inventé a été accepté.';
  exception when check_violation then null;
  end;

  begin
    insert into public.audit_finding
      (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
    values (session_id, 'goulot', 'le_commercial', 'prospect', 'declare', 'moyenne', 'un métier, pas un domaine');
    raise exception 'ÉCHEC constat : un domaine hors vocabulaire a été accepté — un métier a pu rentrer.';
  exception when check_violation then null;
  end;

  -- ── 3. Le même constat ne se compte pas deux fois : il pèserait double sans qu'on le voie.
  begin
    insert into public.audit_finding
      (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
    values (session_id, 'goulot', 'recherche_selection', 'prospect', 'mesure', 'forte',
            'trop peu d''entreprises approchées');
    raise exception 'ÉCHEC constat : un doublon a été accepté, et il pèserait deux fois.';
  exception when unique_violation then null;
  end;

  -- ── 4. ⭐ Un constat ne se réécrit pas. Sans ce verrou, l'audit pourrait être ajusté après
  --    coup pour justifier une configuration déjà vendue — l'inverse exact d'un audit.
  begin
    update public.audit_finding set genre = 'force' where id = premier;
    raise exception 'ÉCHEC constat : un constat a été réécrit après coup.';
  exception when raise_exception then
    if position('ne se modifie pas' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.audit_finding where id = premier;
    raise exception 'ÉCHEC constat : un constat a été supprimé.';
  exception when raise_exception then
    if position('ne se modifie pas' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 5. Une force et un goulot coexistent sur le MÊME domaine : c'est ce qui permet de
  --    conclure autre chose que ce que le dirigeant demandait.
  insert into public.audit_finding
    (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
  values (session_id, 'force', 'recherche_selection', 'prospect', 'mesure', 'forte',
          'la liste existe déjà et elle est fournie');

  if (select count(*) from public.audit_finding
       where diagnostic_session_id = session_id
         and domaine = 'recherche_selection' and objet = 'prospect') <> 2 then
    raise exception
      'ÉCHEC constat : un domaine ne peut pas porter à la fois une force et un goulot.';
  end if;

  raise notice 'OK  LADY-E — constats typés par domaine ET objet, sourcés, fermés, immuables';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-F — appliquer une configuration : ce qu'elle retranche est réellement retiré.
--
-- Avant ce point, `lady_configuration` disait ce que Lady DEVAIT faire et `employee_capability`
-- ce qu'elle POUVAIT faire — sans que rien ne relie les deux. Aucun chemin de production
-- n'écrivait `employee_capability` : la configuration était une intention sans effet.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  v2         uuid;
  v3         uuid;
  qualifier_id uuid;
  relancer_id  uuid;
  ouvertes   text;
begin
  select id into qualifier_id from public.capability where key = 'qualifier.prospect';
  select id into relancer_id  from public.capability where key = 'relancer.prospect';
  select id into v2 from public.lady_configuration
   where employee_id = employe and version = 2;

  -- ── 1. Appliquer une configuration ouvre EXACTEMENT ses capacités.
  perform public.appliquer_la_configuration(v2);

  select string_agg(c.key, ', ' order by c.key) into ouvertes
    from public.employee_capability ec
    join public.capability c on c.id = ec.capability_id
   where ec.employee_id = employe and ec.enabled;

  if ouvertes is distinct from 'relancer.prospect' then
    raise exception
      'ÉCHEC configuration : capacités ouvertes « % », attendu « relancer.prospect ».', ouvertes;
  end if;

  -- ── 2. ⭐ Et ce qu'une version suivante NE REPREND PAS est retiré.
  --
  -- C'est la moitié qu'on oublie. Sans le retrait, « une configuration retranche au périmètre »
  -- serait faux : Lady garderait indéfiniment tout pouvoir qu'on lui a ouvert un jour.
  update public.lady_configuration set active = false where id = v2;

  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id, active)
  values (entreprise, employe, 3, 'qualification', 'confirm_once', 'resultats',
          'Les relances ne produisent plus ; on resserre sur la qualification.', v2, false)
  returning id into v3;

  insert into public.lady_configuration_capability (configuration_id, capability_id)
  values (v3, qualifier_id);

  perform public.appliquer_la_configuration(v3);

  select string_agg(c.key, ', ' order by c.key) into ouvertes
    from public.employee_capability ec
    join public.capability c on c.id = ec.capability_id
   where ec.employee_id = employe and ec.enabled;

  if ouvertes is distinct from 'qualifier.prospect' then
    raise exception
      'ÉCHEC configuration : après bascule, capacités ouvertes « % » — la relance aurait dû être '
      'retirée. Une configuration qui ne retranche pas ne retranche rien.', ouvertes;
  end if;

  -- ── 3. Une seule version active, et c'est la neuve.
  if (select count(*) from public.lady_configuration
       where employee_id = employe and active) <> 1 then
    raise exception 'ÉCHEC configuration : le passage de relais a laissé deux versions actives.';
  end if;
  if not (select active from public.lady_configuration where id = v3) then
    raise exception 'ÉCHEC configuration : la version appliquée n''est pas devenue l''active.';
  end if;

  -- ── 4. L'autonomie de l'employé suit la configuration, jamais l'inverse.
  if (select autonomy from public.employee where id = employe) <> 'confirm_once' then
    raise exception
      'ÉCHEC configuration : l''autonomie de l''employé ne reflète pas sa configuration.';
  end if;

  raise notice
    'OK  LADY-F — passage de relais atomique, capacités ouvertes ET retirées, autonomie reportée';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-J — recruter : d'une recommandation payée à une Lady qui travaille.
--
-- Avant ce point, RIEN en production ne transformait une recommandation en employé : personne ne
-- pouvait acheter, et chaque pièce posée depuis l'étape 1 attendait un chemin inexistant.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  session_id  uuid;
  reco_id     uuid;
  hors_id     uuid;
  r           record;
  rejeu       record;
  identites_avant integer;
  identites_apres integer;
  ouvertes    text;
  proposition constant jsonb := jsonb_build_object(
    'role', 'prospection',
    'priorites', jsonb_build_array('élargir le nombre d''entreprises approchées'),
    'limites', jsonb_build_array('particuliers'),
    'autonomie', 'confirm',
    'capacites', jsonb_build_array('relancer.prospect', 'qualifier.prospect'));
begin
  insert into public.diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
  values ('essai-recrutement',
          jsonb_build_object(
            'sector', 'menuiserie',
            'targetCustomers', 'architectes en Bretagne',
            'objective', jsonb_build_object('metric', 'rendez_vous_qualifies',
                                            'target', 10, 'horizon', 'ce mois')),
          'pas_assez_de_prospects')
  returning id into session_id;

  insert into public.recommendation
    (diagnostic_session_id, configuration_proposee, justification, status)
  values (session_id, proposition,
          'Votre frein est le nombre d''entreprises approchées.', 'proposed')
  returning id into reco_id;

  select count(*) into identites_avant from public.identity where status = 'free';

  -- ── 1. Le recrutement complet, en un appel.
  select * into r from public.recruter(reco_id, 'Menuiserie Le Guen', 'start',
                                      'paiement-essai-1', 'dirigeant@menuiserie-le-guen.fr');

  if r.deja_recrute then
    raise exception 'ÉCHEC recrutement : un premier achat a été pris pour un rejeu.';
  end if;

  -- ── 2. Ce qui doit exister ensuite, et qui n'existait pas avant.
  if (select count(*) from public.employee where tenant_id = r.tenant_id) <> 1 then
    raise exception 'ÉCHEC recrutement : aucun employé n''a été créé.';
  end if;

  if (select count(*) from public.objective
       where tenant_id = r.tenant_id and state = 'actif') <> 1 then
    raise exception
      'ÉCHEC recrutement : aucun objectif actif — l''employé travaillerait pour personne.';
  end if;

  if (select count(*) from public.subscription
       where tenant_id = r.tenant_id and status = 'active') <> 1 then
    raise exception 'ÉCHEC recrutement : aucun abonnement actif.';
  end if;

  -- ── 3. ⭐ La configuration est APPLIQUÉE, pas seulement écrite. C'est la différence entre une
  --    intention et un employé qui peut travailler.
  select string_agg(c.key, ', ' order by c.key) into ouvertes
    from public.employee_capability ec
    join public.capability c on c.id = ec.capability_id
   where ec.employee_id = r.employee_id and ec.enabled;

  if ouvertes is distinct from 'qualifier.prospect, relancer.prospect' then
    raise exception
      'ÉCHEC recrutement : capacités ouvertes « % », attendu celles de la proposition.', ouvertes;
  end if;

  if not (select active from public.lady_configuration where id = r.configuration_id) then
    raise exception 'ÉCHEC recrutement : la configuration v1 n''est pas active.';
  end if;

  -- ── 4. Le contexte d'entreprise vient du diagnostic, et son auteur est le CLIENT : c'est lui
  --    qui l'a dit, et il doit pouvoir le corriger.
  if (select count(*) from public.company_profile
       where tenant_id = r.tenant_id and key = 'secteur' and author = 'client') <> 1 then
    raise exception 'ÉCHEC recrutement : le secteur déclaré au diagnostic n''a pas suivi.';
  end if;

  -- ── 5. Le diagnostic est rattaché à l'entreprise (RECRUT-10), et la recommandation consommée.
  if (select tenant_id from public.diagnostic_session where id = session_id) <> r.tenant_id then
    raise exception 'ÉCHEC recrutement : le diagnostic n''a pas été rattaché à l''entreprise.';
  end if;
  if (select status from public.recommendation where id = reco_id) <> 'purchased' then
    raise exception 'ÉCHEC recrutement : la recommandation n''a pas été consommée.';
  end if;

  -- ── 6. La notification annonce quelqu'un, par son prénom.
  if (select count(*) from public.notification
       where tenant_id = r.tenant_id and kind = 'recrutement') <> 1 then
    raise exception 'ÉCHEC recrutement : le dirigeant n''apprend pas qui le rejoint.';
  end if;

  -- ── 7. ⭐⭐ LE rejeu. Un prestataire de paiement rejoue ses notifications : sans garde, un
  --    rejeu créerait une seconde entreprise et CONSOMMERAIT UNE SECONDE IDENTITÉ — or une
  --    identité ne se réutilise jamais.
  select count(*) into identites_apres from public.identity where status = 'free';
  if identites_apres <> identites_avant - 1 then
    raise exception 'ÉCHEC recrutement : % identité(s) consommée(s) au lieu d''une.',
      identites_avant - identites_apres;
  end if;

  select * into rejeu from public.recruter(reco_id, 'Menuiserie Le Guen', 'start',
                                          'paiement-essai-1', 'dirigeant@menuiserie-le-guen.fr');

  if not rejeu.deja_recrute then
    raise exception 'ÉCHEC recrutement : un paiement rejoué a recruté une seconde fois.';
  end if;
  if rejeu.tenant_id <> r.tenant_id or rejeu.employee_id <> r.employee_id then
    raise exception 'ÉCHEC recrutement : le rejeu rend un autre employé que le premier.';
  end if;
  if (select count(*) from public.identity where status = 'free') <> identites_apres then
    raise exception 'ÉCHEC recrutement : le rejeu a consommé une identité de plus.';
  end if;

  -- ── 8. On ne recrute pas sur un refus. Hors périmètre ⇒ aucune configuration proposée, et
  --    vendre quand même reviendrait à contredire par écrit ce qu'on vient de dire au client.
  -- Une recommandation par diagnostic : le refus vient donc d'un autre visiteur, comme dans la
  -- vraie vie.
  insert into public.diagnostic_session (visitor_fingerprint, extracted_profile)
  values ('essai-hors-perimetre', '{}'::jsonb)
  returning id into hors_id;

  insert into public.recommendation
    (diagnostic_session_id, configuration_proposee, justification, status)
  values (hors_id, null, 'Votre besoin porte sur la comptabilité.', 'hors_perimetre')
  returning id into hors_id;

  begin
    perform public.recruter(hors_id, 'Autre entreprise', 'start', 'paiement-essai-2',
                            'autre@exemple.fr');
    raise exception 'ÉCHEC recrutement : un employé a été vendu sur une recommandation refusée.';
  exception when raise_exception then
    if position('hors périmètre' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 9. Une référence de paiement vide ne distinguerait pas un rejeu d'un second achat.
  begin
    perform public.recruter(reco_id, 'Entreprise', 'start', '   ', 'x@exemple.fr');
    raise exception 'ÉCHEC recrutement : une référence de paiement vide a été acceptée.';
  exception when raise_exception then
    if position('référence de paiement' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice
    'OK  LADY-J — recrutement complet en une transaction, rejeu inoffensif, refus non vendable';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-L — régler l'autonomie laisse une trace, parce que c'est le réglage qui décide si un
-- message part sans qu'une personne l'ait relu.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  avant      public.lady_configuration;
  suivante   uuid;
  apres      public.lady_configuration;
  capacites_avant text;
  capacites_apres text;
begin
  select * into avant from public.lady_configuration
   where employee_id = employe and active;

  select string_agg(c.key, ', ' order by c.key) into capacites_avant
    from public.lady_configuration_capability lcc
    join public.capability c on c.id = lcc.capability_id
   where lcc.configuration_id = avant.id;

  -- ── 1. Le client ne peut PAS écrire l'autonomie directement. C'est ce qui rend le reste vrai.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    update public.employee set autonomy = 'auto' where id = employe;
    reset role;
    raise exception
      'ÉCHEC autonomie : un client a modifié l''autonomie en place, sans version ni raison.';
  exception when insufficient_privilege then
    reset role;
  end;

  -- ── 2. Le réglage publie une VERSION SUIVANTE, avec son déclencheur.
  suivante := public.regler_l_autonomie(entreprise, employe, 'auto',
                                        'Le dirigeant fait confiance après deux semaines.');

  select * into apres from public.lady_configuration where id = suivante;

  if apres.version <> avant.version + 1 then
    raise exception 'ÉCHEC autonomie : la version ne suit pas (% après %).',
      apres.version, avant.version;
  end if;
  if apres.precedente_id <> avant.id then
    raise exception 'ÉCHEC autonomie : la nouvelle version ne dit pas ce qu''elle remplace.';
  end if;
  if apres.declencheur <> 'demande_client' then
    raise exception 'ÉCHEC autonomie : le déclencheur ne dit pas d''où vient le changement.';
  end if;
  if apres.autonomie <> 'auto' then
    raise exception 'ÉCHEC autonomie : le niveau demandé n''a pas été appliqué.';
  end if;

  -- ── 3. ⭐ Le RESTE est recopié à l'identique. Régler l'autonomie ne reconfigure pas Lady.
  if (apres.role, apres.priorites, apres.limites)
     is distinct from (avant.role, avant.priorites, avant.limites) then
    raise exception
      'ÉCHEC autonomie : le rôle ou les priorités ont changé au passage. Un réglage n''est pas '
      'une reconfiguration.';
  end if;

  select string_agg(c.key, ', ' order by c.key) into capacites_apres
    from public.lady_configuration_capability lcc
    join public.capability c on c.id = lcc.capability_id
   where lcc.configuration_id = suivante;

  if capacites_apres is distinct from capacites_avant then
    raise exception
      'ÉCHEC autonomie : les capacités ont changé (« % » → « % »). Régler l''autonomie ne '
      'retire pas de travail à Lady.', capacites_avant, capacites_apres;
  end if;

  -- ── 4. Et l'employé reflète la nouvelle configuration, sans qu'on ait touché sa colonne.
  if (select autonomy from public.employee where id = employe) <> 'auto' then
    raise exception 'ÉCHEC autonomie : l''employé ne reflète pas sa configuration.';
  end if;

  -- ── 5. Redemander ce qui est déjà en place ne pollue pas l'histoire d'une version muette.
  if public.regler_l_autonomie(entreprise, employe, 'auto', 'encore') <> suivante then
    raise exception 'ÉCHEC autonomie : une version a été publiée pour un changement inexistant.';
  end if;

  -- ── 6. Un niveau inventé est refusé : la liste est close.
  begin
    perform public.regler_l_autonomie(entreprise, employe, 'total', 'essai');
    raise exception 'ÉCHEC autonomie : un niveau inconnu a été accepté.';
  exception when raise_exception then
    if position('liste est close' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice
    'OK  LADY-L — l''autonomie se règle en publiant une version, jamais en modifiant une colonne';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-M — le dirigeant voit qui travaille pour lui, et personne d'autre.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  visibles integer;
  libres   integer;
begin
  set local role authenticated;

  -- Le membre de l'entreprise A. Pas celui du parcours individuel : son entreprise a été effacée
  -- plus haut, et ses rattachements avec elle — il ne verrait plus rien, ce qui ne prouverait rien.
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- ── 1. Elle voit l'identité de SON employé. Sans ça, sa fiche n'a pas de nom.
  -- Autant d'identités visibles que d'employés : ni plus, ni moins. Compter en dur serait faux
  -- dès qu'un bloc précédent en recrute un second — et ce qu'on veut prouver n'est pas « une »,
  -- c'est « les siens ».
  select count(*) into visibles
    from public.identity i
    join public.employee e on e.identity_id = i.id
   where e.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';

  if visibles = 0 then
    raise exception 'ÉCHEC identité : le dirigeant ne voit aucun de ses employés — fiche sans nom.';
  end if;
  if visibles <> (select count(*) from public.employee
                   where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception
      'ÉCHEC identité : % identité(s) visibles pour % employé(s).',
      visibles,
      (select count(*) from public.employee
        where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001');
  end if;

  -- ── 2. ⭐ Elle ne voit RIEN du réservoir libre. L'ouvrir laisserait déduire combien d'employés
  --    Sentio a vendus, et à qui.
  select count(*) into libres from public.identity where status = 'free';
  if libres <> 0 then
    raise exception
      'ÉCHEC identité : % identité(s) libres visibles — le réservoir global fuit.', libres;
  end if;

  -- ── 3. Et rien des employés d'une autre entreprise.
  select count(*) into visibles
    from public.identity i
    join public.employee e on e.identity_id = i.id
   where e.tenant_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if visibles <> 0 then
    raise exception
      'ÉCHEC identité : % identité(s) d''une autre entreprise visibles.', visibles;
  end if;

  reset role;
  raise notice 'OK  LADY-M — le dirigeant voit son employé, jamais le réservoir ni les autres';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-N — celui qui a payé retrouve son entreprise, et personne d'autre ne peut la réclamer.
--
-- Sans ce rapprochement, `recruter()` crée une entreprise que PERSONNE ne peut voir : l'acheteur
-- n'a pas de compte au moment où il paie, donc aucun rattachement n'est possible à cet instant.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  session_id   uuid;
  reco_id      uuid;
  r            record;
  acheteur     constant uuid := '0e000000-0000-0000-0000-0000000000e1';
  intrus       constant uuid := '0e000000-0000-0000-0000-0000000000e2';
  rattache     uuid;
  proposition  constant jsonb := jsonb_build_object(
    'role', 'prospection',
    'priorites', jsonb_build_array('élargir le nombre d''entreprises approchées'),
    'limites', jsonb_build_array('particuliers'),
    'autonomie', 'confirm',
    'capacites', jsonb_build_array('qualifier.prospect'));
begin
  insert into auth.users (id) values (acheteur), (intrus);

  insert into public.diagnostic_session (visitor_fingerprint, extracted_profile)
  values ('essai-rattachement',
          jsonb_build_object('objective', jsonb_build_object(
            'metric', 'rendez_vous_qualifies', 'target', 10, 'horizon', 'ce mois')))
  returning id into session_id;

  insert into public.recommendation
    (diagnostic_session_id, configuration_proposee, justification, status)
  values (session_id, proposition, 'Frein : trop peu d''entreprises approchées.', 'proposed')
  returning id into reco_id;

  -- La casse de l'adresse est celle que le client a tapée. Elle ne doit rien décider.
  select * into r from public.recruter(reco_id, 'Atelier Nord', 'start', 'paiement-rattachement',
                                       'Dirigeant@Atelier-Nord.FR');

  -- ── 1. L'attente existe, et elle est ouverte.
  if (select count(*) from public.rattachement_attendu
       where tenant_id = r.tenant_id and consomme_le is null) <> 1 then
    raise exception
      'ÉCHEC rattachement : aucune attente ouverte — l''entreprise créée serait irréclamable.';
  end if;

  -- ── 2. ⭐ Une autre adresse ne réclame rien. C'est ce qui empêche n'importe qui de s'attribuer
  --    l'entreprise de n'importe qui.
  if public.rattacher_par_email(intrus, 'quelquun-dautre@exemple.fr') is not null then
    raise exception 'ÉCHEC rattachement : une adresse étrangère a récupéré une entreprise.';
  end if;
  if (select count(*) from public.tenant_member where tenant_id = r.tenant_id) <> 0 then
    raise exception 'ÉCHEC rattachement : un intrus a été rattaché.';
  end if;

  -- ── 3. La bonne adresse rattache — quelle que soit la casse saisie à l'achat.
  rattache := public.rattacher_par_email(acheteur, 'dirigeant@atelier-nord.fr');
  if rattache is distinct from r.tenant_id then
    raise exception 'ÉCHEC rattachement : l''acheteur n''a pas retrouvé son entreprise.';
  end if;

  if (select role from public.tenant_member
       where tenant_id = r.tenant_id and user_id = acheteur) <> 'owner' then
    raise exception 'ÉCHEC rattachement : l''acheteur n''est pas propriétaire de son entreprise.';
  end if;

  -- ── 4. ⭐⭐ L'attente se consomme UNE fois. Sans ça, une adresse partagée — ou récupérée après
  --    un changement de propriétaire — rattacherait indéfiniment de nouveaux comptes.
  if public.rattacher_par_email(intrus, 'dirigeant@atelier-nord.fr') is not null then
    raise exception
      'ÉCHEC rattachement : une attente déjà consommée a rattaché un second compte.';
  end if;
  if (select count(*) from public.tenant_member where tenant_id = r.tenant_id) <> 1 then
    raise exception 'ÉCHEC rattachement : l''entreprise compte plus d''un propriétaire.';
  end if;

  -- ── 5. Une connexion ordinaire ne casse rien : la plupart sont des retours, pas des premières
  --    fois, et l'absence d'attente n'est pas une erreur.
  if public.rattacher_par_email(acheteur, 'dirigeant@atelier-nord.fr') is not null then
    raise exception 'ÉCHEC rattachement : un retour a été traité comme une première connexion.';
  end if;

  -- ── 6. Et maintenant l'acheteur VOIT son entreprise — c'est tout l'objet de l'espace privé.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', acheteur::text, true);

  if (select count(*) from public.employee where tenant_id = r.tenant_id) <> 1 then
    reset role;
    raise exception
      'ÉCHEC rattachement : l''acheteur ne voit pas l''employé qu''il vient de payer.';
  end if;
  reset role;

  raise notice
    'OK  LADY-N — l''acheteur retrouve son entreprise, une seule fois, et lui seul';
end;
$$;

rollback;
