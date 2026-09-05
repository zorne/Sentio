-- LADY-J — le recrutement : d'une recommandation payée à une Lady qui travaille.
--
-- ══ CE QUI MANQUAIT ══
--
-- Rien, en production, ne transformait une recommandation en employé. `reserve_identity()` n'était
-- appelée que par des fixtures de test. Autrement dit : **personne ne pouvait acheter**, même en
-- le voulant, et chaque pièce posée depuis l'étape 1 attendait un chemin qui n'existait pas.
--
-- ══ POURQUOI UNE SEULE TRANSACTION ══
--
-- Un recrutement, c'est neuf écritures qui n'ont aucun sens séparées : l'entreprise, l'identité
-- réservée, l'employé figé sur son noyau, l'abonnement, l'objectif, la configuration, ses
-- capacités, le contexte d'entreprise, la notification. Interrompu au milieu, il laisse un client
-- qui a **payé** et un employé qui ne peut pas travailler — ou pire, une identité consommée pour
-- rien, alors qu'une identité ne se réutilise jamais.
--
-- ⚠️ **L'ordre n'est pas indifférent.** L'abonnement précède les capacités : le garde de périmètre
-- (`20260815120004`) refuse d'activer une capacité sans formule active, et il a raison — on ne
-- construit pas une configuration sur un périmètre supposé.
--
-- ══ IDEMPOTENCE ══
--
-- Un prestataire de paiement rejoue ses notifications. Sans garde, un rejeu créerait une seconde
-- entreprise, un second employé, et **consommerait une seconde identité**. La référence de
-- facturation est donc unique, et un rejeu rend le recrutement déjà fait au lieu d'en faire un
-- autre. C'est l'invariant 3 du dépôt (AGENTS.md), appliqué là où il coûte le plus cher.
--
-- Réalise : RECRUT-03, RECRUT-04, RECRUT-05, RECRUT-06, RECRUT-10

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Une référence de facturation ne sert qu'une fois
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create unique index subscription_reference_unique
  on public.subscription (billing_reference)
  where billing_reference is not null;

comment on index public.subscription_reference_unique is
  'Un paiement rejoué ne recrute pas deux fois. Sans cet index, un rejeu consommerait une '
  'seconde identité — et une identité ne se réutilise jamais.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Le recrutement
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.recruter(
  p_recommendation      uuid,
  p_nom_entreprise      text,
  p_tier                text,
  p_reference_paiement  text
)
returns table (tenant_id uuid, employee_id uuid, configuration_id uuid, deja_recrute boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reco        public.recommendation;
  session     public.diagnostic_session;
  proposition jsonb;
  formule     uuid;
  noyau       uuid;
  identite    uuid;
  v_tenant    uuid;
  v_employe   uuid;
  v_config    uuid;
  objectif    jsonb;
  cle         text;
  valeur      jsonb;
  prenom      text;
begin
  if length(trim(coalesce(p_reference_paiement, ''))) = 0 then
    raise exception
      'Recrutement sans référence de paiement : rien ne distinguerait un rejeu d''un second achat.';
  end if;

  -- ── 0. Un rejeu ne recrute pas deux fois. On rend ce qui existe déjà.
  select s.tenant_id into v_tenant
    from public.subscription s where s.billing_reference = p_reference_paiement;

  if v_tenant is not null then
    select e.id into v_employe from public.employee e where e.tenant_id = v_tenant limit 1;
    select c.id into v_config
      from public.lady_configuration c where c.tenant_id = v_tenant and c.active limit 1;
    return query select v_tenant, v_employe, v_config, true;
    return;
  end if;

  -- ── 1. La recommandation, et ce qu'elle autorise.
  select * into reco from public.recommendation r where r.id = p_recommendation;
  if not found then
    raise exception 'Recommandation % introuvable : rien à recruter.', p_recommendation;
  end if;
  -- L'ordre des refus dit ce qui compte. « Hors périmètre » vient EN PREMIER : c'est la raison
  -- de fond, et la dire évite un message qui parlerait d'un statut alors que le problème est
  -- qu'on a écrit noir sur blanc à ce client qu'on ne saurait pas l'aider.
  proposition := reco.configuration_proposee;
  if proposition is null then
    raise exception
      'Cette recommandation est hors périmètre : aucune configuration n''a été proposée. '
      'On ne vend pas un employé incapable de faire le travail.';
  end if;

  if reco.status <> 'proposed' then
    raise exception
      'Recommandation déjà « % » : on ne recrute pas deux fois sur la même proposition.',
      reco.status;
  end if;

  select * into session
    from public.diagnostic_session d where d.id = reco.diagnostic_session_id;

  select p.id into formule from public.plan p where p.tier = p_tier and p.commercialisable;
  if formule is null then
    raise exception 'Formule « % » inconnue ou non commercialisable.', p_tier;
  end if;

  -- ── 2. L'entreprise, et le diagnostic qui lui est rattaché.
  insert into public.tenant (name) values (p_nom_entreprise) returning id into v_tenant;

  update public.diagnostic_session set tenant_id = v_tenant where id = session.id;

  -- ── 3. L'abonnement AVANT les capacités : sans formule active, le périmètre n'est pas défini
  --    et le garde refuse — à raison.
  insert into public.subscription
    (tenant_id, plan_id, status, current_period_start, current_period_end, billing_reference)
  values (v_tenant, formule, 'active', now(), now() + interval '30 days', p_reference_paiement);

  -- ── 4. L'objectif du dirigeant, tel qu'il l'a énoncé. Sans lui, aucune mission ne s'ouvre
  --    (`20260815120002`) : un employé lancé sans but travaille pour personne.
  objectif := session.extracted_profile -> 'objective';
  if objectif is null or objectif = 'null'::jsonb then
    raise exception
      'Aucun objectif dans le diagnostic : on ne recrute pas quelqu''un sans lui dire pour quoi.';
  end if;

  insert into public.objective (tenant_id, metric, target_value, horizon)
  values (v_tenant,
          objectif ->> 'metric',
          (objectif ->> 'target')::numeric,
          objectif ->> 'horizon');

  -- ── 5. Le noyau. L'employé est figé sur la version courante : publier une version suivante ne
  --    changera jamais son comportement (invariant 1).
  select id into noyau
    from public.employee_definition order by version desc limit 1;

  -- ⚠️ La proposition et le noyau doivent s'accorder — et c'est vérifié AVANT de réserver une
  -- identité, qui ne se réutilise jamais.
  --
  -- Le moteur de composition tient sa bibliothèque en code ; le noyau tient la sienne en données.
  -- Rien n'oblige structurellement les deux à rester d'accord : le jour où elles divergent, le
  -- recrutement casse — c'est-à-dire APRÈS le paiement, au pire moment possible. Mieux vaut un
  -- message qui nomme la dérive qu'une contrainte qui échoue trois étapes plus loin.
  select string_agg(cle_proposee, ', ' order by cle_proposee) into cle
    from jsonb_array_elements_text(coalesce(proposition -> 'capacites', '[]'::jsonb))
      as cle_proposee
   where not ((select d.capacites from public.employee_definition d where d.id = noyau)
              ? cle_proposee);

  if cle is not null then
    raise exception
      'Recrutement impossible : la configuration proposée active « % », que ce noyau ne conçoit '
      'pas. La bibliothèque du moteur de composition et les capacités du noyau ont divergé.', cle;
  end if;

  -- ── 6. L'identité, réservée atomiquement. Elle ne se réutilise jamais : c'est aussi pourquoi
  --    tout ce qui peut échouer doit échouer AVANT ce point.
  select id into identite from public.reserve_identity('commercial');

  insert into public.employee (tenant_id, employee_definition_id, identity_id)
  values (v_tenant, noyau, identite)
  returning id into v_employe;

  -- ── 7. La configuration v1, telle que le diagnostic l'a composée. Sa raison est la
  --    justification rendue au dirigeant : ce qu'il a lu est ce qui est écrit.
  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, priorites, limites, autonomie,
     declencheur, raison, diagnostic_session_id, active)
  values (v_tenant, v_employe, 1,
          proposition ->> 'role',
          coalesce(proposition -> 'priorites', '[]'::jsonb),
          coalesce(proposition -> 'limites', '[]'::jsonb),
          coalesce(proposition ->> 'autonomie', 'confirm'),
          'recrutement',
          reco.justification,
          session.id,
          false)
  returning id into v_config;

  insert into public.lady_configuration_capability (configuration_id, capability_id)
  select v_config, c.id
    from public.capability c
   where c.key in (select jsonb_array_elements_text(coalesce(proposition -> 'capacites', '[]'::jsonb)));

  perform public.appliquer_la_configuration(v_config);

  -- ── 8. Le contexte d'entreprise, repris du diagnostic. L'auteur est le CLIENT : c'est lui qui
  --    l'a dit, et il doit pouvoir le corriger. Écrire « sentio » ici lui retirerait la main sur
  --    ses propres données.
  for cle, valeur in
    select key, value from jsonb_each(session.extracted_profile)
     where key in ('sector', 'targetCustomers', 'headcount')
       and value <> 'null'::jsonb
  loop
    insert into public.company_profile (tenant_id, key, value, author, status)
    values (v_tenant,
            case cle when 'sector' then 'secteur'
                     when 'targetCustomers' then 'cible'
                     else 'effectif' end,
            valeur, 'client', 'actif');
  end loop;

  -- ── 9. La notification. Le dirigeant apprend qui le rejoint, par son prénom.
  select i.first_name into prenom from public.identity i where i.id = identite;

  insert into public.notification (tenant_id, employee_id, kind, message)
  values (v_tenant, v_employe, 'recrutement',
          prenom || ' rejoint votre équipe et commence dès aujourd''hui.');

  -- ── 10. La recommandation est consommée. L'index unique sur la référence de paiement rend le
  --     rejeu inoffensif ; ceci rend le double achat impossible même sans référence rejouée.
  update public.recommendation set status = 'purchased' where id = reco.id;

  return query select v_tenant, v_employe, v_config, false;
end;
$$;

comment on function public.recruter(uuid, text, text, text) is
  'D''une recommandation payée à une Lady qui travaille, en UNE transaction. Un rejeu rend le '
  'recrutement déjà fait au lieu d''en créer un second — une identité ne se réutilise jamais.';

-- Réservée au serveur : recruter engage de l'argent et consomme une identité. Ce n'est pas un
-- geste de client, et encore moins un geste que le navigateur peut déclencher.
revoke execute on function public.recruter(uuid, text, text, text) from public;
