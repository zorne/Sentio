-- Tests des invariants du schéma.
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

insert into public.employee_definition (id, profession, version, dna) values
  ('dddddddd-0000-0000-0000-000000000001', 'commercial', 1, '{"perimetre": ["prospection"]}'::jsonb);

-- Un employé recruté sur une identité prise dans le réservoir semé.
insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
select 'ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
       'dddddddd-0000-0000-0000-000000000001', id
from public.reserve_identity('commercial');

insert into public.task (id, tenant_id, employee_id) values
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'ffffffff-0000-0000-0000-000000000001');


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
    insert into public.recommendation (diagnostic_session_id, employee_definition_id, justification, status)
    values (session_id, 'dddddddd-0000-0000-0000-000000000001', 'Un commercial fera l''affaire.', 'hors_perimetre');
    raise exception 'ÉCHEC : un employé a été recommandé alors que le besoin est hors périmètre.';
  exception when check_violation then
    null;
  end;

  insert into public.recommendation (diagnostic_session_id, justification, status)
  values (session_id, 'Votre besoin porte sur la comptabilité, hors de ce que Sentio sait faire aujourd''hui.', 'hors_perimetre');

  raise notice 'OK  diagnostic — hors périmètre, aucun employé recommandé';
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

  begin
    select count(*) into visible from public.identity;
    raise exception 'ÉCHEC : le client a pu interroger le réservoir d''identités (% lignes).', visible;
  exception when insufficient_privilege then
    null;
  end;

  reset role;
  raise notice 'OK  mécanique — journal, file et réservoir hors d''atteinte du client';
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

rollback;
