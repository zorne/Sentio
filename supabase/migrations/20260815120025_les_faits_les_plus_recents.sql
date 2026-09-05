-- LADY-AA — l'index suit enfin le tri qui est réellement fait.
--
-- ══ CE QUI CLOCHAIT ══
--
-- `learned_fact_relevance_idx` classait par `usage_count desc`. Il servait un tri que le noyau
-- annonçait — « les plus utilisés d'abord » — et que **rien n'alimentait** : aucun chemin de code,
-- en production, n'a jamais incrémenté ce compteur. Le classement réel était donc chronologique,
-- et l'index le contredisait en silence.
--
-- ⚠️ **On ne rétablit pas le compteur, et c'est le point important.** Un compteur nourri par la
-- sélection qu'il alimente n'est pas une mesure, c'est une boucle : un fait injecté souvent l'est
-- parce qu'il l'a déjà été. Les cinq premières observations deviendraient des gagnantes
-- permanentes, un fait neuf partant à zéro ne serait jamais choisi donc jamais compté, et la
-- mémoire de l'employé se figerait définitivement.
--
-- La récence, elle, se mesure sans rien fausser. `usage_count` reste en base pour le jour où l'on
-- saura relier un fait à un RÉSULTAT — ce qui, là, serait une vraie mesure de pertinence.
--
-- Réalise : LADY-AA

drop index public.learned_fact_relevance_idx;

create index learned_fact_recence_idx
  on public.learned_fact (employee_id, created_at desc)
  where status = 'actif';

comment on index public.learned_fact_recence_idx is
  'Sert le tri réellement appliqué : les faits les plus récents d''abord (packages/core, '
  'assembleContext). Le tri par usage a été retiré — son compteur n''était nourri par personne.';

comment on column public.learned_fact.usage_count is
  'Conservé, et VOLONTAIREMENT non alimenté : un compteur nourri par la sélection qu''il alimente '
  'fige la mémoire sur les premiers faits appris. Il attend une mesure qui relie un fait à un '
  'résultat.';
