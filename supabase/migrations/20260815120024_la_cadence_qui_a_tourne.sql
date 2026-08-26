-- LADY-Z — la cadence de relance appliquée est enfin CELLE QUI A ÉTÉ TIRÉE.
--
-- ══ LE DÉFAUT, ET POURQUOI IL ÉTAIT PIRE QU'UN OUBLI ══
--
-- Depuis `20260815120020`, chaque mission se voit attribuer un « moment de relance » tracé dans
-- `task_variant`, et `resultats_par_variante` compte ce que chacun a produit. Sauf que
-- `cadence_de_relance` lisait, elle, la variante **par défaut du métier** — la même pour tout le
-- monde, quelle que soit celle attribuée à la mission.
--
-- Autrement dit : **toutes les missions relançaient au même rythme, et on comparait les résultats
-- comme si elles avaient relancé à des rythmes différents.** Ce n'est pas une fonctionnalité
-- manquante, c'est une mesure fausse — et elle aurait fini par « désigner une gagnante », écrire
-- un `strategy_change` et annoncer au dirigeant une évolution qui ne changeait rigoureusement
-- rien. C'est exactement la notification décorative que `docs/08` interdit.
--
-- ══ L'ORDRE DE LECTURE, ET IL N'EST PAS INDIFFÉRENT ══
--
--   1. **la variante de la mission** — c'est elle qui a été jouée, c'est à elle que les résultats
--      sont attribués. La mesure n'est honnête qu'à cette condition ;
--   2. **la préférence de l'entreprise** — pour une mission ouverte avant qu'on attribue des
--      variantes, ou dont la variante a été désactivée depuis ;
--   3. **la variante par défaut du métier** — le comportement défini quand rien d'autre ne parle.
--
-- ⚠️ Aucun repli sur une valeur écrite en dur, à aucune étape. Une cadence en dur réapparaîtrait
-- le jour où les trois lectures échouent, et personne ne saurait d'où elle vient.
--
-- Réalise : LADY-Z

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. La cadence, rattachée au prospect qu'on relance
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.cadence_de_relance(p_tenant uuid, p_lead uuid, p_rang integer)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select (contenu -> 'jours' ->> (p_rang - 1))::integer
    from (
      select coalesce(
        -- 1. Ce que CETTE mission a joué.
        (select v.content
           from public.task t
           join public.task_variant tv on tv.tenant_id = t.tenant_id and tv.task_id = t.id
           join public.strategy_variant v on v.id = tv.variant_id
          where t.tenant_id = p_tenant
            and t.subject_kind = 'lead'
            and t.subject_id = p_lead
            and v.kind = 'moment_de_relance'
            and v.actif
          order by t.created_at desc, t.id
          limit 1),
        -- 2. Ce qui a gagné chez cette entreprise.
        (select v.content
           from public.tenant_variant_preference p
           join public.strategy_variant v on v.id = p.variant_id
          where p.tenant_id = p_tenant and p.kind = 'moment_de_relance' and v.actif),
        -- 3. Le comportement défini par défaut.
        (select v.content
           from public.strategy_variant v
          where v.profession = (
                  select d.gisement from public.employee e
                    join public.employee_definition d on d.id = e.employee_definition_id
                   where e.tenant_id = p_tenant limit 1)
            and v.kind = 'moment_de_relance'
            and v.par_defaut and v.actif)
      ) as contenu
    ) as choisie
   where p_rang >= 1;
$$;

comment on function public.cadence_de_relance(uuid, uuid, integer) is
  'Le délai avant relance, lu dans la variante que CETTE mission a jouée — puis dans la '
  'préférence de l''entreprise, puis dans la variante par défaut. Sans cet ordre, on comparerait '
  'des cadences qui n''ont jamais tourné.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. La garde de relance lit la nouvelle cadence
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Seule la ligne du délai change. Les sept autres conditions ont été éprouvées une par une
-- (`METIER-12`) et les recopier reviendrait à en tenir deux versions.

create or replace function public.peut_relancer(
  p_tenant              uuid,
  p_lead                uuid,
  p_domaine             uuid,
  p_envoyes_aujourdhui  integer,
  p_plafond_formule     integer
)
returns text
language plpgsql
stable
as $$
declare
  verdict_envoi   text;
  statut_prospect text;
  deja_envoyes    integer;
  rang            integer;
  dernier_envoi   timestamptz;
  delai_minimal   integer;
begin
  verdict_envoi := public.peut_envoyer(
    p_tenant, p_lead, p_domaine, p_envoyes_aujourdhui, p_plafond_formule);
  if verdict_envoi <> 'ok' then
    return verdict_envoi;
  end if;

  select status into statut_prospect
    from public.lead where id = p_lead and tenant_id = p_tenant;
  if statut_prospect = 'repondu' then
    return 'prospect_a_deja_repondu';
  end if;

  if exists (
    select 1 from public.outbound_message
     where tenant_id = p_tenant and lead_id = p_lead and status = 'repondu'
  ) then
    return 'prospect_a_deja_repondu';
  end if;

  select count(*), max(sent_at) into deja_envoyes, dernier_envoi
    from public.outbound_message
   where tenant_id = p_tenant and lead_id = p_lead;

  if deja_envoyes = 0 then
    return 'aucun_message_a_relancer';
  end if;

  rang := deja_envoyes;

  -- ⚠️ La cadence de CETTE mission, plus celle du métier en général.
  delai_minimal := public.cadence_de_relance(p_tenant, p_lead, rang);
  if delai_minimal is null then
    return 'relances_epuisees';
  end if;

  if dernier_envoi > now() - make_interval(days => delai_minimal) then
    return 'trop_tot_pour_relancer';
  end if;

  return 'ok';
end;
$$;

-- L'ancienne signature disparaît : la laisser en place laisserait un second chemin, sans
-- entreprise et sans mission, qui rendrait la cadence d'un autre. Un appelant oublié se
-- signalera par une erreur de fonction inconnue — pas par une valeur silencieusement fausse.
drop function public.cadence_de_relance(integer);
