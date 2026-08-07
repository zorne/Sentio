-- L'approvisionnement — d'où vient le travail d'un employé, et ce qui l'empêche d'en créer trop.
--
-- ══ CE QUI MANQUAIT ══
--
-- Le runtime savait exécuter une mission, la reporter, la terminer. **Rien ne créait de mission.**
-- `insert into task` n'existait que dans des fixtures de test : un employé recruté n'aurait
-- jamais rien eu à faire, et un employé dont la dernière mission se termine ne se serait jamais
-- réveillé. La promesse « votre employé travaille chaque jour » n'était tenue que d'un côté.
--
-- ══ LE MODÈLE, VALIDÉ PAR LE FONDATEUR LE 2026-08-07 ══
--
--   1 mission (`task`) = un sujet durable        · 1 cycle = une journée · 1 pas = une action
--
-- Les missions déjà ouvertes se réveillent **toutes seules** : `run_reporte` leur repose une
-- échéance à la cadence (EXEC-08). L'approvisionnement n'a donc qu'un seul travail — **ouvrir du
-- neuf** —, ce qui le rend beaucoup plus petit, et beaucoup plus sûr, qu'un « générateur de
-- travail quotidien ».
--
-- ══ CE QUE CETTE MIGRATION POSE, ET POURQUOI EN BASE ══
--
-- Ouvrir une mission de trop n'écrit pas une ligne en trop : ça écrit à un **vrai prospect** au
-- nom d'un **vrai client**. Les trois garde-fous sont donc dans la base, jamais dans un `if` :
--
--   1. `task` porte enfin SON SUJET, et un index unique interdit deux missions sur le même sujet ;
--   2. un lot d'approvisionnement par employé et par jour, en clé primaire : un battement rejoué
--      ou doublé ne peut pas ouvrir deux fois ;
--   3. un déclencheur refuse toute mission au-delà du quota de la formule — y compris insérée à
--      la main, y compris par le rôle de service qui ignore RLS.
--
-- `peut_ouvrir_une_mission()` rend la RAISON du refus, jamais un booléen : un employé qui
-- n'ouvre rien doit pouvoir dire pourquoi. Même forme que `peut_envoyer()` (`…120038`), et pour
-- la même raison — le seul garde qui tienne des mois sans surveillance est celui qu'on ne peut
-- pas oublier d'appeler.
--
-- Réalise : EXEC-17

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Une mission porte son sujet
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- Sans ces deux colonnes, deux missions du même employé étaient **strictement indiscernables** :
-- aucune requête ne pouvait dire « ce travail existe déjà ». C'est le manque qui rendait tout
-- anti-doublon impossible, quel que soit le soin mis dans le code appelant.
--
-- `subject_kind` est un TEXTE LIBRE, et c'est délibéré : `('lead', …)` sert le métier Commercial,
-- un métier futur nommera autre chose sans migration. Le domaine ne connaît que le couple, jamais
-- la table derrière — c'est ce qui garde l'approvisionnement généraliste (`adr/0027`).
--
-- Le défaut temporaire n'existe que pour rendre l'ajout de colonne légal ; il est retiré aussitôt,
-- comme pour `standing_approval.capability_key` (`…120002`). Aucune ligne n'existe en production.

alter table public.task
  add column subject_kind text not null default 'inconnu',
  add column subject_id   uuid not null default gen_random_uuid();

alter table public.task alter column subject_kind drop default;
alter table public.task alter column subject_id   drop default;

-- Une nature vide rendrait l'unicité inopérante sans que personne ne le voie.
alter table public.task
  add constraint task_sujet_nomme check (length(trim(subject_kind)) > 0);

-- ⚠️ LE verrou anti-doublon. Il porte sur TOUS les états, y compris `done` : ne pas réécrire à
-- une entreprise déjà démarchée est une promesse produit, pas une limite technique. Le jour où
-- une relance à distance devra rouvrir une mission close, ce sera une décision explicite — et
-- elle se verra, parce qu'il faudra changer cet index.
create unique index task_sujet_unique
  on public.task (tenant_id, employee_id, subject_kind, subject_id);

comment on column public.task.subject_kind is
  'La NATURE du sujet de la mission (« lead », …). Texte libre à dessein : un métier futur en '
  'nomme un autre sans migration. Le code ne fait jamais correspondre cette valeur à une table.';
comment on column public.task.subject_id is
  'Le sujet lui-même. Avec subject_kind, il rend « ce travail existe déjà » décidable par un '
  'index unique — jamais par une lecture suivie d''une écriture, entre lesquelles un autre passe.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Un objectif peut être atteint, ou retiré
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- `objective` ne portait aucun état : on ne pouvait qu'en créer un nouveau. Impossible donc de
-- dire « c'est fait, n'ouvre plus rien », et impossible pour un client de se raviser.
--
-- ⚠️ CE QUE CET ÉTAT NE FAIT PAS, ET QUI DOIT RESTER CLAIR : Sentio **ne calcule pas ici** si
-- l'objectif est atteint. `metric` et `horizon` sont du texte libre, rédigé par le modèle pendant
-- le diagnostic (« € de chiffre d'affaires », « mois ») — les interpréter reviendrait à inventer
-- un vocabulaire de mesure que personne n'a arrêté. La mesure appartient au lot 6
-- (`DASH-05`, `DASH-07`, « fenêtre d'attribution annoncée ») ; ici on ne fait que **lire** un
-- état posé ailleurs, et s'y tenir.
--
-- Conséquence assumée : tant que le lot 6 n'existe pas, un objectif reste `actif` et l'employé
-- continue d'ouvrir des missions. C'est le comportement voulu — l'inverse (refuser de travailler
-- faute de savoir mesurer) arrêterait tous les employés sans qu'aucun client l'ait demandé.

alter table public.objective
  add column state text not null default 'actif'
    check (state in ('actif', 'atteint', 'retire')),
  add column achieved_at timestamptz;

-- Un objectif « atteint » dit QUAND. Sans cette date, la progression affichée plus tard ne
-- pourrait pas distinguer « atteint hier » de « atteint il y a six mois ».
alter table public.objective
  add constraint objective_atteint_dit_quand
    check ((state = 'atteint') = (achieved_at is not null));

create index objective_actif_idx on public.objective (tenant_id) where state = 'actif';

comment on column public.objective.state is
  'Sentio ne décide JAMAIS seul qu''un objectif est atteint : cet état est posé par le client ou '
  'par la mesure du lot 6, jamais déduit ici. « retire » permet à un dirigeant de se raviser — '
  'sans lui, il ne pouvait qu''en empiler un nouveau.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Le lot du jour — l'idempotence de l'approvisionnement
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- La clé primaire EST l'anti-doublon : deux battements simultanés, ou un battement rejoué,
-- tentent d'écrire la même ligne et un seul l'obtient. C'est la base qui tranche la course, pas
-- une lecture suivie d'une écriture — exactement le raisonnement de `execution_event`
-- (`unique (tenant_id, idempotency_key)`, EXEC-06).
--
-- La table garde aussi le MOTIF : « pourquoi seulement trois missions ce jour-là ? » doit se
-- répondre des mois plus tard sans rejouer quoi que ce soit.

create table public.approvisionnement (
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  -- ⚠️ Pas de `references public.employee (id)` ici : une clé étrangère entre deux tables client
  -- porte TOUJOURS `tenant_id`, sinon elle peut relier deux entreprises (`…120033`, invariant 2).
  -- Le contrôle structurel des invariants refuse la version simple — et il a raison.
  employee_id uuid not null,
  -- Le jour CIVIL en UTC, jamais `current_date` : le fuseau du serveur ne doit pas décider
  -- quand une journée de travail commence.
  jour        date not null,
  ouvertes    integer not null default 0 check (ouvertes >= 0),
  motif       text not null check (length(trim(motif)) > 0),
  created_at  timestamptz not null default now(),
  primary key (tenant_id, employee_id, jour),
  -- Un employé n'appartient qu'à une entreprise, et cette ligne ne peut pas relier les deux
  -- autrement (règle de `…120033`).
  foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade
);

-- Une ligne ne change jamais d'entreprise — règle tenue par la base pour TOUTES les tables qui
-- portent `tenant_id`, y compris celles que le client ne voit jamais (`…120034`, invariant 2).
create trigger approvisionnement_tenant_immutable
  before update on public.approvisionnement
  for each row execute function public.reject_tenant_change();

alter table public.approvisionnement enable row level security;
-- Aucune politique : c'est de la mécanique d'exécution, jamais exposée au client
-- (`docs/07-parcours-produit.md` — « jamais les workflows »). Comme `job`.

comment on table public.approvisionnement is
  'Un lot par employé et par jour. La clé primaire est l''idempotence : un battement rejoué ou '
  'doublé ne peut pas ouvrir deux fois le travail du jour. Le motif dit pourquoi ce nombre.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Le quota de la formule, tenu par la base
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- `plan_quota.tasks_per_period` existait depuis FOND-06, semé pour les trois formules
-- (300 / 1 500 / 6 000)… et **personne ne le comptait**. Un plafond que rien n'applique n'est pas
-- un plafond, c'est une ligne de documentation dans une table.
--
-- Il est appliqué ici par un DÉCLENCHEUR, et non par le code d'approvisionnement, pour la raison
-- qui vaut partout ailleurs dans ce schéma : un contrôle applicatif protège le chemin qu'on a
-- prévu, un déclencheur protège **tous** les chemins — y compris une insertion à la main, un
-- script de reprise, ou le rôle de service qui ignore RLS.
--
-- Le verrou consultatif n'est pas une précaution de style : sans lui, deux insertions
-- concurrentes lisent toutes les deux « plafond − 1 » et passent toutes les deux. Il sérialise la
-- création de missions **par entreprise**, et par elle seule.
--
-- ⚠️ LIMITE ASSUMÉE, à ne pas découvrir plus tard : sans abonnement actif, ce déclencheur laisse
-- passer. Le refus est alors porté par `peut_ouvrir_une_mission()`, qui refuse explicitement.
-- Rendre le déclencheur strict ici exigerait un abonnement dans chaque fixture de test, pour un
-- gain nul sur le seul cas qui compte — un client payant sur-servi.

create or replace function public.task_respecte_le_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s        public.subscription;
  plafond  bigint;
  deja     bigint;
begin
  -- Sérialise la création de missions de CETTE entreprise, le temps de la transaction.
  perform pg_advisory_xact_lock(hashtext('sentio.task_quota'), hashtext(new.tenant_id::text));

  select * into s
    from public.subscription
   where tenant_id = new.tenant_id
     and status = 'active'
     and now() >= current_period_start
     and now() <  current_period_end;
  if not found then return new; end if;

  select quota_limit into plafond
    from public.plan_quota
   where plan_id = s.plan_id and metric = 'tasks_per_period';
  if plafond is null then return new; end if;

  select count(*) into deja
    from public.task
   where tenant_id = new.tenant_id
     and created_at >= s.current_period_start
     and created_at <  s.current_period_end;

  if deja >= plafond then
    raise exception
      'quota_de_periode_atteint : % mission(s) déjà ouverte(s) sur la période, plafond %.',
      deja, plafond
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger task_quota_de_periode
  before insert on public.task
  for each row execute function public.task_respecte_le_quota();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 5. La garde d'approvisionnement — la RAISON, jamais un booléen
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- Même forme que `peut_envoyer()`. Un employé qui n'ouvre aucune mission aujourd'hui doit pouvoir
-- dire laquelle des six conditions l'en a empêché : sans ça, « il ne s'est rien passé » est
-- indistinguable d'une panne, pour le client comme pour nous.

create or replace function public.peut_ouvrir_une_mission(p_tenant uuid, p_employee uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s       public.subscription;
  plafond bigint;
  deja    bigint;
begin
  if not exists (
    select 1 from public.employee where id = p_employee and tenant_id = p_tenant
  ) then
    return 'employe_inconnu';
  end if;

  -- Un abonnement résilié, impayé, ou jamais souscrit ne donne pas droit à du travail. Même
  -- raisonnement que `PostgresUsageLedger.tenantLimit` : l'absence vaut zéro, pas « illimité ».
  select * into s
    from public.subscription
   where tenant_id = p_tenant
     and status = 'active'
     and now() >= current_period_start
     and now() <  current_period_end;
  if not found then return 'pas_d_abonnement_actif'; end if;

  -- L'objectif décide si l'on continue d'ouvrir — jamais combien.
  if not exists (
    select 1 from public.objective where tenant_id = p_tenant and state = 'actif'
  ) then
    if exists (select 1 from public.objective where tenant_id = p_tenant and state = 'atteint') then
      return 'objectif_atteint';
    elsif exists (select 1 from public.objective where tenant_id = p_tenant and state = 'retire') then
      return 'objectif_retire';
    end if;
    return 'aucun_objectif';
  end if;

  if exists (
    select 1 from public.approvisionnement
     where tenant_id = p_tenant
       and employee_id = p_employee
       and jour = (now() at time zone 'utc')::date
  ) then
    return 'deja_approvisionne_aujourdhui';
  end if;

  select quota_limit into plafond
    from public.plan_quota
   where plan_id = s.plan_id and metric = 'tasks_per_period';

  if plafond is not null then
    select count(*) into deja
      from public.task
     where tenant_id = p_tenant
       and created_at >= s.current_period_start
       and created_at <  s.current_period_end;
    if deja >= plafond then return 'quota_de_periode_atteint'; end if;
  end if;

  return 'ok';
end;
$$;

-- Combien de missions la formule autorise encore sur la période en cours.
-- Nul = aucun plafond défini pour cette métrique ; 0 = plus rien. Les confondre rouvrirait le
-- trou que `PostgresUsageLedger` documente déjà pour les résiliés.
create or replace function public.missions_restantes_sur_la_periode(p_tenant uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s       public.subscription;
  plafond bigint;
  deja    bigint;
begin
  select * into s
    from public.subscription
   where tenant_id = p_tenant
     and status = 'active'
     and now() >= current_period_start
     and now() <  current_period_end;
  if not found then return 0; end if;

  select quota_limit into plafond
    from public.plan_quota
   where plan_id = s.plan_id and metric = 'tasks_per_period';
  if plafond is null then return null; end if;

  select count(*) into deja
    from public.task
   where tenant_id = p_tenant
     and created_at >= s.current_period_start
     and created_at <  s.current_period_end;

  return greatest(0, (plafond - deja))::integer;
end;
$$;

comment on function public.peut_ouvrir_une_mission(uuid, uuid) is
  'Rend la RAISON pour laquelle un employé peut, ou ne peut pas, ouvrir une nouvelle mission '
  'aujourd''hui : employe_inconnu, pas_d_abonnement_actif, aucun_objectif, objectif_atteint, '
  'objectif_retire, deja_approvisionne_aujourdhui, quota_de_periode_atteint, ok.';
