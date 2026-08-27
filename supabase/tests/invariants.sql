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

  -- ⚠️ On la retire. Elle vivait jusqu'à la fin de la transaction et faisait échouer, tout à la
  -- fin, le contrôle structurel du schéma final (AUDIT-01) — sur une table de test, pour une
  -- raison sans rapport. Un contrôle qui échoue pour la mauvaise raison est pire qu'absent.
  drop table public.table_creee_apres_coup;

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


-- ── METIER-15 / LADY-Z — les variantes sont des données, et LA CADENCE APPLIQUÉE EST CELLE
--    QUI A ÉTÉ TIRÉE. Sans cette dernière condition, toutes les missions relanceraient au même
--    rythme pendant qu'on compare leurs résultats comme si elles différaient : une mesure fausse,
--    qui finirait par annoncer au dirigeant une évolution ne changeant rigoureusement rien.
do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  espace_4_7  uuid;
  espace_3_10 uuid;
  espace_7_14 uuid;
  objectif    uuid;
  fiche       uuid;
  mission     uuid;
begin
  select id into espace_4_7 from public.strategy_variant
   where profession = 'commercial' and kind = 'moment_de_relance' and key = 'espace_4_7';
  select id into espace_3_10 from public.strategy_variant
   where profession = 'commercial' and kind = 'moment_de_relance' and key = 'espace_3_10';
  select id into espace_7_14 from public.strategy_variant
   where profession = 'commercial' and kind = 'moment_de_relance' and key = 'espace_7_14';

  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif' limit 1;

  insert into public.lead (tenant_id, company_name, email, source)
  values (entreprise, 'Cadence', 'cadence-metier15@exemple.fr', 'import_client')
  returning id into fiche;

  -- ── 1. Sans rien de particulier : la variante par défaut du métier. C'est ce qui la rend
  --    ajustable sans redéploiement.
  if public.cadence_de_relance(entreprise, fiche, 1) <> 4
     or public.cadence_de_relance(entreprise, fiche, 2) <> 7 then
    raise exception 'ÉCHEC variantes : la cadence par défaut ne vient pas de la variante (% puis %).',
      public.cadence_de_relance(entreprise, fiche, 1),
      public.cadence_de_relance(entreprise, fiche, 2);
  end if;

  -- Changer la variante par défaut change la cadence, sans toucher une ligne de code.
  update public.strategy_variant set par_defaut = false where id = espace_4_7;
  update public.strategy_variant set par_defaut = true  where id = espace_3_10;

  if public.cadence_de_relance(entreprise, fiche, 1) <> 3
     or public.cadence_de_relance(entreprise, fiche, 2) <> 10 then
    raise exception
      'ÉCHEC variantes : changer la variante par défaut n''a pas changé la cadence (% puis %).',
      public.cadence_de_relance(entreprise, fiche, 1),
      public.cadence_de_relance(entreprise, fiche, 2);
  end if;

  -- ── 2. ⭐ La préférence de l'entreprise passe devant le défaut du métier.
  insert into public.tenant_variant_preference
    (tenant_id, kind, variant_id, missions_comparees, raison)
  values (entreprise, 'moment_de_relance', espace_7_14, 60, 'Mesuré sur 60 missions.')
  on conflict (tenant_id, kind) do update
    set variant_id = excluded.variant_id, raison = excluded.raison;

  if public.cadence_de_relance(entreprise, fiche, 1) <> 7 then
    raise exception
      'ÉCHEC variantes : la préférence de l''entreprise ne passe pas devant le défaut du métier '
      '(cadence rendue : %).', public.cadence_de_relance(entreprise, fiche, 1);
  end if;

  -- ── 3. ⭐⭐ Et la variante de LA MISSION passe devant tout. C'est la condition sans laquelle
  --    `resultats_par_variante` compare des cadences qui n'ont jamais tourné.
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', fiche)
  returning id into mission;

  insert into public.task_variant (tenant_id, task_id, variant_id)
  values (entreprise, mission, espace_3_10);

  if public.cadence_de_relance(entreprise, fiche, 1) <> 3 then
    raise exception
      'ÉCHEC variantes : la mission a joué « espace_3_10 » et la cadence appliquée est % jours. '
      'Les résultats seraient attribués à une cadence qui n''a jamais tourné.',
      public.cadence_de_relance(entreprise, fiche, 1);
  end if;

  -- ── 4. Au-delà des rangs déclarés : NULL, et surtout aucun repli sur une valeur écrite en dur.
  if public.cadence_de_relance(entreprise, fiche, 3) is not null then
    raise exception 'ÉCHEC variantes : un rang non déclaré a reçu une cadence.';
  end if;

  delete from public.tenant_variant_preference
   where tenant_id = entreprise and kind = 'moment_de_relance';
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

  -- ⚠️ Deux gestes qui se ressemblent et n'ont rien à voir : SUPPRIMER un constat (interdit,
  -- toujours) et EFFACER un client à sa demande (un droit, article 17). Le message le dit
  -- désormais, parce que le second a été refusé par ce verrou pendant tout un temps — et que
  -- personne ne pouvait alors satisfaire une demande d'effacement.
  begin
    delete from public.audit_finding where id = premier;
    raise exception 'ÉCHEC constat : un constat a été supprimé.';
  exception when raise_exception then
    if position('ne se supprime pas' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 4 bis. ⭐⭐ Mais l'effacement d'un client, lui, passe. C'est le contrôle qui manquait :
  --    le droit à l'effacement échouait sur ce verrou, et le parcours complet ne le disait pas.
  begin
    -- Sur un constat jetable : les suivants comptent ceux d'origine, et les faire disparaître
    -- ici ferait échouer un contrôle sans rapport, deux blocs plus bas.
    insert into public.audit_finding
      (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
    values (session_id, 'risque', 'documents', 'document', 'deduit', 'faible', 'Constat jetable.');

    perform set_config('sentio.retention_purge', 'on', true);
    delete from public.audit_finding
     where diagnostic_session_id = session_id and libelle = 'Constat jetable.';
    perform set_config('sentio.retention_purge', 'off', true);
  exception when others then
    perform set_config('sentio.retention_purge', 'off', true);
    raise exception
      'ÉCHEC constat : l''effacement d''un client bute sur l''immuabilité des constats (%). '
      'Le droit à l''effacement devient alors impossible à satisfaire.', sqlerrm;
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

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-O — une panne provoquée se voit. C'est le critère de l'étape 11 du plan.
--
-- Aujourd'hui, si le moteur s'arrête, personne ne le sait : on l'apprendrait par un client
-- mécontent, ou pas du tout. Un travail programmé a échoué 72 fois par jour avant d'être remarqué.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  objectif   uuid;
  mission    uuid;
  signaux    integer;
begin
  -- ── 1. Une base saine ne réveille personne. C'est la moitié qu'on oublie de vérifier : une
  --    alerte qui se déclenche tout le temps ne se lit plus au bout d'une semaine.
  select count(*) into signaux from public.etat_de_sante() where sujet = 'missions immobiles';
  if signaux <> 0 then
    raise exception 'ÉCHEC santé : une base au repos déclenche déjà une alerte.';
  end if;

  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif';

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid())
  returning id into mission;

  -- ── 2. ⭐ LA panne qui compte : un exécutant s'est arrêté sans rendre son bail. Le client paie
  --    pour un employé qui n'avance plus, et rien ne le signale.
  insert into public.job (tenant_id, task_id, locked_at, locked_by)
  values (entreprise, mission, now() - interval '6 hours', 'exécutant-mort');

  select count(*) into signaux
    from public.etat_de_sante()
   where sujet = 'missions immobiles' and gravite = 'alerte';
  if signaux <> 1 then
    raise exception
      'ÉCHEC santé : une mission verrouillée depuis six heures ne déclenche rien. Le moteur peut '
      's''arrêter sans que personne l''apprenne.';
  end if;

  -- ── 3. Un travail repris en boucle : la panne la plus coûteuse, et la plus silencieuse.
  update public.job set attempts = 9, locked_at = null, locked_by = null where task_id = mission;

  select count(*) into signaux
    from public.etat_de_sante()
   where sujet = 'travaux repris en boucle' and gravite = 'alerte';
  if signaux <> 1 then
    raise exception 'ÉCHEC santé : un travail repris neuf fois ne déclenche rien.';
  end if;

  -- ── 4. Une mission en échec ne se rejoue pas : quelqu'un doit la reprendre.
  update public.task set state = 'failed' where id = mission;

  select count(*) into signaux
    from public.etat_de_sante()
   where sujet = 'missions en échec' and gravite = 'alerte';
  if signaux <> 1 then
    raise exception 'ÉCHEC santé : une mission en échec passe inaperçue.';
  end if;

  -- ── 5. Un accord qui dort : Lady s'arrête pour demander — c'est voulu — mais si personne ne
  --    tranche, le client paie pour un employé à l'arrêt.
  insert into public.approval (tenant_id, task_id, requested_at)
  values (entreprise, mission, now() - interval '2 days');

  select count(*) into signaux
    from public.etat_de_sante()
   where sujet = 'accords en attente' and gravite = 'avertissement';
  if signaux <> 1 then
    raise exception 'ÉCHEC santé : un accord en attente depuis deux jours ne se signale pas.';
  end if;

  -- ── 6. Les seuils sont des PARAMÈTRES, pas des constantes cachées. Un seuil qu'on ne peut pas
  --    déplacer est un seuil qu'on finit par contourner.
  select count(*) into signaux
    from public.etat_de_sante(interval '30 days', 3, 0.85)
   where sujet = 'accords en attente';
  if signaux <> 0 then
    raise exception 'ÉCHEC santé : le seuil d''immobilité ne se règle pas.';
  end if;

  -- ── 7. L'état de santé agrège TOUTES les entreprises : il dit combien de clients ont des
  --    ennuis. Aucun client n'a à le savoir.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    perform public.etat_de_sante();
    reset role;
    raise exception 'ÉCHEC santé : un client a pu lire l''état de santé de la plateforme.';
  exception when insufficient_privilege then
    reset role;
  end;

  raise notice
    'OK  LADY-O — panne provoquée détectée, base saine silencieuse, seuils réglables';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-R — quand le client tranche, le travail repart. Ou du moins : il redevient prenable.
--
-- ⚠️ CE BLOC DIT AUSSI CE QUI MANQUE. Avant lui, le dirigeant accordait depuis son espace et il
-- ne se passait RIEN, jamais : la mission avait été sortie de la file en attendant sa réponse, et
-- personne ne l'y remettait. Lady paraissait ignorer son client.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  objectif   uuid;
  mission    uuid;
  demande    uuid;
  natures    text;
begin
  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif';

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id, state)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid(), 'waiting_approval')
  returning id into mission;

  insert into public.approval (tenant_id, task_id) values (entreprise, mission)
  returning id into demande;

  -- La mission est hors file : c'est ce que fait `mettreDeCote()` quand Lady s'arrête pour
  -- demander. Un travail qui attend une personne ne doit pas occuper un exécutant.
  if exists (select 1 from public.job where task_id = mission) then
    raise exception 'ÉCHEC accord : la mission ne devrait pas être en file en attendant l''accord.';
  end if;

  -- ── 1. ⭐ Le client accorde. La mission retourne en file ET redevient prenable.
  update public.approval set state = 'granted', resolved_at = now() where id = demande;

  if not exists (select 1 from public.job where task_id = mission) then
    raise exception
      'ÉCHEC accord : le client a accordé et le travail n''est pas retourné en file. Lady '
      'ignorerait sa réponse, indéfiniment.';
  end if;

  if (select state from public.task where id = mission) <> 'pending' then
    raise exception
      'ÉCHEC accord : la mission reste « waiting_approval », donc imprenable — remettre en file '
      'sans la rendre prenable ne sert à rien.';
  end if;

  -- ── 2. Le journal enregistre la décision. La machine à états l'attendait depuis le début :
  --    `accord_accorde` relance le run, `accord_refuse` le referme (`run-state.ts`). Personne ne
  --    les écrivait.
  select string_agg(kind, ', ' order by seq) into natures
    from public.execution_event where task_id = mission;
  if position('accord_accorde' in coalesce(natures, '')) = 0 then
    raise exception
      'ÉCHEC accord : la décision du client n''est pas au journal. Le run reprendrait sur un '
      'journal qui le croit toujours suspendu. Journal : %.', natures;
  end if;

  -- ── 3. Trancher deux fois ne crée pas deux travaux.
  update public.approval set state = 'granted', resolved_at = now() where id = demande;
  if (select count(*) from public.job where task_id = mission) <> 1 then
    raise exception 'ÉCHEC accord : un accord tranché deux fois a créé deux travaux.';
  end if;

  -- ── 4. Un refus repart aussi — c'est le runtime qui referme, pas ce déclencheur. Trancher ici
  --    mettrait la décision à deux endroits, et c'est toujours le second qui dérive.
  declare
    autre_mission uuid;
    autre_demande uuid;
  begin
    insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id, state)
    values (entreprise, employe, objectif, 'lead', gen_random_uuid(), 'waiting_approval')
    returning id into autre_mission;

    insert into public.approval (tenant_id, task_id) values (entreprise, autre_mission)
    returning id into autre_demande;

    update public.approval set state = 'refused', resolved_at = now() where id = autre_demande;

    select string_agg(kind, ', ' order by seq) into natures
      from public.execution_event where task_id = autre_mission;
    if position('accord_refuse' in coalesce(natures, '')) = 0 then
      raise exception 'ÉCHEC accord : un refus n''est pas journalisé.';
    end if;
  end;

  raise notice
    'OK  LADY-R — le client tranche, la mission retourne en file, la décision est au journal';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-S — « où en suis-je de mes 10 000 € ? » devient une question à laquelle on sait répondre.
--
-- Avant ce point, le produit affichait la cible et se taisait sur l'avancement — non par pudeur,
-- mais parce que l'horizon était du texte libre et que rien ne pouvait le compter.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  objectif   uuid;
  mission    uuid;
  etat       record;
begin
  -- Une cible nette : 10 000 € sur 30 jours, déclarée il y a 10 jours.
  update public.objective set state = 'retire' where tenant_id = entreprise and state = 'actif';

  insert into public.objective (tenant_id, metric, target_value, horizon, horizon_jours, created_at)
  values (entreprise, 'mrr', 10000, 'par mois', 30, now() - interval '10 days')
  returning id into objectif;

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid())
  returning id into mission;

  -- ── 1. Sans aucune vente, l'avancement est ZÉRO — pas une estimation, pas une projection.
  select * into etat from public.avancement_vers_l_objectif(entreprise);

  if etat.realise <> 0 then
    raise exception 'ÉCHEC avancement : % réalisé sans la moindre vente déclarée.', etat.realise;
  end if;
  if etat.rythme_requis <> round(10000::numeric / 30, 2) then
    raise exception 'ÉCHEC avancement : rythme requis « % », attendu 333,33 par jour.',
      etat.rythme_requis;
  end if;
  if etat.jours_ecoules <> 10 then
    raise exception 'ÉCHEC avancement : % jours écoulés au lieu de 10.', etat.jours_ecoules;
  end if;

  -- ── 2. ⭐ Une vente déclarée par le client compte. Et l'écart de rythme se voit.
  insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
  values (entreprise, mission, 'sale', 2000, 'client');

  select * into etat from public.avancement_vers_l_objectif(entreprise);

  if etat.realise <> 2000 then
    raise exception 'ÉCHEC avancement : % réalisé au lieu de 2000.', etat.realise;
  end if;
  -- 2000 en 10 jours = 200/jour, contre 333,33 requis : en retard, et le nombre le dit.
  if etat.ecart_de_rythme >= 0 then
    raise exception
      'ÉCHEC avancement : un rythme de 200/jour face à 333/jour requis devrait être négatif (%).',
      etat.ecart_de_rythme;
  end if;

  -- ── 3. ⭐⭐ Seules les ventes DÉCLARÉES PAR LE CLIENT comptent. La base l'impose déjà à
  --    l'écriture ; on le vérifie ici parce que c'est le chiffre qu'un dirigeant lira, et qu'un
  --    produit qui gonfle son propre résultat est le mensonge le plus tentant qui soit.
  begin
    insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
    values (entreprise, mission, 'sale', 8000, 'sentio');
    raise exception 'ÉCHEC avancement : Sentio a pu déclarer une vente à la place du client.';
  exception when check_violation then null;
  end;

  -- ── 4. Les jours écoulés sont bornés par l'horizon : au-delà, comparer un rythme observé à
  --    une cible qui portait sur une période finie n'a plus de sens.
  update public.objective set created_at = now() - interval '90 days' where id = objectif;
  select * into etat from public.avancement_vers_l_objectif(entreprise);
  if etat.jours_ecoules <> 30 then
    raise exception
      'ÉCHEC avancement : % jours écoulés — l''horizon de 30 jours devrait borner le compte.',
      etat.jours_ecoules;
  end if;

  raise notice
    'OK  LADY-S — avancement mesuré sur les ventes du client, rythmes comparés, rien de prédit';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-U — le déclencheur PROPOSE. Il n'applique rien.
--
-- C'est le bloc qui garde §10 de la vision. Sans lui, la boucle « mesurer → reconfigurer » se
-- refermerait sur elle-même : Lady changerait de rôle sur ses propres chiffres, un dirigeant
-- découvrirait au réveil que ce qu'il a acheté fait autre chose, et rien dans le schéma ne
-- l'aurait empêché.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  avant      public.lady_configuration;
  apres      public.lady_configuration;
  propose    uuid;
  rejoue     uuid;
  deja       boolean;
  annonces   integer;
begin
  select * into avant
    from public.lady_configuration c
   where c.tenant_id = entreprise and c.employee_id = employe and c.active;

  if not found then
    raise exception 'ÉCHEC déclencheur : le montage n''a aucune configuration active à faire évoluer.';
  end if;

  -- ── 1. ⭐⭐ Une proposition naît INACTIVE, et l'employé ne bouge pas d'un millimètre.
  select p.configuration_id, p.deja_proposee into propose, deja
    from public.proposer_une_configuration(
           entreprise, employe, 'qualification',
           '["mieux choisir qui est approché"]'::jsonb, '[]'::jsonb, 'confirm',
           array['qualifier.prospect'],
           'Des réponses arrivent, mais aucune ne se transforme : le ciblage passe devant le volume.'
         ) p;

  if deja then
    raise exception 'ÉCHEC déclencheur : une proposition neuve a été rendue comme déjà posée.';
  end if;

  if (select active from public.lady_configuration where id = propose) then
    raise exception
      'ÉCHEC déclencheur : la proposition s''est appliquée toute seule. C''est exactement ce que '
      '§10 interdit — Lady ne change jamais de rôle sans que le dirigeant ait dit oui.';
  end if;

  select * into apres
    from public.lady_configuration c
   where c.tenant_id = entreprise and c.employee_id = employe and c.active;

  if apres.id <> avant.id then
    raise exception 'ÉCHEC déclencheur : la configuration active a changé sans accord.';
  end if;

  if (select autonomy from public.employee where id = employe) <> avant.autonomie then
    raise exception 'ÉCHEC déclencheur : les pouvoirs de l''employé ont bougé avant tout accord.';
  end if;

  -- ── 2. La proposition demande, elle n'annonce pas. Le genre « evolution » resterait adossé à
  --    un changement réel, et il n'y en a aucun.
  if not exists (select 1 from public.notification
                  where tenant_id = entreprise and kind = 'proposition') then
    raise exception 'ÉCHEC déclencheur : le dirigeant n''a pas été prévenu qu''on lui demande quelque chose.';
  end if;

  if exists (select 1 from public.notification n
              where n.tenant_id = entreprise and n.kind = 'evolution'
                and n.created_at > avant.created_at
                and n.message = 'Des réponses arrivent, mais aucune ne se transforme : le ciblage passe devant le volume.') then
    raise exception
      'ÉCHEC déclencheur : un changement a été annoncé comme fait alors qu''il attend une réponse.';
  end if;

  -- ── 3. ⭐ Une seconde mesure n'empile pas une seconde proposition. Sinon la question posée au
  --    dirigeant changerait sous ses yeux avant qu'il ait pu y répondre.
  select p.configuration_id, p.deja_proposee into rejoue, deja
    from public.proposer_une_configuration(
           entreprise, employe, 'relation_client', '[]'::jsonb, '[]'::jsonb, 'auto',
           array['relancer.prospect'], 'Autre lecture des mêmes chiffres.') p;

  if rejoue <> propose or not deja then
    raise exception
      'ÉCHEC déclencheur : une seconde proposition a été empilée sur une question sans réponse.';
  end if;

  -- ── 4. Le refus se garde, et il rouvre la porte à une proposition suivante.
  perform public.refuser_la_configuration(entreprise, propose);

  if (select refusee_le from public.lady_configuration where id = propose) is null then
    raise exception 'ÉCHEC déclencheur : un refus n''a laissé aucune trace.';
  end if;

  select p.configuration_id, p.deja_proposee into rejoue, deja
    from public.proposer_une_configuration(
           entreprise, employe, 'relation_client', '[]'::jsonb, '[]'::jsonb, 'confirm',
           array['relancer.prospect'],
           'Les réponses cessent : c''est le message qui ne porte pas, pas le nombre d''envois.') p;

  if deja or rejoue = propose then
    raise exception
      'ÉCHEC déclencheur : après un refus, plus aucune réévaluation n''est possible.';
  end if;

  -- Et la chaîne reste continue derrière la version refusée : « ce qu'il y avait avant » tient.
  if (select precedente_id from public.lady_configuration where id = rejoue) <> propose then
    raise exception 'ÉCHEC déclencheur : la chaîne des versions saute la proposition refusée.';
  end if;

  -- ── 5. ⭐ L'accord applique — et alors seulement, l'évolution est annoncée AVEC sa preuve.
  perform public.accepter_la_configuration(entreprise, rejoue);

  select * into apres
    from public.lady_configuration c
   where c.tenant_id = entreprise and c.employee_id = employe and c.active;

  if apres.id <> rejoue then
    raise exception 'ÉCHEC déclencheur : le dirigeant a accepté, et rien n''a pris effet.';
  end if;

  if (select autonomy from public.employee where id = employe) <> apres.autonomie then
    raise exception 'ÉCHEC déclencheur : les pouvoirs de l''employé ne suivent pas la version acceptée.';
  end if;

  select count(*) into annonces from public.notification n
    join public.strategy_change s on s.id = n.strategy_change_id
   where n.tenant_id = entreprise and n.kind = 'evolution'
     and s.description like 'Les réponses cessent%';

  if annonces <> 1 then
    raise exception
      'ÉCHEC déclencheur : % annonce(s) d''évolution adossée(s) au changement, une seule attendue.',
      annonces;
  end if;

  -- ── 6. Accepter deux fois ne republie pas et ne renotifie pas : un dirigeant qui reclique
  --    n'a pas changé d'avis deux fois.
  perform public.accepter_la_configuration(entreprise, rejoue);

  select count(*) into annonces from public.notification n
    join public.strategy_change s on s.id = n.strategy_change_id
   where n.tenant_id = entreprise and n.kind = 'evolution'
     and s.description like 'Les réponses cessent%';

  if annonces <> 1 then
    raise exception 'ÉCHEC déclencheur : un second accord a réannoncé le même changement.';
  end if;

  -- ── 7. Et ce qui s'applique aujourd'hui ne se refuse pas : on en publie une autre.
  begin
    perform public.refuser_la_configuration(entreprise, rejoue);
    raise exception 'ÉCHEC déclencheur : la configuration en vigueur a pu être refusée.';
  exception when raise_exception then
    if position('on en publie une autre' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice
    'OK  LADY-U — les résultats PROPOSENT, le dirigeant décide, et rien ne s''applique sans lui';
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-V — ce qu'une entreprise a appris ne profite QU'À ELLE.
--
-- C'est la promesse la plus lourde de conséquences de tout l'apprentissage : les résultats d'un
-- client ne doivent jamais se mélanger à ceux d'un autre. Une moyenne du produit ferait converger
-- tous les employés vers le ton qui plaît au client médian — et ferait fuiter, par la bande, ce
-- qui marche chez un concurrent.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  voisine    constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  employe_v  uuid;
  objectif   uuid;
  variante   uuid;
  autre_var  uuid;
  mission    uuid;
  compte     integer;
begin
  select id into variante from public.strategy_variant
   where kind = 'registre' and key = 'specialise';
  select id into autre_var from public.strategy_variant
   where kind = 'registre' and key = 'courant';

  if variante is null or autre_var is null then
    raise exception 'ÉCHEC progression : les registres de langage ne sont pas semés.';
  end if;

  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif' limit 1;

  -- ── 1. Une mission ouverte mais JAMAIS travaillée ne dit rien de sa variante.
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid())
  returning id into mission;

  insert into public.task_variant (tenant_id, task_id, variant_id)
  values (entreprise, mission, variante);

  select missions into compte from public.resultats_par_variante(entreprise)
   where variant_id = variante;

  if coalesce(compte, 0) <> 0 then
    raise exception
      'ÉCHEC progression : une mission jamais travaillée compte pour % . Une variante récente '
      'paraîtrait mauvaise parce qu''elle porte des missions pas encore jouées.', compte;
  end if;

  -- ── 2. Travaillée, elle compte.
  insert into public.execution_event (tenant_id, employee_id, task_id, kind)
  values (entreprise, employe, mission, 'action_executee');

  select missions into compte from public.resultats_par_variante(entreprise)
   where variant_id = variante;

  if compte <> 1 then
    raise exception 'ÉCHEC progression : % mission comptée au lieu de 1.', compte;
  end if;

  -- ── 3. ⭐⭐ Ce que fait la VOISINE ne compte jamais chez elle.
  insert into public.employee (tenant_id, employee_definition_id, identity_id)
  select voisine, 'dddddddd-0000-0000-0000-000000000001', id
    from public.reserve_identity('commercial')
  returning id into employe_v;

  insert into public.objective (tenant_id, metric, target_value, horizon)
  values (voisine, 'chiffre_affaires', 5000, 'mois')
  returning id into objectif;

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (voisine, employe_v, objectif, 'lead', gen_random_uuid())
  returning id into mission;

  insert into public.task_variant (tenant_id, task_id, variant_id)
  values (voisine, mission, variante);
  insert into public.execution_event (tenant_id, employee_id, task_id, kind)
  values (voisine, employe_v, mission, 'action_executee');
  insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
  values (voisine, mission, 'sale', 9000, 'client');

  select missions into compte from public.resultats_par_variante(entreprise)
   where variant_id = variante;

  if compte <> 1 then
    raise exception
      'ÉCHEC progression : % missions comptées chez la première entreprise — les résultats de la '
      'voisine ont fuité. C''est la promesse la plus lourde de tout l''apprentissage.', compte;
  end if;

  select ventes into compte from public.resultats_par_variante(entreprise)
   where variant_id = variante;

  if compte <> 0 then
    raise exception 'ÉCHEC progression : % vente(s) d''une autre entreprise comptée(s) ici.', compte;
  end if;

  -- ── 4. Une préférence par genre, et pas deux : sinon deux registres s'appliqueraient.
  insert into public.tenant_variant_preference
    (tenant_id, kind, variant_id, missions_comparees, raison)
  values (entreprise, 'registre', variante, 50, 'Mesuré sur 50 missions.');

  begin
    insert into public.tenant_variant_preference
      (tenant_id, kind, variant_id, missions_comparees, raison)
    values (entreprise, 'registre', autre_var, 50, 'Une seconde préférence.');
    raise exception 'ÉCHEC progression : deux registres préférés pour la même entreprise.';
  exception when unique_violation then null;
  end;

  -- ── 5. Une variante qui a servi ne se supprime pas : les résultats mesurés lui appartiennent.
  begin
    delete from public.strategy_variant where id = variante;
    raise exception 'ÉCHEC progression : une variante déjà jouée a pu être supprimée.';
  exception
    when raise_exception then
      if position('ne se supprime pas' in sqlerrm) = 0 then raise; end if;
    when foreign_key_violation then null;
  end;

  raise notice
    'OK  LADY-V — résultats comptés par entreprise, jamais mélangés, une préférence par genre';
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-W — « qu'est-ce qui empêche cet employé de prendre le contrôle de mon entreprise ? »
--
-- Deux réponses, et ce sont celles qui comptent le jour où quelque chose va mal : rien ne le rend
-- plus autonome sauf son dirigeant, et son dirigeant peut tout arrêter.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  active     public.lady_configuration;
  suivante   uuid;
  arret      timestamptz;
  verdict    text;
begin
  select * into active
    from public.lady_configuration c
   where c.tenant_id = entreprise and c.employee_id = employe and c.active;

  if not found then
    raise exception 'ÉCHEC limites : le montage n''a aucune configuration active.';
  end if;

  -- ── 1. ⭐⭐ Une réévaluation ne peut PAS rendre l'employé plus autonome.
  --
  -- C'est le scénario qui inquiète, et à raison : une mesure conclut, le dirigeant accepte d'un
  -- clic, et son employé se met à écrire sans relecture. La base refuse.
  begin
    insert into public.lady_configuration
      (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id, active)
    select entreprise, employe, max(version) + 1, 'prospection', 'auto', 'resultats',
           'Les résultats seraient meilleurs sans validation.', active.id, false
      from public.lady_configuration where employee_id = employe;
    raise exception
      'ÉCHEC limites : une réévaluation a pu faire passer l''employé en « agit seul ».';
  exception when raise_exception then
    if position('plus autonome' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── 2. Elle peut le rendre plus PRUDENT : le cliquet ne tourne que dans ce sens.
  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id, active)
  select entreprise, employe, max(version) + 1, 'prospection', 'confirm', 'resultats',
         'Deux envois ont été signalés : on repasse par une relecture.', active.id, false
    from public.lady_configuration where employee_id = employe
  returning id into suivante;

  if suivante is null then
    raise exception 'ÉCHEC limites : une configuration plus prudente a été refusée.';
  end if;

  -- ── 3. ⭐ Et le dirigeant, lui, peut lever la garde — c'est LA porte, et elle est nommée.
  perform public.appliquer_la_configuration(suivante);

  if public.regler_l_autonomie(entreprise, employe, 'auto', 'Je le laisse agir seul.') is null then
    raise exception 'ÉCHEC limites : le dirigeant n''a pas pu régler l''autonomie de son employé.';
  end if;

  if (select autonomy from public.employee where id = employe) <> 'auto' then
    raise exception
      'ÉCHEC limites : le dirigeant a demandé « agit seul » et l''employé ne l''est pas.';
  end if;

  -- ── 4. Un employé ne NAÎT jamais en « agit seul » : personne n'a encore rien consenti.
  begin
    insert into public.lady_configuration
      (tenant_id, employee_id, version, role, autonomie, declencheur, raison)
    values (entreprise, 'ffffffff-0000-0000-0000-00000000000e', 1, 'prospection', 'auto',
            'recrutement', 'Essai.');
    raise exception 'ÉCHEC limites : un employé a pu être recruté en « agit seul ».';
  exception when raise_exception then
    if position('recruté en' in sqlerrm) = 0 then raise; end if;
  -- L'employé d'essai n'existe pas : la clé étrangère peut trancher avant le déclencheur, et
  -- c'est le refus qui compte, pas lequel des deux l'a prononcé.
  when foreign_key_violation then null;
  end;

  -- ── 5. ⭐⭐ L'ARRÊT. Plus aucune mission ne s'ouvre.
  select * into active
    from public.lady_configuration c
   where c.tenant_id = entreprise and c.employee_id = employe and c.active;

  arret := public.mettre_en_pause(entreprise, employe, 'Je veux vérifier ce qu''il écrit.');
  if arret is null then
    raise exception 'ÉCHEC limites : l''arrêt n''a rien produit.';
  end if;

  verdict := public.peut_ouvrir_une_mission(entreprise, employe);
  if verdict <> 'employe_arrete' then
    raise exception
      'ÉCHEC limites : employé arrêté, et l''ouverture de missions rend « % ». Un employé arrêté '
      'doit rendre « arrêté » — un motif exact vaut mieux qu''un motif vrai par accident.',
      verdict;
  end if;

  -- ── 6. ⭐⭐ Et plus rien ne part. Refuser d'ouvrir ne suffirait pas : ce qui était déjà
  --    préparé partirait quand même.
  verdict := public.peut_envoyer(entreprise, gen_random_uuid(), gen_random_uuid(), 0, 50);
  if verdict <> 'employe_arrete' then
    raise exception
      'ÉCHEC limites : employé arrêté, et la garde d''envoi rend « % ».', verdict;
  end if;

  -- ── 7. Un second arrêt ne réécrit pas la date du premier.
  if public.mettre_en_pause(entreprise, employe, 'Encore.') <> arret then
    raise exception 'ÉCHEC limites : un second arrêt a réécrit la date du premier.';
  end if;

  -- ── 8. Rien ne reprend tout seul : il faut le dire.
  perform public.reprendre_le_travail(entreprise, employe);

  if (select en_pause_depuis from public.employee where id = employe) is not null then
    raise exception 'ÉCHEC limites : le dirigeant a repris et l''employé est resté arrêté.';
  end if;

  verdict := public.peut_ouvrir_une_mission(entreprise, employe);
  if verdict = 'employe_arrete' then
    raise exception 'ÉCHEC limites : reprise demandée, employé toujours arrêté.';
  end if;

  raise notice
    'OK  LADY-W — l''autonomie ne monte que par le dirigeant, et son arrêt arrête tout';
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-X — « qu'est-ce que tu as fait aujourd'hui ? » ne compte QUE ce qui a eu lieu.
--
-- C'est la surface où le dirigeant PARLE à son employée : un chiffre faux ici coûte plus cher
-- que partout ailleurs, parce qu'il est donné à la première personne et qu'on le croit.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  voisine    constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  employe_v  uuid;
  objectif   uuid;
  hier       uuid;
  ce_matin   uuid;
  jamais     uuid;
  avant      record;
  t          record;
  debut      constant timestamptz := date_trunc('day', now());
  fin        constant timestamptz := date_trunc('day', now()) + interval '1 day';
begin
  -- ⚠️ On mesure des ÉCARTS, pas des totaux. Les blocs précédents de cette suite travaillent sur
  -- la même entreprise dans la même transaction : une assertion sur un total absolu tiendrait
  -- aujourd'hui et casserait le jour où quelqu'un ajoute un bloc plus haut — en accusant ce
  -- bloc-ci. Un contrôle qui échoue pour la mauvaise raison est pire qu'un contrôle absent.
  select * into avant from public.travail_sur_la_periode(entreprise, debut, fin);

  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif' limit 1;

  -- ── Une mission d'HIER, travaillée hier.
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id, created_at)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid(), now() - interval '1 day')
  returning id into hier;
  insert into public.execution_event (tenant_id, employee_id, task_id, kind, created_at)
  values (entreprise, employe, hier, 'action_executee', now() - interval '1 day');

  -- ── Une mission de CE MATIN, travaillée ce matin.
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid())
  returning id into ce_matin;
  insert into public.execution_event (tenant_id, employee_id, task_id, kind)
  values (entreprise, employe, ce_matin, 'action_executee');

  -- ── Une mission ouverte ce matin et JAMAIS travaillée.
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid())
  returning id into jamais;

  select * into t from public.travail_sur_la_periode(entreprise, debut, fin);

  -- ── 1. ⭐ Le travail d'hier n'est pas celui d'aujourd'hui.
  if t.missions_agies - avant.missions_agies <> 1 then
    raise exception
      'ÉCHEC nouvelles : % missions travaillées de plus, une seule l''a été aujourd''hui. Le '
      'travail d''hier a débordé sur la question du jour.', t.missions_agies - avant.missions_agies;
  end if;

  -- ── 2. ⭐⭐ Une mission ouverte et jamais travaillée n'est PAS du travail fait.
  --    L'annoncer comme tel serait le premier mensonge du produit — et le plus facile.
  if t.missions_ouvertes - avant.missions_ouvertes <> 2 then
    raise exception 'ÉCHEC nouvelles : % missions ouvertes de plus au lieu de 2.',
      t.missions_ouvertes - avant.missions_ouvertes;
  end if;
  if (t.missions_agies - avant.missions_agies) = (t.missions_ouvertes - avant.missions_ouvertes) then
    raise exception
      'ÉCHEC nouvelles : ouvrir une mission compte comme l''avoir travaillée. Un dirigeant à qui '
      'l''on annonce du travail qui n''a pas eu lieu ne croira plus aucun chiffre ensuite.';
  end if;

  -- ── 3. Une issue déclarée aujourd'hui est une nouvelle d'aujourd'hui, même sur du travail
  --    plus ancien : c'est ce que le dirigeant veut savoir en demandant « quoi de neuf ».
  insert into public.outcome (tenant_id, task_id, kind, declared_by)
  values (entreprise, hier, 'response', 'client');

  select * into t from public.travail_sur_la_periode(entreprise, debut, fin);
  if t.reponses - avant.reponses <> 1 then
    raise exception 'ÉCHEC nouvelles : % réponse(s) de plus au lieu de 1.',
      t.reponses - avant.reponses;
  end if;

  -- ── 4. ⭐⭐ Ce que fait la VOISINE ne se raconte jamais ici.
  insert into public.employee (tenant_id, employee_definition_id, identity_id)
  select voisine, 'dddddddd-0000-0000-0000-000000000001', id
    from public.reserve_identity('commercial')
  returning id into employe_v;

  -- La voisine a déjà un objectif actif si un bloc précédent lui en a posé un : on le reprend
  -- plutôt que d'en poser un second, qu'une entreprise n'a pas le droit d'avoir.
  select id into objectif from public.objective
   where tenant_id = voisine and state = 'actif' limit 1;

  if objectif is null then
    insert into public.objective (tenant_id, metric, target_value, horizon)
    values (voisine, 'chiffre_affaires', 5000, 'mois') returning id into objectif;
  end if;

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (voisine, employe_v, objectif, 'lead', gen_random_uuid()) returning id into jamais;
  insert into public.execution_event (tenant_id, employee_id, task_id, kind)
  values (voisine, employe_v, jamais, 'action_executee');
  insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
  values (voisine, jamais, 'sale', 7000, 'client');

  select * into t from public.travail_sur_la_periode(entreprise, debut, fin);

  if t.missions_agies - avant.missions_agies <> 1
     or t.ventes - avant.ventes <> 0
     or t.chiffre_affaires - avant.chiffre_affaires <> 0 then
    raise exception
      'ÉCHEC nouvelles : le travail d''une autre entreprise remonte dans ces nouvelles '
      '(% missions, % ventes, % €).',
      t.missions_agies - avant.missions_agies,
      t.ventes - avant.ventes,
      t.chiffre_affaires - avant.chiffre_affaires;
  end if;

  raise notice
    'OK  LADY-X — les nouvelles du jour ne comptent que ce jour, ce travail, cette entreprise';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-AI — deux employées d'une même entreprise ne s'attribuent pas le travail l'une de l'autre.
--
-- ══ CE QUE CE BLOC DÉFEND ══
--
-- Demande du fondateur : *« chaque agent a son propre chat, connecté à l'état de l'agent »*, et
-- *« vérifie que les états sont bien connectés à l'agent »*.
--
-- Avant `20260815120041`, les trois fonctions qui donnent ses chiffres à une employée comptaient
-- TOUT ce qui portait l'entreprise. Deux employées, et chacune répondait « voilà ce que j'ai
-- fait » en récitant le travail des deux. Ce n'est pas une fuite vers un tiers — RLS n'a jamais
-- été en cause — c'est un **mensonge sur l'auteur du travail**, à la première personne, sur la
-- seule surface où le dirigeant la croit sur parole.
--
-- ⚠️ CE BLOC ÉCHOUE SUR LE SCHÉMA D'AVANT. C'est sa raison d'être : sans employée nommée, les
-- deux mesures seraient égales, et l'assertion 1 tomberait.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  premiere   constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  seconde    uuid;
  objectif   uuid;
  mission    uuid;
  avant_p    record;
  avant_s    record;
  apres_p    record;
  apres_s    record;
  ensemble   record;
  n          integer;
begin
  -- Une SECONDE employée, dans la MÊME entreprise. C'est tout le sujet : l'isolation entre
  -- entreprises est déjà prouvée ailleurs (TEST-01), celle-ci ne l'est nulle part.
  insert into public.employee (tenant_id, employee_definition_id, identity_id)
  select entreprise, 'dddddddd-0000-0000-0000-000000000001', id
  from public.reserve_identity('commercial')
  returning id into seconde;

  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif' limit 1;

  -- ⚠️ Des ÉCARTS, jamais des totaux : les blocs précédents travaillent la même entreprise dans
  -- la même transaction. Un total absolu tiendrait aujourd'hui et accuserait ce bloc demain.
  select * into avant_p from public.bilan_de_l_employe(entreprise, 30, premiere);
  select * into avant_s from public.bilan_de_l_employe(entreprise, 30, seconde);

  -- Du travail attribué à la SECONDE, et à elle seule.
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, seconde, objectif, 'lead', gen_random_uuid())
  returning id into mission;
  insert into public.execution_event (tenant_id, employee_id, task_id, kind)
  values (entreprise, seconde, mission, 'action_executee');
  insert into public.outcome (tenant_id, task_id, kind) values (entreprise, mission, 'meeting');

  select * into apres_p from public.bilan_de_l_employe(entreprise, 30, premiere);
  select * into apres_s from public.bilan_de_l_employe(entreprise, 30, seconde);

  -- ── 1. ⭐ LE CŒUR : la première ne s'attribue RIEN du travail de la seconde.
  if apres_p.rendez_vous <> avant_p.rendez_vous
     or apres_p.missions_agies <> avant_p.missions_agies then
    raise exception
      'ÉCHEC : la première employée s''attribue le travail de la seconde (rendez-vous % -> %, missions agies % -> %).',
      avant_p.rendez_vous, apres_p.rendez_vous, avant_p.missions_agies, apres_p.missions_agies;
  end if;

  -- ── 2. Et la seconde le compte bien, sans quoi le filtre ne filtrerait pas : il effacerait.
  if apres_s.rendez_vous <> avant_s.rendez_vous + 1
     or apres_s.missions_agies <> avant_s.missions_agies + 1 then
    raise exception
      'ÉCHEC : la seconde employée ne compte pas son propre travail (rendez-vous % -> %, missions agies % -> %).',
      avant_s.rendez_vous, apres_s.rendez_vous, avant_s.missions_agies, apres_s.missions_agies;
  end if;

  -- ── 3. Sans employée nommée, l'entreprise entière est comptée — le sens d'origine est intact,
  --       donc les appels qui ne connaissent pas d'employée n'ont pas changé de réponse.
  select * into ensemble from public.bilan_de_l_employe(entreprise, 30);
  if ensemble.rendez_vous < apres_p.rendez_vous + apres_s.rendez_vous then
    raise exception
      'ÉCHEC : sans employée nommée, le bilan doit couvrir toute l''entreprise (% < % + %).',
      ensemble.rendez_vous, apres_p.rendez_vous, apres_s.rendez_vous;
  end if;

  -- ── 4. La conversation appartient à une employée, et la BASE le garantit. Un message adressé à
  --       l'employée d'une autre entreprise doit être refusé, quoi que fasse le code appelant.
  insert into public.conversation_message (tenant_id, employee_id, auteur, texte)
  values (entreprise, seconde, 'dirigeant', 'Qu''as-tu fait aujourd''hui ?');

  begin
    insert into public.conversation_message (tenant_id, employee_id, auteur, texte)
    values ('bbbbbbbb-0000-0000-0000-000000000002', seconde, 'dirigeant', 'Et chez la voisine ?');
    raise exception
      'ÉCHEC : la base a accepté un message rattaché à l''employée d''une AUTRE entreprise.';
  exception
    when foreign_key_violation then null;
  end;

  -- ── 5. Le fil de l'une n'est pas le fil de l'autre.
  select count(*)::integer into n from public.conversation_message
   where tenant_id = entreprise and employee_id = premiere;
  if n <> 0 then
    raise exception
      'ÉCHEC : la première employée voit % message(s) qui ne lui ont pas été adressés.', n;
  end if;

  raise notice
    'OK  LADY-AI — deux employées d''une même entreprise gardent leurs chiffres et leur conversation';
end;
$$;



-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-Y — les chiffres que le dirigeant voit en arrivant.
--
-- C'est la première chose qu'il lit, tous les jours. Un chiffre gonflé ici n'est pas une erreur
-- d'affichage : c'est ce qui décide s'il continue de payer, et s'il croit le reste.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  objectif   uuid;
  mission    uuid;
  fiche      uuid;
  avant      record;
  b          record;
  jours      integer;
begin
  -- Comme LADY-X : on mesure des ÉCARTS. Les blocs précédents travaillent la même entreprise.
  select * into avant from public.bilan_de_l_employe(entreprise, 14);

  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif' limit 1;

  -- ── 1. La série rend TOUS les jours de la fenêtre, y compris les jours vides.
  --    Une courbe qui saute les jours sans travail relie lundi à jeudi en ligne droite et donne
  --    à voir une progression continue là où il ne s'est rien passé.
  select count(*) into jours from public.serie_quotidienne(entreprise, 14);
  if jours <> 14 then
    raise exception
      'ÉCHEC tableau : la série rend % jours au lieu de 14. Les jours vides ont été sautés, et '
      'la courbe ment sur ce qui s''est passé entre deux.', jours;
  end if;

  -- ── 2. ⭐⭐ Une entreprise qui répond, obtient un rendez-vous PUIS signe reste UNE entreprise.
  --    La compter trois fois gonflerait le seul chiffre auquel un dirigeant tient vraiment.
  insert into public.lead (tenant_id, company_name, email, source)
  values (entreprise, 'Menuiserie Duval', 'contact-lady-y@exemple.fr', 'import_client')
  returning id into fiche;

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', fiche)
  returning id into mission;

  insert into public.outcome (tenant_id, task_id, kind, declared_by)
  values (entreprise, mission, 'response', 'client');
  insert into public.outcome (tenant_id, task_id, kind, declared_by)
  values (entreprise, mission, 'meeting', 'client');
  insert into public.outcome (tenant_id, task_id, kind, value, declared_by)
  values (entreprise, mission, 'sale', 3000, 'client');

  select * into b from public.bilan_de_l_employe(entreprise, 14);

  if b.entreprises_engagees - avant.entreprises_engagees <> 1 then
    raise exception
      'ÉCHEC tableau : % entreprises engagées de plus pour UNE seule entreprise. Un rendez-vous '
      'et une vente chez le même prospect en font deux — le chiffre le plus regardé du produit '
      'serait gonflé.', b.entreprises_engagees - avant.entreprises_engagees;
  end if;

  -- ── 3. Les issues, elles, se comptent toutes : ce sont trois faits distincts.
  if b.reponses - avant.reponses <> 1 or b.rendez_vous - avant.rendez_vous <> 1
     or b.ventes - avant.ventes <> 1 then
    raise exception 'ÉCHEC tableau : les trois issues de cette entreprise n''ont pas été comptées.';
  end if;

  if b.chiffre_affaires - avant.chiffre_affaires <> 3000 then
    raise exception 'ÉCHEC tableau : % € de plus au lieu de 3000.',
      b.chiffre_affaires - avant.chiffre_affaires;
  end if;

  -- ── 4. ⭐ Une réponse SEULE n'est pas une entreprise engagée. « Merci, sans suite » est une
  --    réponse — la compter comme un engagement transformerait un refus poli en résultat.
  insert into public.lead (tenant_id, company_name, email, source)
  values (entreprise, 'Sans suite', 'poli-lady-y@exemple.fr', 'import_client')
  returning id into fiche;
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', fiche) returning id into mission;
  insert into public.outcome (tenant_id, task_id, kind, declared_by)
  values (entreprise, mission, 'response', 'client');

  select * into b from public.bilan_de_l_employe(entreprise, 14);

  if b.entreprises_engagees - avant.entreprises_engagees <> 1 then
    raise exception
      'ÉCHEC tableau : une entreprise qui a seulement répondu compte comme engagée. « Merci, '
      'sans suite » deviendrait un résultat.';
  end if;

  raise notice
    'OK  LADY-Y — tous les jours rendus, chaque entreprise comptée une fois, une réponse n''est pas une suite';
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
-- AUDIT-01 — les deux moitiés d'un accès doivent être d'accord, SUR LE SCHÉMA FINAL.
--
-- ══ POURQUOI CE BLOC EXISTE ICI, ET PAS DANS UNE MIGRATION ══
--
-- Le filet de `20260729120029` fait ces vérifications au moment où il est APPLIQUÉ. Les tables
-- créées après lui — il y en a eu une douzaine depuis — n'ont donc jamais été examinées. Un filet
-- qui ne couvre que le passé donne exactement la confiance qu'il ne mérite pas.
--
-- Ici, on tourne après TOUTES les migrations. Une table ajoutée demain est couverte le jour même.
--
-- ══ LES TROIS CONTRÔLES ══
--
--   1. RLS active partout — sinon l'isolation n'existe simplement pas ;
--   2. toute table portant `tenant_id` a une politique, ou est déclarée réservée au serveur ;
--   3. ⭐ toute politique `to authenticated` est ADOSSÉE À UN DROIT correspondant.
--
-- Le troisième est celui qui manquait, et il a trouvé quelque chose : quatre tables portaient une
-- politique de lecture sans aucun `grant`. Droit et politique sont indépendants sous Postgres —
-- le droit décide si l'on peut regarder la table, la politique quelles lignes. Sans droit, le
-- client est refusé AVANT que RLS ne s'exprime, et le message parle de permission, pas
-- d'isolation : personne ne fait le lien. L'espace du dirigeant lisait « configuration non
-- établie » alors qu'elle existait.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  -- Ce que le client ne doit jamais voir. La liste est DÉCLARÉE, jamais subie : une table ajoutée
  -- ici doit être un geste conscient.
  reserve_au_serveur constant text[] := array[
    'job',                 -- la file d'exécution est de la mécanique pure
    'execution_event',     -- le journal porte le raisonnement ; le client en voit des projections
    'diagnostic_session',  -- zone vitrine : aucun accès depuis la zone client, et réciproquement
    'audit_finding',       -- les constats naissent avant que l'entreprise existe
    'rattachement_attendu',-- une attente de rattachement n'appartient encore à personne
    'approvisionnement',   -- le lot de missions du jour : comptabilité interne du battement
    'strategy_variant',    -- notre méthode, pas la donnée du client
    'task_variant'         -- quelle variante a servi : mécanique de mesure
  ];
  sans_rls        text;
  sans_politique  text;
  sans_droit      text;
  contradictoire  text;
begin
  -- ── 1. RLS partout.
  select string_agg(c.relname, ', ' order by c.relname) into sans_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if sans_rls is not null then
    raise exception
      'ÉCHEC audit : isolation absente sur %. Activer RLS dans la migration qui crée la table.',
      sans_rls;
  end if;

  -- ── 2. Une table d'entreprise sans politique est presque toujours un oubli.
  select string_agg(t.relname, ', ' order by t.relname) into sans_politique
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attname = 'tenant_id' and a.attnum > 0
   where n.nspname = 'public' and t.relkind = 'r'
     and not (t.relname = any (reserve_au_serveur))
     and not exists (select 1 from pg_policy p where p.polrelid = t.oid);

  if sans_politique is not null then
    raise exception
      'ÉCHEC audit : table(s) portant tenant_id sans aucune politique : %. Ajouter la politique, '
      'ou déclarer la table réservée au serveur dans ce bloc.', sans_politique;
  end if;

  -- ── 2 bis. Et l'inverse : une table déclarée réservée au serveur qui gagnerait une politique
  --    rendrait la liste mensongère, donc le contrôle précédent inutile.
  select string_agg(t.relname, ', ' order by t.relname) into contradictoire
    from pg_class t join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = any (reserve_au_serveur)
     and exists (select 1 from pg_policy p where p.polrelid = t.oid);

  if contradictoire is not null then
    raise exception
      'ÉCHEC audit : % est déclarée réservée au serveur ET porte une politique. Choisir.',
      contradictoire;
  end if;

  -- ── 3. ⭐⭐ Une politique sans droit est une porte verrouillée dont on a retiré la poignée.
  select string_agg(distinct p.tablename || ' (' || p.cmd || ')', ', ' order by p.tablename || ' (' || p.cmd || ')')
    into sans_droit
    from pg_policies p
   where p.schemaname = 'public'
     and 'authenticated' = any(p.roles)
     and not exists (
       select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name = p.tablename
          and g.grantee = 'authenticated'
          and g.privilege_type = case p.cmd
                                   when 'SELECT' then 'SELECT'
                                   when 'INSERT' then 'INSERT'
                                   when 'UPDATE' then 'UPDATE'
                                   when 'DELETE' then 'DELETE'
                                   else 'SELECT'
                                 end
     );

  if sans_droit is not null then
    raise exception
      'ÉCHEC audit : politique(s) sans droit correspondant : %. Le client sera refusé AVANT que '
      'RLS ne s''exprime, avec un message qui parle de permission — personne ne fera le lien.',
      sans_droit;
  end if;

  -- ── 4. Et le symétrique, qui est le vrai risque de fuite : un droit accordé sur une table
  --    SANS politique pour ce rôle. RLS refuserait tout, mais le jour où quelqu'un ajoute une
  --    politique large « pour débloquer », le droit est déjà là et personne ne le relit.
  select string_agg(distinct g.table_name, ', ' order by g.table_name) into contradictoire
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'authenticated'
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = g.table_name and c.relkind = 'r')
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = g.table_name
          and 'authenticated' = any(p.roles));

  if contradictoire is not null then
    raise exception
      'ÉCHEC audit : droit(s) accordé(s) sans aucune politique : %. Retirer le droit — le laisser '
      'arme la table pour le jour où quelqu''un ajoutera une politique large.', contradictoire;
  end if;

  raise notice
    'OK  AUDIT-01 — RLS partout, politiques et droits d''accord, sur le schéma FINAL';
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
-- AUDIT-02 — aucune fonction ne répond sur l'entreprise du voisin.
--
-- ══ CE QUE CE BLOC A TROUVÉ LE JOUR OÙ IL A ÉTÉ ÉCRIT ══
--
-- `avancement_vers_l_objectif(entreprise)` était appelable par n'importe quel compte authentifié,
-- sur n'importe quelle entreprise, et rendait son **chiffre d'affaires**. Quatre autres fonctions
-- répondaient de même sur des informations moins graves — quota restant, verdicts d'ouverture et
-- d'envoi, cadence de relance.
--
-- Toutes pour la même raison : le `revoke` oublié dans leur migration. Le réflexe existait
-- partout ailleurs, et c'est précisément ce qui a rendu l'oubli invisible.
--
-- ⚠️ Une fonction `security definer` ignore RLS **par construction** : c'est tout son intérêt, et
-- c'est ce qui la rend dangereuse. Son argument `p_tenant` n'est pas une frontière — c'est un
-- paramètre. La seule frontière est le droit d'exécution.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  -- Les seules fonctions qu'un client a le droit d'appeler avec une entreprise en argument.
  -- Chacune doit répondre UNIQUEMENT sur le compte appelant, jamais sur une entreprise nommée.
  autorisees constant text[] := array[
    'is_tenant_member'  -- ne répond que sur auth.uid() : n'apprend rien sur personne d'autre
  ];
  ouvertes text;
begin
  select string_agg(
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           ', ' order by p.proname)
    into ouvertes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef                      -- ignore RLS par construction
     and not (p.proname = any (autorisees))
     and pg_get_function_identity_arguments(p.oid) like '%uuid%'
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));

  if ouvertes is not null then
    raise exception
      'ÉCHEC audit : fonction(s) « security definer » prenant un identifiant et appelable(s) par '
      'un client : %. Une telle fonction ignore RLS par construction — son argument n''est pas '
      'une frontière, c''est un paramètre. Ajouter « revoke execute … from public, authenticated, '
      'anon » dans sa migration.', ouvertes;
  end if;

  raise notice 'OK  AUDIT-02 — aucune fonction ne répond sur l''entreprise du voisin';
end;
$$;

-- ── AUDIT-03 — et le client ne lit rien du voisin, en le tentant vraiment ────────────────────
--
-- Le contrôle précédent est structurel. Celui-ci se met dans la peau d'un dirigeant authentifié
-- et va chercher, table par table, les données de l'entreprise d'à côté. Une politique peut
-- exister et être trop large : seule la tentative le dit.

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  vu integer;
  chez_moi integer;
begin
  insert into auth.users (id) values
    ('a11c0000-0000-0000-0000-000000000001'), ('b11c0000-0000-0000-0000-000000000002');
  insert into public.tenant (id, name) values (a, 'Entreprise A'), (b, 'Entreprise B');
  insert into public.tenant_member (tenant_id, user_id, role) values
    (a, 'a11c0000-0000-0000-0000-000000000001', 'owner'),
    (b, 'b11c0000-0000-0000-0000-000000000002', 'owner');

  insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
  select 'e11a0000-0000-0000-0000-00000000000a', a, 'dddddddd-0000-0000-0000-000000000001', id
    from public.reserve_identity('commercial');
  insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
  select 'e11b0000-0000-0000-0000-00000000000b', b, 'dddddddd-0000-0000-0000-000000000001', id
    from public.reserve_identity('commercial');

  insert into public.objective (tenant_id, metric, target_value, horizon) values
    (a, 'mrr', 1000, 'mois'), (b, 'mrr', 9999, 'mois');

  -- Ce que B a de plus précieux : ce que son employée a appris, et ce qu'il vend.
  insert into public.learned_fact (tenant_id, employee_id, fact, author) values
    (b, 'e11b0000-0000-0000-0000-00000000000b', 'SECRET DE B : ils signent en fin de trimestre.', 'apprentissage');
  insert into public.company_profile (tenant_id, key, value, author, status) values
    (b, 'cible', '"SECRET DE B"'::jsonb, 'client', 'actif');

  -- ══ On devient le dirigeant de A ══
  perform set_config('request.jwt.claim.sub', 'a11c0000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  -- ── 1. ⭐⭐ Rien de B n'est lisible.
  select (select count(*) from public.learned_fact where tenant_id = b)
       + (select count(*) from public.company_profile where tenant_id = b)
       + (select count(*) from public.objective where tenant_id = b)
       + (select count(*) from public.employee where tenant_id = b)
       + (select count(*) from public.tenant where id = b)
       + (select count(*) from public.tenant_member where tenant_id = b)
    into vu;

  if vu <> 0 then
    raise exception
      'ÉCHEC audit : le dirigeant de A voit % ligne(s) de l''entreprise B. C''est une fuite.', vu;
  end if;

  -- ── 2. Et il voit bien la sienne — sinon on aurait « prouvé » l'isolation en bloquant tout.
  select (select count(*) from public.objective) + (select count(*) from public.employee)
    into chez_moi;

  if chez_moi < 2 then
    raise exception
      'ÉCHEC audit : le dirigeant de A ne voit pas ses propres données (% lignes). Une isolation '
      'qui bloque aussi le légitime n''est pas une isolation, c''est une panne.', chez_moi;
  end if;

  -- ── 3. ⭐ Et il ne peut pas s'inviter chez B.
  begin
    insert into public.tenant_member (tenant_id, user_id, role)
    values (b, 'a11c0000-0000-0000-0000-000000000001', 'owner');
    raise exception 'ÉCHEC audit : le dirigeant de A s''est ajouté comme membre de B.';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'ÉCHEC audit%' then raise; end if;
  end;

  reset role;
  raise notice 'OK  AUDIT-03 — un dirigeant ne lit rien du voisin, et lit tout chez lui';
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-AG — après assez de silence, elle s'arrête d'elle-même.
--
-- Le reproche le plus documenté fait aux produits concurrents, mot pour mot dans les avis
-- publics : « ~1 400 emails envoyés. 0 réponse reçue. » Le produit avait continué, jour après
-- jour. Le client a payé deux fois : en abonnement, et en réputation de domaine brûlée.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  objectif   uuid;
  domaine    uuid;
  fiche      uuid;
  mission    uuid;
  verdict    text;
  i          integer;
begin
  select id into objectif from public.objective where tenant_id = entreprise and state = 'actif' limit 1;

  insert into public.sending_domain
    (tenant_id, domain, spf_verified_at, dkim_verified_at, dmarc_verified_at, warmup_started_on)
  values (entreprise, 'silence-lady-ag.fr', now(), now(), now(), current_date - 30)
  returning id into domaine;

  -- Qualifié : la garde du silence ne s'exprime que lorsque rien d'autre ne bloque, et un
  -- prospect non qualifié bloque — à raison.
  insert into public.lead (tenant_id, company_name, email, source, qualification)
  values (entreprise, 'Silence', 'silence-lady-ag@exemple.fr', 'import_client', 'qualifie')
  returning id into fiche;

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', fiche) returning id into mission;

  -- ── 1. Au début, rien ne s'oppose à l'envoi.
  verdict := public.peut_envoyer(entreprise, fiche, domaine, 0, 50);
  if verdict = 'silence_total' then
    raise exception 'ÉCHEC silence : la garde se déclenche avant le moindre envoi.';
  end if;

  -- ── 2. Quarante messages partent, et personne ne répond.
  --
  -- ⚠️ `sent_at` est POSÉ EXPLICITEMENT, et pas laissé à `now()`. Dans une transaction, tous les
  -- `now()` rendent le MÊME instant : les messages seraient alors simultanés aux réponses posées
  -- par les blocs précédents, et « envoyé après la dernière réponse » deviendrait faux — le
  -- contrôle passerait à côté de ce qu'il vérifie. En production les deux instants diffèrent
  -- toujours ; ici il faut le dire.
  for i in 1..40 loop
    insert into public.outbound_message
      (tenant_id, lead_id, employee_id, sending_domain_id, subject, carried_optout, carried_notice,
       idempotency_key, sent_at)
    values (entreprise, fiche, employe, domaine, 'Message ' || i, true, true, 'silence-' || i,
            now() + interval '1 hour');
  end loop;

  -- ── 3. ⭐⭐ Elle s'arrête d'elle-même, et le motif NOMME la cause.
  verdict := public.peut_envoyer(entreprise, fiche, domaine, 0, 50);
  if verdict <> 'silence_total' then
    raise exception
      'ÉCHEC silence : 40 messages sans une seule réponse, et la garde rend « % ». C''est '
      'exactement le défaut reproché aux concurrents : le silence compté comme un volume à '
      'augmenter.', verdict;
  end if;

  -- ── 4. ⭐ Une seule réponse suffit à repartir : le compteur part de la DERNIÈRE réponse, pas
  --    du début des temps. Une entreprise qui a reçu une réponse hier n'est pas dans le silence.
  insert into public.outcome (tenant_id, task_id, kind, declared_by, recorded_at)
  values (entreprise, mission, 'response', 'client', now() + interval '2 hours');

  verdict := public.peut_envoyer(entreprise, fiche, domaine, 0, 50);
  if verdict = 'silence_total' then
    raise exception
      'ÉCHEC silence : une réponse vient d''arriver et la garde bloque encore. Le compteur ne '
      'repart pas de la dernière réponse.';
  end if;

  -- ── 5. Le dirigeant peut passer outre — c'est lui qui décide, toujours.
  delete from public.outcome where tenant_id = entreprise and task_id = mission;
  if public.peut_envoyer(entreprise, fiche, domaine, 0, 50) <> 'silence_total' then
    raise exception 'ÉCHEC silence : le montage du cas « passer outre » ne bloque plus.';
  end if;

  perform public.continuer_malgre_le_silence(entreprise, 'Cycle long, je sais.');

  if public.peut_envoyer(entreprise, fiche, domaine, 0, 50) = 'silence_total' then
    raise exception
      'ÉCHEC silence : le dirigeant a dit de continuer et la garde bloque quand même. Un '
      'garde-fou qu''on ne peut pas lever devient une panne.';
  end if;

  -- ── 6. ⭐ Et le passe-droit ne vaut pas pour toujours : la première réponse le lève, donc la
  --    série SUIVANTE de silence sera de nouveau signalée.
  insert into public.outcome (tenant_id, task_id, kind, declared_by, recorded_at)
  values (entreprise, mission, 'response', 'client', now() + interval '3 hours');

  if (select passe_outre_le from public.garde_du_silence where tenant_id = entreprise) is not null then
    raise exception
      'ÉCHEC silence : le passe-droit survit à une réponse. Il vaudrait alors pour toujours, et '
      'le garde-fou ne se redéclencherait jamais.';
  end if;

  -- ── 7. L'arrêt du dirigeant passe AVANT : c'est lui qui prime, et le motif doit le dire.
  perform public.mettre_en_pause(entreprise, employe, 'Je vérifie.');
  if public.peut_envoyer(entreprise, fiche, domaine, 0, 50) <> 'employe_arrete' then
    raise exception 'ÉCHEC silence : l''arrêt du dirigeant ne passe pas avant la garde du silence.';
  end if;
  perform public.reprendre_le_travail(entreprise, employe);

  raise notice
    'OK  LADY-AG — 40 messages sans réponse et elle s''arrête ; une réponse relance ; le dirigeant tranche';
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LADY-AH — ce que le client lit sur sa formule est ce qui lui sera réellement appliqué.
--
-- Le risque n'est pas d'afficher un chiffre faux : c'est d'afficher un chiffre **vrai ailleurs**.
-- Si l'espace comptait les missions autrement que la garde qui applique le plafond, le dirigeant
-- lirait « il vous en reste 12 » pendant qu'on lui refuse la treizième — et il n'aurait aucun
-- moyen de comprendre pourquoi.
-- ════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  entreprise constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  employe    constant uuid := 'ffffffff-0000-0000-0000-000000000001';
  objectif   uuid;
  a          record;
  restant    integer;
begin
  select id into objectif from public.objective
   where tenant_id = entreprise and state = 'actif' limit 1;

  select * into a from public.abonnement_du_client(entreprise);

  if a.formule is null then
    raise exception 'ÉCHEC formule : aucune formule rendue pour une entreprise abonnée.';
  end if;

  -- ── 1. ⭐⭐ Le compte affiché et le compte qui applique le plafond sont LE MÊME.
  select public.missions_restantes_sur_la_periode(entreprise) into restant;

  if restant is not null and a.missions_plafond is not null
     and a.missions_plafond - a.missions_utilisees <> restant then
    raise exception
      'ÉCHEC formule : l''espace annonce % missions restantes, la garde en compte %. Le dirigeant '
      'lirait un chiffre vrai ailleurs, et se verrait refuser une mission sans comprendre.',
      a.missions_plafond - a.missions_utilisees, restant;
  end if;

  -- ── 2. Une mission de plus se voit des deux côtés, du même montant.
  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  values (entreprise, employe, objectif, 'lead', gen_random_uuid());

  declare
    apres record;
  begin
    select * into apres from public.abonnement_du_client(entreprise);
    if apres.missions_utilisees - a.missions_utilisees <> 1 then
      raise exception
        'ÉCHEC formule : une mission ouverte et le compteur bouge de %.',
        apres.missions_utilisees - a.missions_utilisees;
    end if;
  end;

  -- ── 3. ⭐ Les plafonds viennent de `plan_quota`, pas d'une valeur écrite dans l'interface.
  --    Changer une formule doit rester une modification de données (TEST-09).
  if a.missions_plafond is distinct from
     (select q.quota_limit::integer from public.plan_quota q
       join public.subscription s on s.plan_id = q.plan_id
      where s.tenant_id = entreprise and s.status = 'active'
        and q.metric = 'tasks_per_period') then
    raise exception 'ÉCHEC formule : le plafond affiché ne vient pas de plan_quota.';
  end if;

  -- ── 4. Sans abonnement actif, la fonction ne rend RIEN — elle n'invente pas une formule.
  if exists (select 1 from public.abonnement_du_client('bbbbbbbb-0000-0000-0000-000000000002')
              where formule is not null)
     and not exists (select 1 from public.subscription
                      where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002' and status = 'active')
  then
    raise exception 'ÉCHEC formule : une formule est rendue pour une entreprise sans abonnement.';
  end if;

  raise notice
    'OK  LADY-AH — la formule affichée est celle qui s''applique, et les plafonds viennent des données';
end;
$$;


rollback;
