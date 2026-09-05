-- LADY-N — celui qui a payé retrouve son entreprise à sa première connexion.
--
-- ══ LE TROU ══
--
-- `recruter()` crée l'entreprise, l'employé, la configuration — et **personne pour les voir**.
-- Aucune ligne de `tenant_member` n'est écrite, donc l'espace privé répond « ce compte n'est
-- rattaché à aucune entreprise » à celui qui vient de payer.
--
-- Il ne pouvait pas en être autrement au moment du paiement : **l'acheteur n'a pas encore de
-- compte**. Il paie, puis il se connecte — souvent depuis un autre appareil, parfois le lendemain.
-- Créer un `tenant_member` demanderait un identifiant d'utilisateur qui n'existe pas.
--
-- ══ CE QU'ON POSE ══
--
-- Le recrutement écrit une **attente de rattachement** : cette adresse, cette entreprise. À la
-- première connexion, l'utilisateur qui présente cette adresse est rattaché, et l'attente est
-- consommée.
--
-- ⚠️ **L'adresse est vérifiée par le fournisseur d'identité, pas par nous.** Un lien magique
-- prouve que celui qui clique lit cette boîte. C'est ce qui rend le rapprochement sûr : sans
-- cette preuve, rattacher sur une adresse déclarée laisserait n'importe qui réclamer l'entreprise
-- de n'importe qui.
--
-- ⚠️ **Une attente se consomme une fois.** Sans ça, une adresse partagée — ou récupérée après un
-- changement de propriétaire — rattacherait indéfiniment de nouveaux comptes à une entreprise.
--
-- Réalise : RECRUT-10

create table public.rattachement_attendu (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  -- Normalisée à l'écriture : « Marc@Exemple.FR » et « marc@exemple.fr » sont la même personne,
  -- et laisser la casse décider ferait échouer un rattachement sans que personne comprenne.
  email        text not null check (position('@' in email) > 1),
  cree_le      timestamptz not null default now(),
  consomme_le  timestamptz,
  consomme_par uuid,

  constraint rattachement_consomme_dit_par_qui
    check ((consomme_le is null) = (consomme_par is null))
);

-- Une entreprise n'attend qu'un rattachement à la fois. Deux attentes ouvertes rendraient
-- « laquelle » indécidable, et la réponse dépendrait de l'ordre d'insertion.
create unique index rattachement_attendu_unique
  on public.rattachement_attendu (tenant_id)
  where consomme_le is null;

create index rattachement_attendu_email_idx
  on public.rattachement_attendu (email)
  where consomme_le is null;

alter table public.rattachement_attendu enable row level security;
-- Aucune politique : une attente de rattachement dit qui possède quelle entreprise. Elle est
-- écrite et lue côté serveur, jamais exposée — la lire permettrait d'énumérer les acheteurs.

create trigger rattachement_attendu_tenant_immutable
  before update on public.rattachement_attendu
  for each row execute function public.reject_tenant_change();

comment on table public.rattachement_attendu is
  'Qui doit récupérer quelle entreprise à sa première connexion. L''acheteur n''a pas de compte '
  'au moment où il paie : le rattachement ne peut donc pas être fait à ce moment-là.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Le rattachement, à la connexion
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.rattacher_par_email(p_user uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attente public.rattachement_attendu;
begin
  if p_user is null or length(trim(coalesce(p_email, ''))) = 0 then
    raise exception 'Rattachement sans utilisateur ni adresse : rien à rapprocher.';
  end if;

  select * into attente
    from public.rattachement_attendu
   where email = lower(trim(p_email)) and consomme_le is null
   order by cree_le
   limit 1;

  -- Aucune attente : ce n'est pas une erreur. La plupart des connexions sont des retours, pas
  -- des premières fois.
  if not found then
    return null;
  end if;

  insert into public.tenant_member (tenant_id, user_id, role)
  values (attente.tenant_id, p_user, 'owner')
  on conflict (tenant_id, user_id) do nothing;

  update public.rattachement_attendu
     set consomme_le = now(), consomme_par = p_user
   where id = attente.id;

  return attente.tenant_id;
end;
$$;

revoke execute on function public.rattacher_par_email(uuid, text) from public;

comment on function public.rattacher_par_email(uuid, text) is
  'Rapproche un compte fraîchement connecté de l''entreprise qu''il a payée. L''adresse est '
  'prouvée par le fournisseur d''identité — un lien magique atteste que celui qui clique lit '
  'cette boîte.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Le recrutement écrit l'attente
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- L'adresse de l'acheteur devient un paramètre du recrutement. L'ancienne signature est retirée :
-- deux versions coexistantes laisseraient un appelant recruter sans adresse, et créer une
-- entreprise que personne ne peut réclamer.

drop function public.recruter(uuid, text, text, text);

create function public.recruter(
  p_recommendation      uuid,
  p_nom_entreprise      text,
  p_tier                text,
  p_reference_paiement  text,
  p_email_acheteur      text
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

  if position('@' in coalesce(p_email_acheteur, '')) < 2 then
    raise exception
      'Recrutement sans adresse d''acheteur : personne ne pourrait réclamer cette entreprise.';
  end if;

  select s.tenant_id into v_tenant
    from public.subscription s where s.billing_reference = p_reference_paiement;

  if v_tenant is not null then
    select e.id into v_employe from public.employee e where e.tenant_id = v_tenant limit 1;
    select c.id into v_config
      from public.lady_configuration c where c.tenant_id = v_tenant and c.active limit 1;
    return query select v_tenant, v_employe, v_config, true;
    return;
  end if;

  select * into reco from public.recommendation r where r.id = p_recommendation;
  if not found then
    raise exception 'Recommandation % introuvable : rien à recruter.', p_recommendation;
  end if;

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

  insert into public.tenant (name) values (p_nom_entreprise) returning id into v_tenant;

  update public.diagnostic_session set tenant_id = v_tenant where id = session.id;

  insert into public.subscription
    (tenant_id, plan_id, status, current_period_start, current_period_end, billing_reference)
  values (v_tenant, formule, 'active', now(), now() + interval '30 days', p_reference_paiement);

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

  select id into noyau
    from public.employee_definition order by version desc limit 1;

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

  select id into identite from public.reserve_identity('commercial');

  insert into public.employee (tenant_id, employee_definition_id, identity_id)
  values (v_tenant, noyau, identite)
  returning id into v_employe;

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

  -- ⭐ L'attente de rattachement. Sans elle, on vient de créer une entreprise que personne ne
  -- peut réclamer : l'acheteur se connecterait sur un espace vide.
  insert into public.rattachement_attendu (tenant_id, email)
  values (v_tenant, lower(trim(p_email_acheteur)));

  select i.first_name into prenom from public.identity i where i.id = identite;

  insert into public.notification (tenant_id, employee_id, kind, message)
  values (v_tenant, v_employe, 'recrutement',
          prenom || ' rejoint votre équipe et commence dès aujourd''hui.');

  update public.recommendation set status = 'purchased' where id = reco.id;

  return query select v_tenant, v_employe, v_config, false;
end;
$$;

revoke execute on function public.recruter(uuid, text, text, text, text) from public;
