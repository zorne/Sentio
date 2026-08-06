-- EXEC-07 — relier les événements d'un même pas, pour pouvoir répondre « pourquoi ? ».
--
-- ⚠️ CE QUI MANQUAIT.
--
-- Le journal contenait déjà tout : le contexte assemblé, la proposition du modèle, la décision de
-- politique, l'engagement, le résultat. Mais **rien ne les reliait**. Reconstituer « pourquoi cet
-- email est-il parti ? » demandait de deviner, à partir des horodatages et de l'ordre, quels
-- événements appartenaient au même raisonnement — et de se tromper dès que deux pas se
-- chevauchaient.
--
-- Une trace qu'on doit deviner n'est pas une trace. C'est ce qui sépare « votre employé a écrit à
-- Julie parce que vous avez déclaré viser les architectes, qu'il a jugé qu'elle correspondait, et
-- que vous aviez autorisé les envois » de « l'IA l'a fait ».
--
-- `step_id` est cet identifiant : un pas de run, du chargement du contexte jusqu'au résultat.
-- Nul pour les événements qui n'appartiennent à aucun pas (routage du Gateway, effacement).
--
-- ⚠️ POURQUOI UNE COLONNE ET NON UNE CLÉ DANS `payload`.
--
-- `erase_tenant()` remet `payload` à `{}` : un identifiant de corrélation qui y vivrait
-- disparaîtrait au premier droit à l'effacement exercé, et avec lui la capacité à prouver
-- **qu'un processus s'est déroulé correctement** — ce qui n'est pas une donnée personnelle et
-- n'a pas à être effacé. La colonne survit ; le contenu, lui, part comme il doit.
--
-- Réalise : EXEC-07

alter table public.execution_event add column step_id uuid;

-- Le chemin d'accès de la trace : tous les événements d'un pas, dans l'ordre.
create index execution_event_step_idx on public.execution_event (task_id, step_id, seq)
  where step_id is not null;

comment on column public.execution_event.step_id is
  'Relie les événements d''un même pas de run : contexte → proposition → politique → effet → '
  'résultat. Colonne et non clé de payload, pour survivre à l''anonymisation : la forme du '
  'processus se prouve même après effacement du contenu.';
