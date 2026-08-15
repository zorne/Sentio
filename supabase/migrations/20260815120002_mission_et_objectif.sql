-- LADY-B — une mission dit désormais QUEL objectif elle sert.
--
-- ══ CE QUI MANQUAIT ══
--
-- `task` — qui EST la mission depuis `20260807120002` (`adr/0027`) — ne portait aucun lien vers
-- `objective`. Trois conséquences, toutes constatées dans le schéma le 2026-08-15 :
--
--   · une mission ne pouvait pas être justifiée : rien ne disait pourquoi elle avait été ouverte ;
--   · un résultat ne pouvait pas être rattaché à l'objectif qu'il fait avancer ;
--   · le risque « des tâches sans objectif » (`docs/28` §6) n'était pas un risque, il était réalisé.
--
-- La règle existait pourtant déjà, mais seulement en passant : `peut_ouvrir_une_mission()` refuse
-- d'ouvrir quand aucun objectif n'est actif. Ce qu'elle ne faisait pas, c'est **écrire lequel**.
-- Un contrôle à l'entrée ne remplace pas un lien : il empêche d'ouvrir à tort, il ne permet pas
-- de répondre « pour quoi ce travail a-t-il été fait ».
--
-- ══ « UN objectif actif » — la décision prise ici ══
--
-- Rattacher une mission à un objectif suppose de savoir DUQUEL on parle. `objective` acceptait
-- plusieurs lignes actives par entreprise, et rien ne disait laquelle faisait foi — c'est
-- exactement l'ambiguïté que la tâche `EXEC-16` avait relevée sans la refermer.
--
-- Elle est refermée ici par le haut plutôt que par une règle de tri : **une entreprise n'a qu'un
-- objectif actif à la fois.** C'est ce que le produit promet déjà — « la progression vers votre
-- objectif », au singulier — et c'est la seule forme qui rende le rattachement décidable sans
-- convention cachée. Changer d'objectif reste possible : on retire l'ancien, on en pose un neuf,
-- et les missions déjà ouvertes gardent le leur, ce qui est précisément ce qu'on veut pouvoir
-- relire ensuite.
--
-- ══ POURQUOI UN DÉCLENCHEUR ET PAS UN `not null` ══
--
-- Un `not null` aurait été plus simple, et il est faux ici — l'effacement RGPD l'a montré.
--
-- `erase_tenant()` SUPPRIME les objectifs mais **conserve les missions** : le journal les
-- référence, et il doit survivre dépouillé plutôt que détruit, sinon l'effacement devient une
-- destruction de preuve (`20260729120036`, art. 5.2). Une cascade aurait donc emporté le journal
-- avec l'objectif ; un `restrict` aurait fait échouer l'effacement.
--
-- La garantie est donc posée là où elle est vraie : **à la création**. Une mission ne peut pas
-- naître sans objectif — c'est un déclencheur qui le refuse, pas une convention d'appel. Le seul
-- chemin qui laisse une mission sans objectif est l'effacement, où c'est précisément l'intention :
-- il ne reste qu'une coquille qui ancre le journal dépouillé.
--
-- Réalise : LADY-B, EXEC-16

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Un seul objectif actif par entreprise
-- ═════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  en_trop integer;
begin
  select count(*) into en_trop
  from (
    select tenant_id from public.objective where state = 'actif'
    group by tenant_id having count(*) > 1
  ) as multiples;

  if en_trop > 0 then
    raise exception
      '% entreprise(s) portent plusieurs objectifs actifs. En retirer avant d''appliquer.', en_trop;
  end if;
end;
$$;

-- Remplace l'index simple de `20260807120002` : même usage en lecture, plus la garantie.
drop index if exists public.objective_actif_idx;

create unique index objective_un_seul_actif
  on public.objective (tenant_id)
  where state = 'actif';

comment on index public.objective_un_seul_actif is
  'Une entreprise n''a qu''un objectif actif. C''est ce qui rend « quel objectif cette mission '
  'sert-elle » décidable sans convention de tri (EXEC-16).';

-- La convention du dépôt pour toute clé étrangère : elle porte l'entreprise, pour qu'aucun lien
-- ne puisse traverser deux entreprises (`20260729120033`).
alter table public.objective
  add constraint objective_tenant_id_key unique (tenant_id, id);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. La mission porte son objectif
-- ═════════════════════════════════════════════════════════════════════════════════════════════

alter table public.task add column objective_id uuid;

-- `set null` sur la seule colonne visée : l'effacement détache la mission de son objectif sans
-- toucher à son entreprise. Même forme que `company_profile.source_task_id` (`20260729120022`).
alter table public.task
  add constraint task_objective_id_fkey
    foreign key (tenant_id, objective_id)
    references public.objective (tenant_id, id)
    on delete set null (objective_id);

create index task_objective_idx on public.task (tenant_id, objective_id);

-- ⚠️ LA garantie de cette migration. À l'INSERT seulement : c'est à la naissance qu'une mission
-- doit savoir pour quoi elle est ouverte. Après, seul l'effacement peut la détacher.
--
-- En déclencheur plutôt qu'en `not null` parce qu'un `not null` interdirait aussi le détachement
-- par l'effacement — et parce qu'aucune vérification côté appelant ne tient des mois : celle-ci
-- ne peut pas être oubliée.
create function public.mission_sert_un_objectif()
returns trigger
language plpgsql
as $$
begin
  if new.objective_id is null then
    raise exception
      'Mission refusée : aucune mission ne s''ouvre sans objectif. Un employé lancé sans but '
      'travaille pour personne, et son résultat ne se rattache à rien.';
  end if;
  return new;
end;
$$;

create trigger task_sert_un_objectif
  before insert on public.task
  for each row execute function public.mission_sert_un_objectif();

comment on column public.task.objective_id is
  'L''objectif que cette mission sert. Exigé à la création par le déclencheur '
  'task_sert_un_objectif. Nul uniquement après un effacement RGPD, où la mission ne subsiste '
  'que pour ancrer le journal dépouillé.';
