-- EXEC-02 — donner au journal un ordre total, sans lequel aucune reprise n'est déterministe.
--
-- ⚠️ CE QUI ÉTAIT CASSÉ, et qui ne se voyait pas.
--
-- `created_at` vaut `now()`, c'est-à-dire l'heure de DÉBUT DE TRANSACTION. Tous les événements
-- écrits dans une même transaction — ce que fait un pas de run qui décide puis agit puis
-- journalise — portent donc un horodatage **identique**, à la microseconde près. Vérifié sur une
-- base réelle : trois insertions dans une transaction, un seul `created_at` distinct.
--
-- L'ordre retombait alors sur le départage : `id`, un UUID v4. Autrement dit, l'ordre de
-- relecture d'un pas de run était **aléatoire**. Une reprise après interruption pouvait rejouer
-- « action exécutée » avant « action décidée » et reconstruire un état qui n'a jamais existé.
--
-- Rien n'échouait : c'est ce qui rend ce défaut coûteux. Un état faux reconstruit en silence
-- fait agir un employé sur une base fausse, et le journal — la preuve — semble cohérent.
--
-- CE QUE FAIT CETTE MIGRATION.
--
-- `seq` est un compteur d'insertion strictement croissant, attribué par la base au moment de
-- l'écriture. Il donne ce que `created_at` ne peut pas donner : un ordre **total**, stable, et
-- indépendant de l'horloge comme du découpage en transactions.
--
-- Pourquoi pas un compteur par tâche : il exigerait un verrou ou un calcul à chaque écriture, sur
-- le chemin le plus chaud du produit, pour un besoin qui n'existe pas — la reconstruction lit une
-- tâche à la fois et n'a besoin que de l'ordre RELATIF de ses propres événements. Un compteur
-- global le donne déjà.
--
-- Conséquence à assumer : `seq` comporte des trous dans le fil d'une tâche (les autres tâches
-- consomment le même compteur). Un trou n'est donc JAMAIS le signe d'un événement manquant, et
-- la reconstruction ne doit pas le lire ainsi — voir `packages/core/src/journal/run-state.ts`,
-- qui détecte les incohérences par les TRANSITIONS, jamais par les écarts de numéro.
--
-- Réalise : EXEC-02

alter table public.execution_event add column seq bigserial;

-- L'unicité n'est pas décorative : elle est l'hypothèse sur laquelle repose la reconstruction.
-- Deux événements de même rang rendraient l'ordre ambigu, donc la reprise non déterministe.
create unique index execution_event_seq_idx on public.execution_event (seq);

-- Le chemin d'accès de la reconstruction : tous les événements d'une tâche, dans l'ordre.
create index execution_event_task_seq_idx on public.execution_event (task_id, seq);

-- Remplacé par l'index ci-dessus : plus rien ne relit une tâche par `created_at`, et deux index
-- qui servent la même lecture coûtent deux écritures pour une seule utilité.
drop index if exists execution_event_task_idx;

comment on column public.execution_event.seq is
  'Ordre total du journal, attribué à l''écriture. La reconstruction d''un run trie là-dessus, '
  'jamais sur created_at (identique pour tous les événements d''une même transaction). '
  'Comporte des trous dans le fil d''une tâche : le compteur est global.';
