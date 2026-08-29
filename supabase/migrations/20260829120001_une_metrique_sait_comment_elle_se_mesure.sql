-- Une métrique sait comment elle se mesure.
--
-- ══ LE DÉFAUT, ET IL MENT DANS LES DEUX SENS ══
--
-- `avancement_vers_l_objectif()` somme **toujours** `outcome.kind = 'sale'`, quelle que soit la
-- métrique de l'objectif. Mesuré, sur base jetable :
--
--     objectif « rendez_vous_qualifies », cible 10 · 3 rendez-vous réels · AFFICHÉ : 0
--     objectif « ventes », cible 5 · 1 vente de 90 000 € · AFFICHÉ : 90000
--
-- Le premier fait passer une employée qui travaille pour une employée qui ne fait rien. Le second
-- affiche 1 800 000 % d'un objectif. Et même pour une Lady purement commerciale, la fonction
-- compare une **somme d'euros** à une **cible en nombre** : l'unité est fausse.
--
-- Ce n'est pas un chiffre inventé — il est adossé à de vraies lignes. C'est pire : c'est un chiffre
-- vrai présenté sous le libellé d'un autre. L'invariant 4 d'AGENTS.md pris à revers.
--
-- ══ LA CAUSE, UNIQUE ══
--
-- `objective.metric` est du **texte libre**, et il vient du MODÈLE : le schéma JSON du diagnostic
-- déclare `metric: { type: "string" }`, sans énumération. Rien, nulle part, ne relie une métrique à
-- la façon de la mesurer. Le calcul, lui, est figé dans le corps de la fonction.
--
-- ⚠️ Réparer la fonction sans réparer ça ne tiendrait pas : la prochaine métrique inventée par le
-- modèle retomberait dans la branche par défaut, et le défaut reviendrait sans bruit.
--
-- ══ CE QUE FAIT CETTE MIGRATION ══
--
-- Elle sort la règle du code et la met en données — le geste que `capability_binding` et
-- `plan_quota` ont déjà fait pour les droits :
--
--   1. `metric_definition` — une métrique déclare son unité, son agrégation et SA SOURCE ;
--   2. `objective.metric` devient une clé étrangère : une métrique sans définition **n'entre plus
--      en base**. La faute cesse d'être possible, au lieu d'être seulement corrigée ;
--   3. `avancement_vers_l_objectif()` ne connaît plus aucune nature de résultat : elle lit la
--      définition et agrège ce qui y est déclaré.
--
-- ══ CE QUI EST SEMÉ, ET CE QUI NE L'EST PAS ══
--
-- ⚠️ **Seules les métriques qui ont une source de vérité RÉELLE aujourd'hui.** `depenses`,
-- `pertes`, `gains`, `marge`, `impayes`, `temps_economise`, `tickets_resolus` ne sont pas semées :
-- aucune donnée du schéma ne permet de les calculer. Les créer ferait un tableau de bord de zéros,
-- c'est-à-dire un mensonge plus poli que le précédent. Elles viendront avec leurs moteurs.
--
-- `capacite_requise` dit ce qu'il faut avoir monté pour que le chiffre veuille dire quelque chose.
-- Un « taux de réponse » sans moteur d'envoi vaut zéro parce que rien n'est parti — pas parce que
-- personne n'a répondu. L'écran doit pouvoir dire « indisponible » plutôt qu'afficher 0.

-- ── 1. Ce qu'est une métrique ───────────────────────────────────────────────

create table public.metric_definition (
  cle              text primary key,
  libelle          text not null,
  unite            text not null check (unite in ('nombre', 'euro', 'pourcentage')),
  agregation       text not null check (agregation in ('compte', 'somme', 'ratio')),

  -- Source « outcome » : les natures de résultat qui la nourrissent.
  natures_outcome  text[],
  -- Source « lead » : l'état de fiche qui la nourrit.
  etat_lead        text,
  -- Source « ratio » : deux autres métriques.
  numerateur       text references public.metric_definition (cle),
  denominateur     text references public.metric_definition (cle),

  -- La capacité qu'il faut avoir montée pour que ce chiffre ait un sens. Nul = toujours vrai.
  capacite_requise text references public.capability (key),

  created_at       timestamptz not null default now(),

  -- ⚠️ UNE DÉFINITION À MOITIÉ ÉCRITE EST PIRE QU'ABSENTE : elle passerait les contrôles et
  -- rendrait zéro. Chaque agrégation exige exactement sa source, et interdit les autres.
  constraint metric_definition_source_exacte check (
    case agregation
      when 'compte' then
        (natures_outcome is not null or etat_lead is not null)
        and numerateur is null and denominateur is null
      when 'somme' then
        natures_outcome is not null and etat_lead is null
        and numerateur is null and denominateur is null
      when 'ratio' then
        numerateur is not null and denominateur is not null
        and natures_outcome is null and etat_lead is null
    end
  ),
  -- Une somme n'a de sens que sur une valeur portée : aujourd'hui, seule `sale` en porte une.
  constraint metric_definition_somme_sur_valeur check (
    agregation <> 'somme' or unite <> 'nombre'
  ),
  -- Un ratio s'exprime en pourcentage, jamais en euros ni en nombre.
  constraint metric_definition_ratio_en_pourcentage check (
    (agregation = 'ratio') = (unite = 'pourcentage')
  )
);

-- ⚠️ CATALOGUE GLOBAL, COMME `capability` ET `plan` : aucune donnée client, donc lisible par tout
-- compte connecté. RLS est activée quand même — l'invariant AUDIT du dépôt refuse toute table du
-- schéma public qui ne l'a pas, et il a attrapé cet oubli avant moi. Une table sans isolation dans
-- un schéma multi-entreprise est une exception qu'il faut assumer explicitement, jamais laisser
-- passer par distraction.
alter table public.metric_definition enable row level security;

create policy metric_definition_select on public.metric_definition
  for select to authenticated
  using (true);

grant select on public.metric_definition to authenticated;

comment on table public.metric_definition is
  'Ce qu''une métrique mesure, et COMMENT. Une métrique sans définition ne peut pas être un '
  'objectif : la clé étrangère de « objective.metric » l''interdit. Seules les métriques ayant '
  'une source de vérité réelle sont ici — en ajouter une sans moteur ferait un tableau de bord '
  'de zéros présentés comme des mesures.';

comment on column public.metric_definition.capacite_requise is
  'La capacité qui doit être disponible pour que ce chiffre veuille dire quelque chose. Sans '
  'moteur d''envoi, un taux de réponse vaut zéro parce que rien n''est parti — pas parce que '
  'personne n''a répondu. L''écran doit dire « indisponible », jamais « 0 ».';

-- ── 2. Les métriques réellement mesurables aujourd'hui ──────────────────────
--
-- L'ordre compte : les ratios référencent les métriques qu'ils divisent.

insert into public.metric_definition
  (cle, libelle, unite, agregation, natures_outcome, etat_lead, numerateur, denominateur, capacite_requise)
values
  -- Depuis les fiches, écrites par les moteurs montés.
  ('prospects_trouves',   'entreprises repérées',        'nombre', 'compte', null, 'tous',      null, null, null),
  ('prospects_examines',  'entreprises examinées',       'nombre', 'compte', null, 'examine',   null, null, 'qualifier.prospect'),
  ('prospects_qualifies', 'entreprises retenues',        'nombre', 'compte', null, 'qualifie',  null, null, 'qualifier.prospect'),

  -- Depuis les résultats, déclarés par le client.
  ('rendez_vous_qualifies', 'rendez-vous obtenus',       'nombre', 'compte', array['meeting'], null, null, null, null),
  ('ventes',                'ventes conclues',           'nombre', 'compte', array['sale'],    null, null, null, null),
  ('chiffre_affaires',      'chiffre d''affaires',       'euro',   'somme',  array['sale'],    null, null, null, null),

  -- ⚠️ Une réponse suppose qu'on ait écrit. Le moteur d'envoi n'est pas monté : la capacité
  -- requise le dit, pour que l'écran affiche « indisponible » et non « 0 ».
  ('reponses',              'réponses reçues',           'nombre', 'compte', array['response'], null, null, null, 'envoyer.prospect');

insert into public.metric_definition
  (cle, libelle, unite, agregation, numerateur, denominateur, capacite_requise)
values
  ('taux_qualification', 'part des entreprises retenues', 'pourcentage', 'ratio',
   'prospects_qualifies', 'prospects_examines', 'qualifier.prospect');

-- ── 3. Un objectif ne peut plus nommer une métrique qui n'existe pas ────────
--
-- ⚠️ CE QUE CETTE CLÉ ÉTRANGÈRE CHANGE POUR LE PARCOURS D'ACHAT. `recruter()` prend la métrique
-- dans le profil extrait par le MODÈLE. Une métrique inventée faisait naître un objectif
-- immesurable, affiché avec le chiffre d'une autre. Elle fera désormais échouer le recrutement —
-- bruyamment, avec un message lisible, plutôt que silencieusement avec un faux tableau de bord.
--
-- Aucune donnée à reprendre : `objective` compte 0 ligne en ligne.

alter table public.objective
  add constraint objective_metrique_connue
  foreign key (metric) references public.metric_definition (cle);

-- ── 4. Le calcul ne connaît plus aucune nature de résultat ──────────────────

create or replace function public.avancement_vers_l_objectif(p_tenant uuid)
returns table (
  metrique        text,
  cible           numeric,
  horizon_jours   integer,
  jours_ecoules   integer,
  realise         numeric,
  rythme_requis   numeric,
  rythme_observe  numeric,
  ecart_de_rythme numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  o        public.objective;
  d        public.metric_definition;
  ecoules  integer;
  v        numeric;
begin
  select * into o from public.objective
   where tenant_id = p_tenant and state = 'actif'
   limit 1;
  if not found then
    return;
  end if;

  select * into d from public.metric_definition where cle = o.metric;
  if not found then
    -- Impossible depuis la clé étrangère ci-dessus, sauf si quelqu'un la retire un jour.
    raise exception
      'Métrique « % » sans définition : on ne sait pas la mesurer, donc on ne l''affiche pas.',
      o.metric;
  end if;

  -- ⚠️ FORMULE INCHANGÉE depuis `20260815120028`. La reprendre à l'identique n'est pas de la
  -- superstition : un test d'invariant vérifie « 10 jours écoulés » sur un objectif daté d'il y a
  -- dix jours, et une définition qui compte le jour courant en plus donnerait onze. Réparer le
  -- réalisé ne doit pas déplacer le rythme.
  ecoules := least(
    greatest(ceil(extract(epoch from now() - o.created_at) / 86400)::integer, 1),
    o.horizon_jours
  );

  -- ⚠️ BORNÉ AUX MISSIONS DE CET OBJECTIF, comme avant. Compter à l'échelle de l'entreprise
  -- ferait remonter les résultats obtenus sous un objectif retiré : le nouveau naîtrait déjà
  -- atteint.
  v := public.realise_de_la_metrique(p_tenant, o.metric, o.id);

  return query select
    o.metric,
    o.target_value,
    o.horizon_jours,
    ecoules,
    v,
    round(o.target_value::numeric / o.horizon_jours, 2),
    round(v / ecoules, 2),
    round(v / ecoules - o.target_value::numeric / o.horizon_jours, 2);
end;
$$;

-- ── 5. Le réalisé d'une métrique, lu depuis SA source déclarée ──────────────

-- `p_objectif` nul = à l'échelle de l'entreprise, pour un tableau de bord. Renseigné = borné aux
-- missions de CET objectif, pour une progression.
create or replace function public.realise_de_la_metrique(
  p_tenant   uuid,
  p_metrique text,
  p_objectif uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  d   public.metric_definition;
  n   numeric;
  num numeric;
  den numeric;
begin
  select * into d from public.metric_definition where cle = p_metrique;
  if not found then
    raise exception 'Métrique « % » inconnue.', p_metrique;
  end if;

  if d.agregation = 'ratio' then
    num := public.realise_de_la_metrique(p_tenant, d.numerateur, p_objectif);
    den := public.realise_de_la_metrique(p_tenant, d.denominateur, p_objectif);
    -- Aucune entreprise examinée ne fait pas un taux de 0 % : ça n'en fait aucun.
    if den = 0 then
      return 0;
    end if;
    return round(num * 100 / den, 2);
  end if;

  if d.natures_outcome is not null then
    if d.agregation = 'somme' then
      select coalesce(sum(oc.value), 0) into n
        from public.outcome oc
        join public.task t on t.id = oc.task_id and t.tenant_id = oc.tenant_id
       where oc.tenant_id = p_tenant
         and oc.kind = any (d.natures_outcome)
         and (p_objectif is null or t.objective_id = p_objectif);
    else
      select count(*) into n
        from public.outcome oc
        join public.task t on t.id = oc.task_id and t.tenant_id = oc.tenant_id
       where oc.tenant_id = p_tenant
         and oc.kind = any (d.natures_outcome)
         and (p_objectif is null or t.objective_id = p_objectif);
    end if;
    return n;
  end if;

  select count(*) into n
    from public.lead l
   where l.tenant_id = p_tenant
     and case d.etat_lead
           when 'tous'     then true
           when 'examine'  then l.qualification <> 'nouveau'
           when 'qualifie' then l.qualification = 'qualifie'
           when 'ecarte'   then l.qualification = 'ecarte'
           else false
         end;
  return n;
end;
$$;

revoke all on function public.realise_de_la_metrique(uuid, text, uuid) from public;
revoke all on function public.avancement_vers_l_objectif(uuid) from public;

-- ── 6. Contrôle : la migration n'a rien laissé d'immesurable ────────────────

do $$
declare
  n integer;
begin
  select count(*) into n from public.objective o
   where not exists (select 1 from public.metric_definition m where m.cle = o.metric);
  if n > 0 then
    raise exception '% objectif(s) nomment une métrique sans définition.', n;
  end if;

  select count(*) into n from public.metric_definition;
  raise notice
    'OK  % métriques savent comment elles se mesurent ; un objectif ne peut plus en nommer d''autre.', n;
end;
$$;
