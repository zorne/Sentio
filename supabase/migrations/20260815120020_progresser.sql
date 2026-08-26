-- LADY-V — l'employé progresse : ce qui marche pour CE client prend le dessus.
--
-- ══ CE QUI MANQUAIT ══
--
-- Trois pièces posées, aucune reliée. `strategy_variant` décrivait des façons de travailler.
-- `task_variant` devait dire laquelle avait servi — et restait vide, parce que rien ne
-- l'écrivait. `strategy_variant_resultats` savait compter — sur zéro ligne. Le produit vendait
-- un employé qui progresse, et n'avait aucun moyen de savoir s'il progressait.
--
-- ══ CE QUE CETTE MIGRATION AJOUTE ══
--
--   1. le REGISTRE DE LANGAGE comme genre de variante — parler courant, professionnel, technique
--      ou dans le jargon de la niche est une façon de faire le même travail, donc quelque chose
--      qui se compare au lieu de se décréter ;
--   2. la PRÉFÉRENCE D'UNE ENTREPRISE : la variante qui a gagné CHEZ ELLE ;
--   3. `resultats_par_variante(entreprise)` — les mêmes comptes que la vue globale, mais bornés
--      à une entreprise.
--
-- ⚠️ **Pourquoi par entreprise, et pas une moyenne du produit.** Le registre qui fonctionne chez
-- un cabinet d'architectes n'est pas celui qui fonctionne chez un artisan. Une moyenne globale
-- ferait converger tous les employés vers le ton qui plaît au client médian — c'est-à-dire vers
-- l'inverse de ce que ce produit promet.
--
-- ⚠️ **Aucune décision ici.** Cette migration compte et range. Choisir la gagnante est
-- `packages/runtime/src/progression.ts`, qui exige un signal minimal avant de bouger — sans quoi
-- « la variante A fait 1 vente sur 2 missions » deviendrait une conclusion.
--
-- Réalise : LADY-V, EVOL-04

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Le registre de langage, en variantes
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.strategy_variant drop constraint strategy_variant_kind_check;
alter table public.strategy_variant
  add constraint strategy_variant_kind_check
    check (kind in ('angle', 'moment_de_relance', 'registre'));

comment on constraint strategy_variant_kind_check on public.strategy_variant is
  'Le registre de langage est un GENRE de variante, pas un réglage : il se compare sur des '
  'résultats mesurés, au lieu d''être décrété une fois pour toutes.';

insert into public.strategy_variant (profession, kind, key, label, content, par_defaut) values
  ('commercial', 'registre', 'professionnel', 'Le vocabulaire du métier, sans jargon',
   jsonb_build_object(
     'consigne', 'Écrire dans le vocabulaire courant du métier de votre interlocuteur : les mots qu''il emploie avec ses clients, pas ceux qu''il emploie avec ses fournisseurs.',
     'a_eviter', 'Les termes techniques qu''un dirigeant non spécialiste devrait chercher.'),
   true),

  ('commercial', 'registre', 'courant', 'Les mots de tous les jours',
   jsonb_build_object(
     'consigne', 'Écrire comme on parlerait à quelqu''un qui n''est pas du métier : phrases courtes, aucun terme qui demande une définition.',
     'a_eviter', 'Le vocabulaire de spécialité, même quand il est plus précis.'),
   false),

  ('commercial', 'registre', 'technique', 'Les termes techniques, précisément',
   jsonb_build_object(
     'consigne', 'Employer les termes techniques exacts du domaine : à un interlocuteur qui les connaît, l''imprécision se lit comme de l''incompétence.',
     'a_eviter', 'Employer un terme technique dont la fiche ne prouve pas qu''il s''applique à cette entreprise.'),
   false),

  ('commercial', 'registre', 'specialise', 'Le jargon de la niche',
   jsonb_build_object(
     'consigne', 'Employer le vocabulaire propre à cette niche — celui que seuls les gens du métier emploient entre eux — quand le contexte entreprise le documente.',
     'a_eviter', 'Imiter un jargon que rien dans le contexte ne documente : mal employé, il disqualifie plus vite que le silence.'),
   false);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Ce qui a gagné chez CETTE entreprise
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.tenant_variant_preference (
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  -- Le genre, pas la variante : une préférence par genre, sinon deux angles s'appliqueraient.
  kind        text not null,
  variant_id  uuid not null references public.strategy_variant (id) on delete restrict,
  -- Sur combien de missions la comparaison a porté. Sans ce nombre, « on a mesuré » n'est pas
  -- vérifiable, et une préférence tirée de trois missions serait indistinguable d'une vraie.
  missions_comparees integer not null check (missions_comparees >= 0),
  -- Lisible par le dirigeant, dans son vocabulaire : c'est ce qu'il relira dans sa notification.
  raison      text not null check (length(trim(raison)) > 0),
  decided_at  timestamptz not null default now(),
  primary key (tenant_id, kind)
);

create index tenant_variant_preference_variante_idx
  on public.tenant_variant_preference (variant_id);

comment on table public.tenant_variant_preference is
  'La façon de travailler qui a gagné CHEZ CETTE ENTREPRISE, sur des résultats mesurés. Jamais '
  'une moyenne du produit : le ton qui marche chez un cabinet ne marche pas chez un artisan.';

alter table public.tenant_variant_preference enable row level security;

create policy tenant_variant_preference_select on public.tenant_variant_preference
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create trigger tenant_variant_preference_tenant_locked
  before update on public.tenant_variant_preference
  for each row execute function public.reject_tenant_change();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Ce que chaque variante a produit CHEZ ELLE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Les missions comptées sont celles qui ont été **réellement travaillées** : une mission
-- ouverte et jamais agie ne dit rien de la variante qu'elle portait. Sans ce filtre, une variante
-- récente paraîtrait mauvaise parce qu'elle porte surtout des missions pas encore jouées.

create function public.resultats_par_variante(p_tenant uuid)
returns table (
  variant_id  uuid,
  kind        text,
  key         text,
  missions    integer,
  reponses    integer,
  rendez_vous integer,
  ventes      integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.id, v.kind, v.key,
         count(distinct tv.task_id)::integer,
         count(distinct o.id) filter (where o.kind = 'response')::integer,
         count(distinct o.id) filter (where o.kind = 'meeting')::integer,
         count(distinct o.id) filter (where o.kind = 'sale')::integer
    from public.strategy_variant v
    join public.task_variant tv on tv.variant_id = v.id and tv.tenant_id = p_tenant
    -- Réellement travaillée : au moins une action exécutée pour cette mission.
    join public.execution_event e
      on e.tenant_id = tv.tenant_id and e.task_id = tv.task_id and e.kind = 'action_executee'
    left join public.outcome o on o.tenant_id = tv.tenant_id and o.task_id = tv.task_id
   where v.actif
   group by v.id, v.kind, v.key;
$$;

comment on function public.resultats_par_variante(uuid) is
  'Ce que chaque façon de travailler a produit chez UNE entreprise, sur des missions réellement '
  'travaillées. Ne choisit pas la gagnante : c''est le runtime, et il exige un signal minimal.';

revoke execute on function public.resultats_par_variante(uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Le dirigeant lit ce que son employé a retenu
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ `select` seulement. Une préférence se gagne sur des résultats mesurés ; laisser le client
-- l'écrire ferait de « ce qui marche chez vous » une opinion, et la mesure ne voudrait plus rien
-- dire. S'il veut imposer une façon de travailler, le chemin existe et il est ailleurs : il
-- publie une configuration (`20260815120011`).

grant select on public.tenant_variant_preference to authenticated;
