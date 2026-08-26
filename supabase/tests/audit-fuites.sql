-- AUDIT DE FUITES — un vrai client de l'entreprise A essaie d'atteindre l'entreprise B.
--
-- Complémentaire des invariants AUDIT-01/02/03, qui font la même chose en version courte et
-- bloquante. Celui-ci est l'outil de FOUILLE : il liste table par table, fonction par fonction,
-- ce qui répond et ce qui refuse — pour qu'on puisse lire le détail, pas seulement un verdict.
--
--     psql -d "$DATABASE_URL" -f supabase/tests/audit-fuites.sql
--
-- Il a trouvé, la première fois : `avancement_vers_l_objectif` rendait le CHIFFRE D'AFFAIRES de
-- n'importe quelle entreprise à n'importe quel compte authentifié (LADY-AD).
--
-- Tout se déroule dans une transaction annulée à la fin : rien n'est écrit.

-- AUDIT — un vrai client de l'entreprise A essaie d'atteindre l'entreprise B.
--
-- Le filet existant (`20260729120029`) vérifie une propriété STRUCTURELLE : RLS activée, une
-- politique par table. Il ne prouve pas l'isolation à l'usage — une politique peut exister et
-- être trop large. Ce script-ci se met dans la peau d'un client authentifié et essaie, table par
-- table, de lire et d'écrire chez le voisin.

\set ON_ERROR_STOP off
begin;

-- ── Deux entreprises, deux dirigeants, chacun membre de la sienne.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.tenant (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Entreprise A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Entreprise B');

insert into public.tenant_member (tenant_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.employee_definition (id, gisement, version, dna, capacites) values
  ('dddddddd-0000-0000-0000-00000000000d', 'commercial', 4242,
   '{"profession":"commercial","mission":"vendre","perimetre":["qualifier"],"limites":["juridique"]}'::jsonb,
   '["qualifier.prospect"]'::jsonb);

insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
select 'eeeeeeee-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-00000000000d', id
from public.reserve_identity('commercial');
insert into public.employee (id, tenant_id, employee_definition_id, identity_id)
select 'eeeeeeee-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'dddddddd-0000-0000-0000-00000000000d', id
from public.reserve_identity('commercial');

insert into public.objective (id, tenant_id, metric, target_value, horizon) values
  ('0b1ec71f-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'mrr', 1000, 'mois'),
  ('0b1ec71f-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'mrr', 9999, 'mois');

insert into public.lead (id, tenant_id, company_name, email, source) values
  ('11ead000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Client de A', 'a@exemple.fr', 'import_client'),
  ('11ead000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Client de B', 'b@exemple.fr', 'import_client');

insert into public.task (id, tenant_id, employee_id, objective_id, subject_kind, subject_id) values
  ('7a5c0000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000a', '0b1ec71f-0000-0000-0000-00000000000a', 'lead', '11ead000-0000-0000-0000-00000000000a'),
  ('7a5c0000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b', '0b1ec71f-0000-0000-0000-00000000000b', 'lead', '11ead000-0000-0000-0000-00000000000b');

insert into public.learned_fact (tenant_id, employee_id, fact, author) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b',
   'SECRET DE B : les acheteurs signent en fin de trimestre.', 'apprentissage');

insert into public.company_profile (tenant_id, key, value, author, status) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'secteur', '"SECRET DE B"'::jsonb, 'client', 'actif');

insert into public.outcome (tenant_id, task_id, kind, value, declared_by) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', '7a5c0000-0000-0000-0000-00000000000b', 'sale', 50000, 'client');

insert into public.notification (tenant_id, employee_id, kind, message) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b', 'travail', 'SECRET DE B');

insert into public.approval (tenant_id, task_id, state) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', '7a5c0000-0000-0000-0000-00000000000b', 'requested');

-- ══ On devient le dirigeant de A, avec le rôle d'un vrai client ══
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);


\echo ''
\echo '===== 1. LECTURE CHEZ LE VOISIN — 0 ou REFUS attendu partout ====='
savepoint s;
select 'tenant' as table_lue, count(*) as lignes_vues from public.tenant where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'tenant_member' as table_lue, count(*) as lignes_vues from public.tenant_member where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'employee' as table_lue, count(*) as lignes_vues from public.employee where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'objective' as table_lue, count(*) as lignes_vues from public.objective where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'task' as table_lue, count(*) as lignes_vues from public.task where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'lead' as table_lue, count(*) as lignes_vues from public.lead where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'learned_fact' as table_lue, count(*) as lignes_vues from public.learned_fact where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'company_profile' as table_lue, count(*) as lignes_vues from public.company_profile where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'outcome' as table_lue, count(*) as lignes_vues from public.outcome where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'notification' as table_lue, count(*) as lignes_vues from public.notification where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'approval' as table_lue, count(*) as lignes_vues from public.approval where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'subscription' as table_lue, count(*) as lignes_vues from public.subscription where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'lady_configuration' as table_lue, count(*) as lignes_vues from public.lady_configuration where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'lady_configuration_capability' as table_lue, count(*) as lignes_vues from public.lady_configuration_capability where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'strategy_change' as table_lue, count(*) as lignes_vues from public.strategy_change where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'task_variant' as table_lue, count(*) as lignes_vues from public.task_variant where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'tenant_variant_preference' as table_lue, count(*) as lignes_vues from public.tenant_variant_preference where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'outbound_message' as table_lue, count(*) as lignes_vues from public.outbound_message where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'suppression' as table_lue, count(*) as lignes_vues from public.suppression where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'approvisionnement' as table_lue, count(*) as lignes_vues from public.approvisionnement where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
savepoint s;
select 'strategy_variant' as table_lue, count(*) as lignes_vues from public.strategy_variant;
rollback to s;
savepoint s;
select 'job' as table_lue, count(*) as lignes_vues from public.job;
rollback to s;
savepoint s;
select 'execution_event' as table_lue, count(*) as lignes_vues from public.execution_event;
rollback to s;
savepoint s;
select 'diagnostic_session' as table_lue, count(*) as lignes_vues from public.diagnostic_session;
rollback to s;
\echo ''
\echo '===== 2. LECTURE CHEZ SOI — doit etre > 0, sinon RLS bloque le legitime ====='
savepoint s;
select 'employee' as table_lue, count(*) as lignes_chez_moi from public.employee;
rollback to s;
savepoint s;
select 'objective' as table_lue, count(*) as lignes_chez_moi from public.objective;
rollback to s;
savepoint s;
select 'lead' as table_lue, count(*) as lignes_chez_moi from public.lead;
rollback to s;
savepoint s;
select 'task' as table_lue, count(*) as lignes_chez_moi from public.task;
rollback to s;
savepoint s;
select 'lady_configuration' as table_lue, count(*) as lignes_chez_moi from public.lady_configuration;
rollback to s;
savepoint s;
select 'notification' as table_lue, count(*) as lignes_chez_moi from public.notification;
rollback to s;
\echo ''
\echo '===== 3. ECRITURES — chaque ligne doit ECHOUER ====='
\echo '--- changer l objectif de B ---'
savepoint s;
update public.objective set target_value = 1 where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
\echo '--- accorder une action chez B ---'
savepoint s;
update public.approval set state = 'granted' where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
rollback to s;
\echo '--- declarer une vente chez B ---'
savepoint s;
insert into public.outcome (tenant_id, task_id, kind, value, declared_by) values ('bbbbbbbb-0000-0000-0000-00000000000b', '7a5c0000-0000-0000-0000-00000000000b', 'sale', 1, 'client');
rollback to s;
\echo '--- s ajouter comme membre de B ---'
savepoint s;
insert into public.tenant_member (tenant_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'owner');
rollback to s;
\echo '--- deplacer une fiche de A vers B ---'
savepoint s;
update public.lead set tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
rollback to s;
\echo '--- ecrire dans la memoire de B ---'
savepoint s;
insert into public.learned_fact (tenant_id, employee_id, fact, author) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b', 'injecte par A', 'client');
rollback to s;
\echo '--- se donner plus d autonomie en base ---'
savepoint s;
update public.employee set autonomy = 'auto' where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
rollback to s;
\echo '--- publier une configuration a la main ---'
savepoint s;
insert into public.lady_configuration (tenant_id, employee_id, version, role, autonomie, declencheur, raison) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000a', 1, 'prospection', 'auto', 'recrutement', 'x');
rollback to s;
\echo '--- declarer une vente pour soi au nom de sentio ---'
savepoint s;
insert into public.outcome (tenant_id, task_id, kind, value, declared_by) values ('aaaaaaaa-0000-0000-0000-00000000000a', '7a5c0000-0000-0000-0000-00000000000a', 'sale', 99999, 'sentio');
rollback to s;
\echo ''
\echo '===== 4. FONCTIONS APPELEES DIRECTEMENT — REFUS attendu ====='
\echo '--- recruter ---'
savepoint s;
select public.recruter('00000000-0000-0000-0000-000000000000'::uuid, 'X', 'start', 'ref', 'x@y.fr');
rollback to s;
\echo '--- appliquer_la_configuration ---'
savepoint s;
select public.appliquer_la_configuration('00000000-0000-0000-0000-000000000000'::uuid);
rollback to s;
\echo '--- regler_l_autonomie chez B ---'
savepoint s;
select public.regler_l_autonomie('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b', 'auto', 'x');
rollback to s;
\echo '--- accepter_la_configuration chez B ---'
savepoint s;
select public.accepter_la_configuration('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000'::uuid);
rollback to s;
\echo '--- mettre_en_pause chez B ---'
savepoint s;
select public.mettre_en_pause('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b', 'x');
rollback to s;
\echo '--- erase_tenant sur B ---'
savepoint s;
select public.erase_tenant('bbbbbbbb-0000-0000-0000-00000000000b');
rollback to s;
\echo '--- bilan de B ---'
savepoint s;
select contactes, ventes, chiffre_affaires from public.bilan_de_l_employe('bbbbbbbb-0000-0000-0000-00000000000b', 30);
rollback to s;
\echo '--- travail de B ---'
savepoint s;
select messages_envoyes, ventes from public.travail_sur_la_periode('bbbbbbbb-0000-0000-0000-00000000000b', now() - interval '1 day', now());
rollback to s;
\echo '--- mesures de B ---'
savepoint s;
select missions_ouvertes from public.mesures_du_travail('bbbbbbbb-0000-0000-0000-00000000000b');
rollback to s;
\echo '--- avancement de B ---'
savepoint s;
select realise, cible from public.avancement_vers_l_objectif('bbbbbbbb-0000-0000-0000-00000000000b');
rollback to s;
\echo '--- resultats par variante de B ---'
savepoint s;
select count(*) from public.resultats_par_variante('bbbbbbbb-0000-0000-0000-00000000000b');
rollback to s;
\echo '--- serie quotidienne de B ---'
savepoint s;
select count(*) from public.serie_quotidienne('bbbbbbbb-0000-0000-0000-00000000000b', 3);
rollback to s;
\echo '--- etat_de_sante (exploitation) ---'
savepoint s;
select count(*) from public.etat_de_sante();
rollback to s;
\echo '--- reserve_identity (consomme une identite) ---'
savepoint s;
select count(*) from public.reserve_identity('commercial');
rollback to s;
\echo '--- is_tenant_member sur B ---'
savepoint s;
select public.is_tenant_member('bbbbbbbb-0000-0000-0000-00000000000b');
rollback to s;
\echo '--- peut_ouvrir_une_mission chez B ---'
savepoint s;
select public.peut_ouvrir_une_mission('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b');
rollback to s;

reset role;
rollback;
