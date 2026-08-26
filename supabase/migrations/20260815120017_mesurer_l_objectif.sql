-- LADY-S — l'objectif devient mesurable, et l'écart devient visible.
--
-- ══ LE MANQUE ══
--
-- `objective.horizon` est du TEXTE LIBRE : « ce mois », « mensuel », « d'ici juin ». Un dirigeant
-- le lit très bien ; **aucune requête ne peut le compter**. Impossible, donc, de répondre à la
-- seule question qui l'intéresse : *« où en suis-je de mes 10 000 € ? »*
--
-- Le produit affichait la cible et se taisait sur l'avancement — non par pudeur, mais parce qu'il
-- ne savait pas le calculer.
--
-- ══ CE QU'ON AJOUTE ══
--
-- `horizon_jours` : la même chose, en nombre. Le texte reste, il est ce que le dirigeant a dit et
-- ce qu'on lui réaffiche ; le nombre est ce sur quoi on compte. Les séparer évite d'avoir à
-- deviner « mensuel » — ce qu'aucune analyse de texte ne fera jamais de façon fiable.
--
-- ══ CE QUE LA MESURE NE FAIT PAS ══
--
-- ⚠️ Elle ne promet rien et n'extrapole rien. Elle compare deux rythmes : celui que la cible
-- exige, et celui qu'on observe. Un pourcentage de « chance d'atteindre l'objectif » serait un
-- chiffre que rien ne justifie (AGENTS.md, invariant 4).
--
-- ⚠️ Et elle ne compte QUE des ventes déclarées par le client. `outcome` l'impose déjà : une
-- vente sans montant, ou déclarée par Sentio, est refusée à l'écriture (`20260729120019`). Le
-- chiffre affiché au dirigeant est donc le sien, pas le nôtre.
--
-- Réalise : LADY-S

alter table public.objective
  add column horizon_jours integer not null default 30
    check (horizon_jours > 0 and horizon_jours <= 366);

comment on column public.objective.horizon_jours is
  'L''horizon en nombre de jours. `horizon` reste le texte que le dirigeant a dit ; celui-ci est '
  'ce sur quoi on compte. Deviner l''un depuis l''autre n''est fiable dans aucun sens.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- L'avancement
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.avancement_vers_l_objectif(p_tenant uuid)
returns table (
  metrique        text,
  cible           numeric,
  horizon_jours   integer,
  jours_ecoules   integer,
  realise         numeric,
  rythme_requis   numeric,
  rythme_observe  numeric,
  -- Négatif = en retard sur la cadence qu'exige la cible. C'est le seul jugement porté.
  ecart_de_rythme numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with objectif as (
    select o.id, o.metric, o.target_value, o.horizon_jours, o.created_at
      from public.objective o
     where o.tenant_id = p_tenant and o.state = 'actif'
     limit 1
  ),
  fenetre as (
    select o.*,
           -- Bornés à l'horizon : au-delà, le rythme observé n'a plus de sens face à une cible
           -- qui, elle, portait sur une période finie.
           least(
             greatest(ceil(extract(epoch from now() - o.created_at) / 86400)::integer, 1),
             o.horizon_jours
           ) as ecoules
      from objectif o
  ),
  ventes as (
    -- ⚠️ On compte les ventes des missions qui servent CET objectif, pas toutes celles de
    -- l'entreprise. La chaîne mission → objectif existe depuis `20260815120002` : s'en servir
    -- évite d'attribuer à une cible le résultat d'un travail ouvert pour une autre.
    select coalesce(sum(oc.value), 0) as total
      from public.outcome oc
      join public.task t on t.id = oc.task_id and t.tenant_id = oc.tenant_id
      join fenetre f on t.objective_id = f.id
     where oc.tenant_id = p_tenant
       and oc.kind = 'sale'
  )
  select f.metric,
         f.target_value,
         f.horizon_jours,
         f.ecoules,
         v.total,
         round(f.target_value / f.horizon_jours, 2),
         round(v.total / f.ecoules, 2),
         round(v.total / f.ecoules - f.target_value / f.horizon_jours, 2)
    from fenetre f cross join ventes v;
$$;

comment on function public.avancement_vers_l_objectif(uuid) is
  'Où en est le dirigeant de sa cible. Compare deux rythmes — celui qu''elle exige, celui qu''on '
  'observe — et ne prédit rien : une « probabilité d''atteindre l''objectif » serait un chiffre '
  'que rien ne justifie.';

-- Le dirigeant doit pouvoir la lire : c'est SON avancement, sur SES ventes déclarées.
grant execute on function public.avancement_vers_l_objectif(uuid) to authenticated;
