-- METIER-15 — les variantes de stratégie : angles d'accroche et moments de relance, en données.
-- Réalise : METIER-15
--
-- Une variante est une FAÇON de faire le même travail : aborder un prospect par le problème
-- plutôt que par la référence, relancer à quatre jours plutôt qu'à sept. Ce ne sont pas des
-- fonctionnalités différentes — c'est la même capacité, jouée autrement.
--
-- ══ POURQUOI EN DONNÉES, ET PAS EN CODE ══
--
-- Parce que le but est de les COMPARER. Une variante écrite en code se compare en relisant deux
-- branches ; une variante en base se compare en comptant des résultats réels (`outcome`). Ajouter
-- un angle devient un INSERT, en retirer un devient `actif = false` — jamais un redéploiement, et
-- jamais une condition sur un nom de variante dans le moteur.
--
-- ══ CE QUE CETTE MIGRATION NE FAIT PAS ══
--
-- Elle ne choisit pas la gagnante. Sélectionner une variante à partir des résultats mesurés est
-- EVOL-04, et le faire ici serait annoncer un apprentissage qui n'a mesuré personne. Ce qui est
-- posé, c'est ce sans quoi EVOL-04 ne pourra jamais être écrit honnêtement : la trace de quelle
-- variante a servi sur quelle mission.

-- ─────────────────────────────────────────────────────────────────────────────
-- Les variantes elles-mêmes. Globales, comme l'ADN et les profils sectoriels : elles sont
-- rédigées par Sentio et ne dérivent d'aucune donnée client (`docs/adr/0011`).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.strategy_variant (
  id            uuid primary key default gen_random_uuid(),
  profession    text not null,
  -- Le GENRE de variation. Ajouter un genre demain ne casse rien : c'est une valeur, pas une
  -- colonne. On garde la contrainte pour qu'une faute de frappe ne crée pas un genre fantôme.
  kind          text not null check (kind in ('angle', 'moment_de_relance')),
  key           text not null,
  label         text not null check (length(trim(label)) > 0),
  content       jsonb not null,
  /**
   * Une variante par genre et par métier fait foi tant qu'aucune mesure ne dit autre chose.
   * C'est elle que le moteur applique par défaut — sans elle, il n'y aurait pas de comportement
   * défini, seulement un tirage.
   */
  par_defaut    boolean not null default false,
  actif         boolean not null default true,
  published_at  timestamptz not null default now(),
  unique (profession, kind, key)
);

-- Une seule variante par défaut par métier et par genre. Deux « par défaut » rendraient le
-- comportement dépendant de l'ordre de lecture, c'est-à-dire imprévisible.
create unique index strategy_variant_defaut_idx
  on public.strategy_variant (profession, kind)
  where par_defaut;

create index strategy_variant_actives_idx
  on public.strategy_variant (profession, kind) where actif;

alter table public.strategy_variant enable row level security;

create policy strategy_variant_select on public.strategy_variant
  for select to authenticated
  using (true);

/**
 * Ce qui peut changer, et ce qui ne peut pas.
 *
 * `actif` et `par_defaut` sont des LEVIERS : les figer obligerait à publier une variante pour en
 * éteindre une autre. `content`, `kind`, `key` et `profession` sont l'IDENTITÉ de la variante :
 * les modifier réécrirait rétroactivement ce qui a été joué, et les résultats déjà mesurés se
 * retrouveraient attribués à une stratégie qui n'a jamais tourné. C'est exactement le mensonge
 * que `outcome` existe pour empêcher.
 */
create or replace function public.reject_strategy_variant_identity_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Une variante de stratégie ne se supprime pas : elle se désactive (actif = false). La supprimer orphelinerait les résultats déjà mesurés.';
  end if;

  if new.profession is distinct from old.profession
     or new.kind is distinct from old.kind
     or new.key is distinct from old.key
     or new.content is distinct from old.content then
    raise exception
      'L''identité d''une variante est immuable : publier une variante nouvelle, jamais réécrire celle qui a déjà tourné.';
  end if;

  return new;
end;
$$;

create trigger strategy_variant_identity_immutable
  before update or delete on public.strategy_variant
  for each row execute function public.reject_strategy_variant_identity_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- Quelle variante a servi sur quelle mission.
--
-- Table à part plutôt que colonnes sur `task` : une mission emploie un angle ET un moment de
-- relance, et en ajouter un troisième genre demain ne doit pas être une migration de la table
-- la plus chargée du schéma.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_variant (
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  task_id     uuid not null,
  variant_id  uuid not null references public.strategy_variant (id) on delete restrict,
  applied_at  timestamptz not null default now(),
  primary key (tenant_id, task_id, variant_id),
  foreign key (tenant_id, task_id) references public.task (tenant_id, id) on delete cascade
);

create index task_variant_variante_idx on public.task_variant (variant_id);

alter table public.task_variant enable row level security;

create policy task_variant_select on public.task_variant
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create trigger task_variant_tenant_locked
  before update on public.task_variant
  for each row execute function public.reject_tenant_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- Ce que chaque variante a produit — en lignes réelles, jamais en estimation.
--
-- ⚠️ `security_invoker` fait ici plus que respecter une politique : il décide QUI voit quoi. Un
-- client interrogeant cette vue ne compte que ses propres missions, parce que RLS s'applique
-- sous son rôle. Le runtime, qui travaille sous un rôle de service, voit l'ensemble — et c'est
-- la seule lecture qui permettra à EVOL-04 de comparer des variantes. Sans `security_invoker`,
-- la vue rendrait à un client les résultats de tous les autres.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.strategy_variant_resultats
  with (security_invoker = true)
as
select v.id            as variant_id,
       v.profession,
       v.kind,
       v.key,
       v.actif,
       count(distinct tv.task_id)                                          as missions,
       count(distinct o.id) filter (where o.kind = 'response')             as reponses,
       count(distinct o.id) filter (where o.kind = 'meeting')              as rendez_vous,
       count(distinct o.id) filter (where o.kind = 'sale')                 as ventes,
       coalesce(sum(o.value) filter (where o.kind = 'sale'), 0)            as chiffre_affaires
  from public.strategy_variant v
  left join public.task_variant tv on tv.variant_id = v.id
  left join public.outcome o on o.task_id = tv.task_id and o.tenant_id = tv.tenant_id
 group by v.id, v.profession, v.kind, v.key, v.actif;

comment on view public.strategy_variant_resultats is
  'Ce que chaque variante a produit, compté sur des lignes réelles. Ne choisit pas la gagnante : c''est EVOL-04 (METIER-15).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Les variantes v1 du Commercial.
--
-- Les angles reprennent ce que l'ADN autorise déjà — ils changent l'ENTRÉE en matière, jamais le
-- périmètre. Aucun ne promet, ne remise, ni n'engage : ce serait franchir une limite de l'ADN par
-- le biais d'une variante, et le filtre anti-contradiction n'inspecte pas les variantes.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.strategy_variant (profession, kind, key, label, content, par_defaut) values
  ('commercial', 'angle', 'probleme_concret', 'Partir d''un problème concret',
   jsonb_build_object(
     'consigne', 'Ouvrir sur une difficulté précise que rencontre ce type d''entreprise, et dire en une phrase ce que le client sait faire pour elle.',
     'a_eviter', 'Toute affirmation sur la situation de CETTE entreprise qui ne serait pas dans sa fiche.'),
   true),

  ('commercial', 'angle', 'question_directe', 'Poser une question directe',
   jsonb_build_object(
     'consigne', 'Ouvrir sur une question courte, à laquelle un dirigeant peut répondre en une ligne.',
     'a_eviter', 'La question rhétorique, qui n''attend pas de réponse et se lit comme un argumentaire.'),
   false),

  ('commercial', 'angle', 'reference_sectorielle', 'S''appuyer sur le secteur',
   jsonb_build_object(
     'consigne', 'Ouvrir sur ce que Sentio sait du secteur — vocabulaire, interlocuteur, cycle — sans jamais nommer une autre entreprise cliente.',
     'a_eviter', 'Citer un client existant : ce serait faire fuiter une entreprise vers une autre (docs/adr/0011).'),
   false),

  ('commercial', 'moment_de_relance', 'espace_4_7', 'Espacer : 4 jours puis 7',
   jsonb_build_object('jours', jsonb_build_array(4, 7)),
   true),

  ('commercial', 'moment_de_relance', 'espace_3_10', 'Relancer tôt, puis laisser respirer',
   jsonb_build_object('jours', jsonb_build_array(3, 10)),
   false),

  ('commercial', 'moment_de_relance', 'espace_7_14', 'Laisser du temps dès la première relance',
   jsonb_build_object('jours', jsonb_build_array(7, 14)),
   false);

-- ─────────────────────────────────────────────────────────────────────────────
-- La cadence de relance descend en données.
--
-- `20260812120002_relance.sql` la posait en dur dans cette même fonction, en disant que c'était un
-- choix par défaut à revoir. Le voici revu : la fonction lit désormais la variante par défaut du
-- métier. Sa SIGNATURE ne change pas, donc `peut_relancer` n'est pas touchée — c'est tout l'objet
-- d'avoir isolé la cadence dans sa propre fonction plutôt que de l'écrire dans la garde.
--
-- Elle ne se rabat sur AUCUNE valeur écrite ici si la variante manque : elle rend NULL, et
-- `peut_relancer` conclut « relances_epuisees ». Un repli silencieux ferait repartir des envois
-- irréversibles sur une cadence que personne n'a choisie ; s'arrêter est le seul défaut
-- acceptable pour une action qu'on ne peut pas rattraper (`docs/adr/0024`).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cadence_de_relance(p_rang integer)
returns integer
language sql
stable
as $$
  select (v.content -> 'jours' ->> (p_rang - 1))::integer
    from public.strategy_variant v
   where v.profession = 'commercial'
     and v.kind = 'moment_de_relance'
     and v.par_defaut
     and v.actif
     and p_rang >= 1;
$$;

comment on function public.cadence_de_relance(integer) is
  'Délai minimal en jours avant une relance de rang donné, lu dans la variante par défaut. NULL au-delà des rangs déclarés (METIER-12, METIER-15).';

do $$
begin
  raise notice 'OK  variantes — angles et moments de relance en données, résultats comptés par variante.';
end;
$$;
