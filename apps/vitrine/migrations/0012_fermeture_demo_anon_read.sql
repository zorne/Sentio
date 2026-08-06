-- ════════════════════════════════════════════════════════════════════
-- Migration 0012 — fermeture de `demo_anon_read` (anomalie P0)
--
-- CE QUI ÉTAIT OUVERT. La migration 0008 posait, sous ADR-018 :
--
--     create policy demo_anon_read on execution_event
--       for select using (tenant_id = '00000000-...-0001');
--
-- Sans clause `to`, une policy s'applique à PUBLIC — donc au rôle `anon`.
-- Or la clé anon est publiée dans le bundle du navigateur : n'importe qui
-- pouvait interroger l'API REST du projet et lire tout le journal du
-- tenant démo, sans session. Et `execution_event.payload` porte les
-- entrées et sorties d'outils — prospects lus, messages rédigés,
-- résultats d'appels.
--
-- POURQUOI CE N'EST PLUS NÉCESSAIRE. 0008 existait parce qu'aucune
-- session n'authentifiait l'abonné temps réel. Ce n'est plus vrai :
-- `requireTenantAccess` (lib/tenant-access.ts) redirige vers /login sans
-- session, y compris pour le tenant démo. Toute personne qui atteint
-- /tasks/[id] — la seule page qui s'abonne — a donc une session. La
-- policy ne servait plus le produit ; elle ne servait plus que l'accès
-- direct à l'API.
--
-- CE QU'ON MET À LA PLACE. La même portée, moins l'anonyme : lecture du
-- journal du SEUL tenant démo, réservée aux sessions authentifiées.
-- C'est exactement ce que tenant-access autorise déjà côté application
-- (« le tenant démo : une session suffit, sans appartenance »), donc
-- aucune surface nouvelle — seulement l'ancienne, refermée.
--
-- CE QUE ÇA NE RÈGLE PAS, et qui reste vrai : le tenant démo n'est censé
-- porter que des données de test, et cette garantie tient à une ligne de
-- code (`dataClass = tenantId === DEMO_TENANT_ID ? "test" : "real"`),
-- pas à une contrainte de base. Voir docs/27-convergence.md §8.
--
-- Un test échoue si une policy rend à nouveau `execution_event` lisible
-- par un rôle non authentifié :
--   apps/vitrine/src/lib/company-briefing.integration.test.ts
-- ════════════════════════════════════════════════════════════════════

drop policy if exists demo_anon_read on execution_event;

create policy demo_journal_authentifie on execution_event
  for select
  to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Et la policy des membres, refermée au même titre.
--
-- Elle n'était PAS une fuite : `is_member()` compare à `auth.uid()`, qui est nul sans session,
-- donc un anonyme n'obtenait aucune ligne. Mais sans clause `to`, elle s'adressait à PUBLIC —
-- et une règle qui tient par son prédicat est une règle qu'on doit relire pour se rassurer.
-- L'invariant devient vérifiable d'un coup d'œil, et par un test : sur `execution_event`,
-- aucune policy ne s'adresse à un rôle non authentifié. Le comportement, lui, ne change pas.
drop policy if exists tenant_read_journal on execution_event;

create policy tenant_read_journal on execution_event
  for select
  to authenticated
  using (is_member(tenant_id));
