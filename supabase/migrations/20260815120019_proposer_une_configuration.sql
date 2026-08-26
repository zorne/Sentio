-- LADY-U — le déclencheur : des résultats mesurés deviennent une PROPOSITION, jamais un fait.
--
-- ══ CE QUI MANQUAIT ══
--
-- La boucle était ouverte. `mesures_du_travail()` (`..018`) sait ce que Lady a produit ;
-- `releverDesResultats()` sait en tirer des constats ; le moteur de composition sait en tirer une
-- configuration. Mais **rien ne reliait la sortie du travail à l'entrée du diagnostic** : Lady
-- pouvait échouer un mois entier sans que sa configuration bouge d'un millimètre.
--
-- ══ LA RÈGLE QUI COMMANDE TOUT CE FICHIER ══
--
-- **Lady ne change jamais de rôle toute seule** (§10 de la vision). Une réévaluation PROPOSE une
-- version suivante ; elle ne l'applique pas. La version proposée naît `active = false` et le reste
-- tant qu'un dirigeant n'a pas dit oui.
--
-- Ce n'est pas de la prudence de façade. Un produit qui se reconfigure seul sur ses propres
-- chiffres finit par déplacer l'employé toutes les semaines, ne terminer aucune approche, et
-- expliquer chaque échec par le mouvement précédent. Le client, lui, découvrirait au réveil que
-- ce qu'il a acheté fait autre chose.
--
-- ══ UNE SEULE PROPOSITION À LA FOIS ══
--
-- Tant que le dirigeant n'a pas répondu, une seconde mesure ne propose rien de neuf : elle rend
-- la proposition en attente. Sinon chaque battement empilerait une version de plus, et la
-- question posée au client changerait sous ses yeux avant qu'il ait pu y répondre.
--
-- ⚠️ La notification est de genre `proposition`, pas `evolution`. Rien n'a évolué : on demande.
-- La notification d'évolution reste adossée à un `strategy_change` (`20260729120021`), et n'est
-- émise qu'à l'acceptation — quand le changement a réellement eu lieu.
--
-- Réalise : LADY-U

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Un refus se garde, lui aussi
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Sans trace du refus, une proposition écartée resterait « en attente » pour toujours et
-- bloquerait toute réévaluation ultérieure. Et le refus est une information : un dirigeant qui
-- refuse trois fois le même déplacement nous dit quelque chose que nos mesures ne disent pas.

alter table public.lady_configuration
  add column refusee_le timestamptz;

comment on column public.lady_configuration.refusee_le is
  'Quand le dirigeant a écarté cette proposition. Nul tant qu''il n''a pas répondu. Une version '
  'appliquée n''est jamais refusée : le refus ne concerne que ce qui n''a pas encore pris effet.';

alter table public.lady_configuration
  add constraint lady_configuration_refus_non_applique
    check (not (active and refusee_le is not null));

alter table public.notification drop constraint notification_kind_check;
alter table public.notification
  add constraint notification_kind_check
    check (kind in ('recrutement', 'travail', 'evolution', 'proposition'));

comment on constraint notification_kind_check on public.notification is
  '« proposition » demande une décision au dirigeant ; « evolution » constate un changement déjà '
  'fait. Les confondre annoncerait comme acquis ce qui attend encore une réponse.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. La proposition
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.proposer_une_configuration(
  p_tenant    uuid,
  p_employee  uuid,
  p_role      text,
  p_priorites jsonb,
  p_limites   jsonb,
  p_autonomie text,
  p_capacites text[],
  p_raison    text
)
returns table (configuration_id uuid, deja_proposee boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active     public.lady_configuration;
  derniere   public.lady_configuration;
  en_attente uuid;
  suivante   uuid;
  inconnue   text;
  prenom     text;
begin
  select * into active
    from public.lady_configuration c
   where c.tenant_id = p_tenant and c.employee_id = p_employee and c.active;

  if not found then
    raise exception
      'Cet employé n''a aucune configuration active : il n''y a rien à faire évoluer.';
  end if;

  -- ── Une proposition déjà posée attend une réponse. On ne la remplace pas.
  select c.id into en_attente
    from public.lady_configuration c
   where c.tenant_id = p_tenant and c.employee_id = p_employee
     and not c.active and c.refusee_le is null and c.version > active.version
   order by c.version desc
   limit 1;

  if en_attente is not null then
    return query select en_attente, true;
    return;
  end if;

  -- ── Proposer ce qui est déjà en place n'est pas une proposition. On se tait : une version
  --    identique à la précédente ferait croire à un changement là où il n'y en a aucun.
  if active.role = p_role
     and active.autonomie = p_autonomie
     and active.priorites = coalesce(p_priorites, '[]'::jsonb)
     and active.limites = coalesce(p_limites, '[]'::jsonb)
     and (select coalesce(array_agg(c.key order by c.key), '{}'::text[])
            from public.lady_configuration_capability lcc
            join public.capability c on c.id = lcc.capability_id
           where lcc.configuration_id = active.id)
         = (select coalesce(array_agg(distinct demandee order by demandee), '{}'::text[])
              from unnest(coalesce(p_capacites, '{}'::text[])) as demandee)
  then
    return query select active.id, true;
    return;
  end if;

  -- ── Une capacité inconnue est une divergence entre le moteur de composition et la base. Le
  --    dire vaut mieux que proposer en silence une Lady amputée de ce qu'on croyait lui donner.
  select string_agg(demandee, ', ' order by demandee) into inconnue
    from unnest(coalesce(p_capacites, '{}'::text[])) as demandee
   where not exists (select 1 from public.capability c where c.key = demandee);

  if inconnue is not null then
    raise exception
      'Proposition impossible : « % » n''existe pas dans la bibliothèque de capacités.', inconnue;
  end if;

  -- La version suivante succède à la DERNIÈRE publiée, pas forcément à l'active : la chaîne doit
  -- rester continue, y compris derrière une proposition refusée (`20260815120003`, §2).
  select * into derniere
    from public.lady_configuration c
   where c.tenant_id = p_tenant and c.employee_id = p_employee
   order by c.version desc limit 1;

  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, priorites, limites, autonomie,
     declencheur, raison, diagnostic_session_id, precedente_id, active)
  values (p_tenant, p_employee, derniere.version + 1,
          p_role,
          coalesce(p_priorites, '[]'::jsonb),
          coalesce(p_limites, '[]'::jsonb),
          p_autonomie,
          'resultats',
          p_raison,
          active.diagnostic_session_id, derniere.id, false)
  returning id into suivante;

  insert into public.lady_configuration_capability (configuration_id, capability_id)
  select suivante, c.id from public.capability c where c.key = any(coalesce(p_capacites, '{}'::text[]));

  select i.first_name into prenom
    from public.employee e join public.identity i on i.id = e.identity_id
   where e.id = p_employee;

  insert into public.notification (tenant_id, employee_id, kind, message)
  values (p_tenant, p_employee, 'proposition',
          coalesce(prenom, 'Votre employé') ||
          ' propose de changer sa façon de travailler, au vu de ses résultats. ' ||
          'Rien ne change tant que vous n''avez pas répondu.');

  return query select suivante, false;
end;
$$;

comment on function public.proposer_une_configuration(uuid, uuid, text, jsonb, jsonb, text, text[], text) is
  'Des résultats mesurés deviennent une PROPOSITION de version suivante, inactive. Lady ne change '
  'jamais de rôle toute seule (§10) : c''est le dirigeant qui accepte.';

revoke execute on function public.proposer_une_configuration(uuid, uuid, text, jsonb, jsonb, text, text[], text) from public;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. La réponse du dirigeant
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.accepter_la_configuration(p_tenant uuid, p_configuration uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conf       public.lady_configuration;
  changement uuid;
begin
  select * into conf
    from public.lady_configuration c
   where c.id = p_configuration and c.tenant_id = p_tenant;

  if not found then
    raise exception 'Proposition introuvable pour cette entreprise : rien à accepter.';
  end if;

  if conf.active then
    -- Déjà en place : accepter deux fois ne doit pas republier ni renotifier.
    return conf.id;
  end if;

  if conf.refusee_le is not null then
    raise exception
      'Cette proposition a été refusée le % : on ne revient pas dessus par une seconde réponse. '
      'Une nouvelle mesure en produira une neuve.', conf.refusee_le::date;
  end if;

  -- Le changement est enregistré AVANT d'être annoncé : la notification d'évolution ne peut pas
  -- exister sans sa preuve (`20260729120021`), et c'est bien l'ordre qui le garantit.
  insert into public.strategy_change (tenant_id, employee_id, description)
  values (p_tenant, conf.employee_id, conf.raison)
  returning id into changement;

  perform public.appliquer_la_configuration(conf.id);

  insert into public.notification (tenant_id, employee_id, kind, message, strategy_change_id)
  values (p_tenant, conf.employee_id, 'evolution', conf.raison, changement);

  return conf.id;
end;
$$;

comment on function public.accepter_la_configuration(uuid, uuid) is
  'Le dirigeant accepte une proposition : elle prend effet, le changement est enregistré, et '
  'l''évolution est annoncée — dans cet ordre, pour qu''aucune annonce ne précède son fait.';

revoke execute on function public.accepter_la_configuration(uuid, uuid) from public;

create function public.refuser_la_configuration(p_tenant uuid, p_configuration uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conf public.lady_configuration;
begin
  select * into conf
    from public.lady_configuration c
   where c.id = p_configuration and c.tenant_id = p_tenant;

  if not found then
    raise exception 'Proposition introuvable pour cette entreprise : rien à refuser.';
  end if;

  if conf.active then
    raise exception
      'Cette configuration est celle qui s''applique aujourd''hui : on ne la refuse pas, '
      'on en publie une autre.';
  end if;

  -- Un second refus ne réécrit pas la date du premier : c'est ce jour-là que le dirigeant a
  -- tranché.
  if conf.refusee_le is null then
    update public.lady_configuration set refusee_le = now() where id = conf.id;
  end if;

  return conf.id;
end;
$$;

comment on function public.refuser_la_configuration(uuid, uuid) is
  'Le dirigeant écarte une proposition. Elle reste écrite : ce qui a été proposé et refusé fait '
  'partie de l''histoire de sa Lady.';

revoke execute on function public.refuser_la_configuration(uuid, uuid) from public;
