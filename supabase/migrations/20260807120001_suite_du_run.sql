-- EXEC-08 — la suite d'un run, et l'état qu'un humain doit pouvoir voir.
--
-- ══ CE QUI MANQUAIT, ET CE QUE ÇA COÛTAIT ══
--
-- Le runtime savait décider, exécuter et journaliser. Il ne savait pas **s'arrêter** : rien ne
-- distinguait un run qui avance d'un run bloqué, et rien n'était interrogeable pour savoir
-- qu'un client devait intervenir. Un employé suspendu en attente d'accord restait suspendu en
-- silence — c'est-à-dire qu'il ne travaillait plus, et que personne ne l'apprenait.
--
-- Décision produit du fondateur (2026-08-07) : **on ne notifie pas le client après chaque run.**
-- Une notification par run est un fil qu'on cesse de lire au bout d'une semaine, et le jour où
-- elle compte vraiment, elle passe inaperçue. On notifie quand — et seulement quand — l'employé
-- est bloqué et attend une personne. Voir `docs/adr/0026-cadence-et-borne-de-pas.md`.
--
-- ══ DEUX CHANGEMENTS ══
--
-- 1. `task.state` gagne « needs_attention ». Il existait « waiting_approval » — une QUESTION
--    posée au client sur une action précise, à laquelle il répond oui ou non. Il manquait le cas
--    où personne n'a rien à répondre : un effet irréversible engagé dont on ignore l'issue, un
--    contexte incomplet. Les ranger sous « waiting_approval » aurait affiché au client une
--    demande d'accord qui n'existe pas.
--
-- 2. La vue `intervention_requise` : la liste des runs arrêtés qui attendent une personne.
--    Elle est **dérivée du journal**, jamais tenue à jour à la main. C'est la règle
--    d'architecture d'EXEC-02 tenue jusqu'au bout : le journal fait foi, l'état se recalcule.
--    Une colonne « bloqué oui/non » se serait désynchronisée le premier jour d'un incident,
--    c'est-à-dire précisément le jour où elle sert.
--
-- Réalise : EXEC-08

-- ── 1. Un état de tâche pour « il faut quelqu'un, et il n'y a rien à approuver » ──────────────

alter table public.task drop constraint if exists task_state_check;

alter table public.task
  add constraint task_state_check
    check (state in ('pending', 'in_progress', 'waiting_approval', 'needs_attention', 'done', 'failed'));

comment on column public.task.state is
  'État mécanique de la tâche, du point de vue de la file. La vérité de ce qui s''est passé reste '
  'le journal (execution_event) : cette colonne se relit, elle ne s''interprète pas. '
  '« waiting_approval » = une question attend une réponse du client ; « needs_attention » = un '
  'humain doit constater quelque chose, sans qu''aucune question ne lui soit posée.';

-- ── 2. Les runs arrêtés qui attendent une personne ────────────────────────────────────────────

-- Le chemin d'accès de la vue : le dernier événement d'une tâche, sans parcourir toute la table.
create index if not exists execution_event_dernier_idx
  on public.execution_event (tenant_id, task_id, seq desc)
  where task_id is not null;

-- ⚠️ `security_invoker` : SANS lui, une vue s'exécute avec les droits de son propriétaire et
-- contourne l'isolation par entreprise de la table qu'elle lit. Une vue est exactement l'endroit
-- où une politique d'isolation se perd sans que personne ne s'en aperçoive — elle continue de
-- rendre des lignes, simplement plus les bonnes.
create or replace view public.intervention_requise
  with (security_invoker = true)
as
select dernier.tenant_id,
       dernier.task_id,
       dernier.employee_id,
       dernier.kind as motif,
       dernier.step_id,
       dernier.created_at as depuis,
       dernier.seq
  from (
    select distinct on (tenant_id, task_id)
           tenant_id, task_id, employee_id, kind, step_id, created_at, seq
      from public.execution_event
     where task_id is not null
     order by tenant_id, task_id, seq desc
  ) dernier
 -- ⚠️ Cette liste est la copie SQL de `NATURES_INTERVENTION_HUMAINE` (packages/core,
 -- `journal/vocabulaire.ts`). Une vue ne peut pas importer du TypeScript ; ce que la duplication
 -- coûte est donc payé par un test d'intégration qui compare les deux et échoue si l'une bouge
 -- sans l'autre — trois copies divergentes valent zéro règle (AGENTS.md, invariant 8).
 where dernier.kind in ('attention_requise', 'politique_suspend');

comment on view public.intervention_requise is
  'Les runs arrêtés qui attendent une personne — la seule source des notifications de blocage '
  '(EXEC-14). Dérivée du journal : le dernier événement d''une tâche dit son état, et rien ne '
  'la tient à jour à la main. Un événement postérieur (accord, reprise, fin) fait sortir la '
  'ligne de la vue par construction.';
