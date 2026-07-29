-- FOND-30 (suite) — une clé étrangère ne traverse jamais une entreprise.
--
-- ⚠️ POURQUOI CETTE MIGRATION EXISTE.
--
-- L'isolation posée jusqu'ici protège la LECTURE : chaque politique passe par is_tenant_member(),
-- et chaque repository ajoute sa condition d'entreprise. Rien ne protégeait le LIEN.
--
-- Vérifié sur une vraie base, avant cette migration : une ligne `outcome` portant le tenant A
-- pouvait référencer une `task` du tenant B, et un `learned_fact` du tenant A pouvait pointer
-- l'employé du tenant B. Les deux insertions étaient acceptées sans un mot, parce qu'une clé
-- étrangère vers `task (id)` ne sait rien de l'entreprise.
--
-- Ce que ça coûterait plus tard : un chiffre d'affaires attribué à la mauvaise entreprise, un
-- fait appris chez un client injecté dans le contexte d'un autre — c'est-à-dire exactement la
-- fuite que tout le reste du schéma s'emploie à rendre impossible, par le seul chemin qui n'était
-- pas gardé. Aucune revue de code ne rattrape ça de façon fiable : il suffit d'un `insert` qui
-- oublie de recopier le bon `tenant_id`.
--
-- La correction est structurelle : la clé étrangère porte l'entreprise. Le lien ne peut plus
-- exister qu'à l'intérieur d'une même entreprise, quel que soit le code qui l'écrit — serveur,
-- client, ou script de reprise.
--
-- Coût assumé : un index unique de plus sur chaque table parente, et deux colonnes dans chaque
-- clé étrangère. C'est le prix normal de ce motif en multi-entreprises.

-- ── Les tables parentes doivent pouvoir être référencées par (entreprise, identifiant) ───────
alter table public.employee        add constraint employee_tenant_id_key        unique (tenant_id, id);
alter table public.task            add constraint task_tenant_id_key            unique (tenant_id, id);
alter table public.strategy_change add constraint strategy_change_tenant_id_key unique (tenant_id, id);

-- ── Les liens vers un employé ────────────────────────────────────────────────────────────────
alter table public.task
  drop constraint task_employee_id_fkey,
  add constraint task_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade;

alter table public.employee_capability
  drop constraint employee_capability_employee_id_fkey,
  add constraint employee_capability_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade;

alter table public.execution_event
  drop constraint execution_event_employee_id_fkey,
  add constraint execution_event_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade;

alter table public.standing_approval
  drop constraint standing_approval_employee_id_fkey,
  add constraint standing_approval_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade;

alter table public.strategy_change
  drop constraint strategy_change_employee_id_fkey,
  add constraint strategy_change_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade;

alter table public.notification
  drop constraint notification_employee_id_fkey,
  add constraint notification_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade;

alter table public.learned_fact
  drop constraint learned_fact_employee_id_fkey,
  add constraint learned_fact_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade;

-- ── Les liens vers une tâche ─────────────────────────────────────────────────────────────────
alter table public.job
  drop constraint job_task_id_fkey,
  add constraint job_task_id_fkey
    foreign key (tenant_id, task_id) references public.task (tenant_id, id) on delete cascade;

alter table public.execution_event
  drop constraint execution_event_task_id_fkey,
  add constraint execution_event_task_id_fkey
    foreign key (tenant_id, task_id) references public.task (tenant_id, id) on delete cascade;

alter table public.approval
  drop constraint approval_task_id_fkey,
  add constraint approval_task_id_fkey
    foreign key (tenant_id, task_id) references public.task (tenant_id, id) on delete cascade;

alter table public.outcome
  drop constraint outcome_task_id_fkey,
  add constraint outcome_task_id_fkey
    foreign key (tenant_id, task_id) references public.task (tenant_id, id) on delete cascade;

-- `source_task_id` est facultatif, et la suppression de la tâche source ne doit effacer que
-- LUI — surtout pas l'entreprise de la ligne, qui n'est jamais nulle. D'où la liste de colonnes
-- explicite (Postgres 15+), sans laquelle la suppression d'une tâche échouerait sur une
-- violation de non-nullité.
alter table public.company_profile
  drop constraint company_profile_source_task_id_fkey,
  add constraint company_profile_source_task_id_fkey
    foreign key (tenant_id, source_task_id) references public.task (tenant_id, id)
    on delete set null (source_task_id);

alter table public.learned_fact
  drop constraint learned_fact_source_task_id_fkey,
  add constraint learned_fact_source_task_id_fkey
    foreign key (tenant_id, source_task_id) references public.task (tenant_id, id)
    on delete set null (source_task_id);

-- ── Le lien vers la preuve d'une évolution ───────────────────────────────────────────────────
-- Sans l'entreprise dans la clé, une notification pouvait s'adosser au changement de stratégie
-- d'un AUTRE client — une promesse de vente prouvée par la preuve de quelqu'un d'autre.
alter table public.notification
  drop constraint notification_strategy_change_id_fkey,
  add constraint notification_strategy_change_id_fkey
    foreign key (tenant_id, strategy_change_id) references public.strategy_change (tenant_id, id)
    on delete restrict;

-- ── Filet : plus aucune clé étrangère entre deux tables client ne doit ignorer l'entreprise ──
-- Le même contrôle est rejoué sur le schéma final par supabase/tests/invariants.sql, qui, lui,
-- voit aussi les tables ajoutées après cette migration.
do $$
declare
  incomplete text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by c.conrelid::regclass::text || '.' || c.conname)
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
      'Clé(s) étrangère(s) entre tables client sans l''entreprise dans la clé : %. Référencer (tenant_id, id), sinon le lien peut traverser deux entreprises.',
      incomplete;
  end if;

  raise notice 'OK  clés étrangères — aucun lien possible entre deux entreprises.';
end;
$$;
