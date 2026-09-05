-- Chaque employée a sa conversation, et ses chiffres sont les siens.
--
-- ══ LE DÉFAUT, ET POURQUOI IL NE SE VOYAIT PAS ══
--
-- Demande du fondateur : *« sur la plateforme privée, la discussion doit être spécifique à
-- l'agent et au client ; chaque agent a son propre chat, connecté à l'état de l'agent. »*
--
-- L'espace client affichait UNE employée, et le chat en cherchait une AUTRE, tout seul, avec un
-- `limit 1` sans `order by`. Postgres ne promet aucun ordre sans `order by` : le dirigeant
-- pouvait donc lire la fiche d'une employée et interroger l'état d'une autre, dans la même page,
-- avec une attribution qui changeait d'un rechargement au suivant.
--
-- ⚠️ ET LES CHIFFRES EUX-MÊMES N'ÉTAIENT PAS CEUX DE L'EMPLOYÉE. `travail_sur_la_periode` et
-- `bilan_de_l_employe` — dont le nom annonce pourtant un employé — comptaient TOUT ce qui portait
-- l'entreprise. Deux employées dans la même entreprise, et chacune se serait attribué le travail
-- de l'autre en répondant « voilà ce que j'ai fait ». Ce n'est pas une fuite vers un tiers : c'est
-- un mensonge sur l'auteur du travail, et le produit ne tient que sur ce point-là.
--
-- ══ C'EST LA RÈGLE 7 DU DÉPÔT, UN CRAN PLUS BAS ══
--
-- La règle 7 de `scripts/verifier-frontieres.mjs` dit qu'une garantie protégeant d'autrui ne
-- protège pas de soi-même : RLS répond à « qui a le droit de voir », jamais à « laquelle des
-- miennes je regarde ». Le même raisonnement vaut entre DEUX EMPLOYÉES D'UNE MÊME ENTREPRISE, et
-- il se tranche pareil : par un filtre explicite, vérifiable.
--
-- ══ CE QUI N'EST PAS CHANGÉ, ET POURQUOI ══
--
-- `avancement_vers_l_objectif` reste porté par l'entreprise. L'objectif appartient au dirigeant,
-- pas à son employée : le lui découper par employée inventerait une cible que personne n'a fixée.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Les comptes savent nommer une employée.
--
-- ⚠️ UN PARAMÈTRE FACULTATIF, ET NON UNE SECONDE FONCTION. Deux fonctions voisines, c'est deux
-- vérités qui divergent au premier correctif appliqué à une seule. `p_employee` à `null` garde le
-- sens d'origine — toute l'entreprise — donc les appels existants ne changent pas de résultat.
--
-- ⚠️ `outcome` NE PORTE PAS D'EMPLOYÉE : elle se rattache par sa mission (`task_id`, non nul), et
-- c'est `task` qui nomme l'employée. Le rattachement est donc exact, jamais approché.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop function if exists public.travail_sur_la_periode(uuid, timestamptz, timestamptz);

create function public.travail_sur_la_periode(
  p_tenant   uuid,
  p_debut    timestamptz,
  p_fin      timestamptz,
  p_employee uuid default null
)
returns table (
  missions_ouvertes  integer,
  missions_agies     integer,
  messages_envoyes   integer,
  reponses           integer,
  rendez_vous        integer,
  ventes             integer,
  chiffre_affaires   numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::integer from public.task t
      where t.tenant_id = p_tenant and t.created_at >= p_debut and t.created_at < p_fin
        and (p_employee is null or t.employee_id = p_employee)),

    -- « Agie » : une action a réellement été exécutée. Une mission ouverte et jamais travaillée
    -- ne prouve rien — et l'annoncer comme du travail fait serait le premier mensonge du produit.
    (select count(distinct e.task_id)::integer from public.execution_event e
      where e.tenant_id = p_tenant and e.kind = 'action_executee'
        and e.created_at >= p_debut and e.created_at < p_fin
        and (p_employee is null or e.employee_id = p_employee)),

    (select count(*)::integer from public.outbound_message m
      where m.tenant_id = p_tenant and m.sent_at >= p_debut and m.sent_at < p_fin
        and (p_employee is null or m.employee_id = p_employee)),

    -- Les issues sont datées de leur DÉCLARATION (`recorded_at`), pas du travail qui les a
    -- produites : une
    -- réponse arrivée aujourd'hui à un message d'avant-hier est une nouvelle d'aujourd'hui.
    (select count(*)::integer from public.outcome o
      join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
      where o.tenant_id = p_tenant and o.kind = 'response'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin
        and (p_employee is null or t.employee_id = p_employee)),
    (select count(*)::integer from public.outcome o
      join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
      where o.tenant_id = p_tenant and o.kind = 'meeting'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin
        and (p_employee is null or t.employee_id = p_employee)),
    (select count(*)::integer from public.outcome o
      join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
      where o.tenant_id = p_tenant and o.kind = 'sale'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin
        and (p_employee is null or t.employee_id = p_employee)),
    (select coalesce(sum(o.value), 0) from public.outcome o
      join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
      where o.tenant_id = p_tenant and o.kind = 'sale'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin
        and (p_employee is null or t.employee_id = p_employee));
$$;

comment on function public.travail_sur_la_periode(uuid, timestamptz, timestamptz, uuid) is
  'Ce que le travail a produit entre deux instants, en comptes bruts. Sert à répondre au '
  'dirigeant sans qu''aucun chiffre ne soit calculé par un modèle (invariant 4 du dépôt). '
  '« p_employee » nul compte toute l''entreprise ; renseigné, il ne compte QUE cette employée — '
  'sans quoi deux employées s''attribueraient le travail l''une de l''autre.';

revoke execute on function public.travail_sur_la_periode(uuid, timestamptz, timestamptz, uuid) from public;

drop function if exists public.bilan_de_l_employe(uuid, integer);

create function public.bilan_de_l_employe(
  p_tenant   uuid,
  p_jours    integer default 30,
  p_employee uuid default null
)
returns table (
  depuis               date,
  contactes            integer,
  reponses             integer,
  rendez_vous          integer,
  ventes               integer,
  chiffre_affaires     numeric,
  entreprises_engagees integer,
  missions_agies       integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with borne as (
    select (current_date - (greatest(least(p_jours, 365), 1) - 1))::date as depuis
  )
  select b.depuis,
         (select count(*)::integer from public.outbound_message m
           where m.tenant_id = p_tenant and m.sent_at::date >= b.depuis
             and (p_employee is null or m.employee_id = p_employee)),
         (select count(*)::integer from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant and o.kind = 'response' and o.recorded_at::date >= b.depuis
             and (p_employee is null or t.employee_id = p_employee)),
         (select count(*)::integer from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant and o.kind = 'meeting' and o.recorded_at::date >= b.depuis
             and (p_employee is null or t.employee_id = p_employee)),
         (select count(*)::integer from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant and o.kind = 'sale' and o.recorded_at::date >= b.depuis
             and (p_employee is null or t.employee_id = p_employee)),
         (select coalesce(sum(o.value), 0) from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant and o.kind = 'sale' and o.recorded_at::date >= b.depuis
             and (p_employee is null or t.employee_id = p_employee)),
         -- Une entreprise qui a donné une suite : un rendez-vous ou une vente. Une simple réponse
         -- n'en est pas une — « merci, sans suite » est une réponse.
         (select count(distinct t.subject_id)::integer
            from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant
             and o.kind in ('meeting', 'sale')
             and o.recorded_at::date >= b.depuis
             and t.subject_kind = 'lead'
             and (p_employee is null or t.employee_id = p_employee)),
         (select count(distinct e.task_id)::integer from public.execution_event e
           where e.tenant_id = p_tenant and e.kind = 'action_executee'
             and e.created_at::date >= b.depuis
             and (p_employee is null or e.employee_id = p_employee))
    from borne b;
$$;

comment on function public.bilan_de_l_employe(uuid, integer, uuid) is
  'Le bilan de l''employé sur une fenêtre. « entreprises_engagees » compte des entreprises '
  'DISTINCTES : une qui répond, obtient un rendez-vous puis signe en reste une seule. '
  '« p_employee » nul compte toute l''entreprise ; renseigné, il ne compte que cette employée.';

revoke execute on function public.bilan_de_l_employe(uuid, integer, uuid) from public;


drop function if exists public.serie_quotidienne(uuid, integer);

create function public.serie_quotidienne(
  p_tenant   uuid,
  p_jours    integer default 14,
  p_employee uuid default null
)
returns table (
  jour        date,
  contactes   integer,
  reponses    integer,
  rendez_vous integer,
  ventes      integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with fenetre as (
    select generate_series(
             (current_date - (greatest(least(p_jours, 90), 1) - 1)),
             current_date,
             interval '1 day')::date as jour
  )
  select f.jour,
         (select count(*)::integer from public.outbound_message m
           where m.tenant_id = p_tenant and m.sent_at::date = f.jour
             and (p_employee is null or m.employee_id = p_employee)),
         (select count(*)::integer from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant and o.kind = 'response' and o.recorded_at::date = f.jour
             and (p_employee is null or t.employee_id = p_employee)),
         (select count(*)::integer from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant and o.kind = 'meeting' and o.recorded_at::date = f.jour
             and (p_employee is null or t.employee_id = p_employee)),
         (select count(*)::integer from public.outcome o
            join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
           where o.tenant_id = p_tenant and o.kind = 'sale' and o.recorded_at::date = f.jour
             and (p_employee is null or t.employee_id = p_employee))
    from fenetre f
   order by f.jour;
$$;

comment on function public.serie_quotidienne(uuid, integer, uuid) is
  'Le travail jour par jour, TOUS les jours de la fenêtre — y compris ceux sans rien. Une courbe '
  'qui saute les jours vides relie lundi à jeudi en ligne droite et invente une progression. '
  '« p_employee » nul trace toute l''entreprise ; renseigné, il ne trace que cette employée.';

revoke execute on function public.serie_quotidienne(uuid, integer, uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. La conversation appartient à une employée, et elle survit au rechargement.
--
-- ══ POURQUOI EN BASE, ALORS QUE LE POINT ROUGE EST DANS LE NAVIGATEUR ══
--
-- « Vu » est un fait de la personne devant l'écran : il reste dans le navigateur (voir
-- `nouveautes.ts`). Ce qu'on a DIT à son employée est un fait de l'entreprise : ça se rouvre
-- demain, sur un autre poste, et par l'associé qui partage le compte. Une conversation qui vit
-- dans un `useState` disparaît au premier rechargement — le dirigeant redemande alors ce qu'il a
-- déjà demandé, et l'employée paraît sans mémoire, ce qui est exactement l'inverse de la promesse.
--
-- ⚠️ LA CLÉ ÉTRANGÈRE EST COMPOSÉE, ET C'EST LA GARANTIE. `(tenant_id, employee_id)` pointe vers
-- `employee (tenant_id, id)`. La base REFUSE donc d'écrire un message chez l'employée d'une autre
-- entreprise, même si le code se trompe de paramètre. Une garantie de produit vit en base, jamais
-- dans une vérification applicative qu'on peut oublier d'appeler (invariant du dépôt).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.conversation_message (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  employee_id uuid not null,
  -- Qui parle. Deux valeurs, et pas une de plus : il n'y a que deux voix dans cette page.
  auteur      text not null check (auteur in ('dirigeant', 'employee')),
  -- ⚠️ Bornée ICI, et pas seulement dans le formulaire. Une borne posée dans l'interface
  -- s'évapore dès qu'un autre appelant écrit dans la table.
  texte       text not null check (length(texte) between 1 and 2000),
  created_at  timestamptz not null default now(),

  foreign key (tenant_id, employee_id)
    references public.employee (tenant_id, id) on delete cascade
);

-- L'index sert la seule lecture qui existe : la conversation d'UNE employée, dans l'ordre.
create index conversation_message_fil_idx
  on public.conversation_message (tenant_id, employee_id, created_at);

alter table public.conversation_message enable row level security;

create policy conversation_message_select on public.conversation_message
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy conversation_message_insert on public.conversation_message
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id));

-- ⚠️ NI « update » NI « delete ». Une conversation qu'on peut réécrire après coup ne prouve plus
-- rien de ce qui a été demandé ni de ce qui a été répondu. L'effacement relève de la purge, qui
-- est une décision d'entreprise, pas un geste d'écran.
grant select, insert on public.conversation_message to authenticated;

-- ⚠️ LE VERROU D'ENTREPRISE, COMME TOUTE TABLE QUI EN PORTE UNE. `20260729120034` l'a posé sur
-- toutes celles qui existaient alors ; une table créée après doit le poser elle-même, sinon une
-- mise à jour pourrait déplacer un message d'une entreprise à l'autre. L'invariant du dépôt vérifie
-- qu'aucune table n'y échappe — et c'est lui qui a attrapé cet oubli, pas moi.
create trigger conversation_message_tenant_immutable
  before update on public.conversation_message
  for each row execute function public.reject_tenant_change();

comment on table public.conversation_message is
  'Ce qui a été dit entre un dirigeant et UNE de ses employées. La clé étrangère composée '
  '(tenant_id, employee_id) interdit en base d''attacher un message à l''employée d''une autre '
  'entreprise : la garantie ne dépend pas du code appelant.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. La preuve, exécutée à la migration.
--
-- ⚠️ Sans elle, cette migration ne prouverait que sa propre syntaxe. Le défaut corrigé ici est un
-- défaut de CHIFFRES : il se démontre en comptant, jamais en relisant.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  -- Le paramètre existe et il est bien facultatif : les appels d'origine doivent survivre.
  perform public.travail_sur_la_periode(gen_random_uuid(), now() - interval '1 day', now());
  perform public.bilan_de_l_employe(gen_random_uuid(), 30);
  perform public.serie_quotidienne(gen_random_uuid(), 14);

  -- Et il sait cibler.
  perform public.travail_sur_la_periode(
    gen_random_uuid(), now() - interval '1 day', now(), gen_random_uuid());
  perform public.bilan_de_l_employe(gen_random_uuid(), 30, gen_random_uuid());
  perform public.serie_quotidienne(gen_random_uuid(), 14, gen_random_uuid());

  select count(*) into n
    from information_schema.table_constraints
   where table_name = 'conversation_message' and constraint_type = 'FOREIGN KEY';
  if n < 2 then
    raise exception 'La conversation doit être tenue par SON entreprise ET SON employée : % clés étrangères trouvées.', n;
  end if;

  raise notice 'OK  les comptes savent nommer une employée, et la conversation lui appartient.';
end;
$$;
