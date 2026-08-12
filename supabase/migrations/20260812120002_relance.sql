-- METIER-12 — la garde de relance : trois conditions que l'envoi initial n'a pas à connaître.
-- Réalise : METIER-12
--
-- Le contrat de la capacité `relancer_un_prospect` existe depuis `20260729120039` — c'est le
-- MOTEUR qui manquait, et d'abord sa garde.
--
-- Pourquoi une fonction séparée plutôt que trois conditions ajoutées à `peut_envoyer` : les deux
-- capacités n'ont pas le même contrat. `envoyer_un_message` s'adresse à quelqu'un qui n'a jamais
-- rien reçu ; `relancer_un_prospect` s'adresse à quelqu'un qui a déjà été contacté et n'a pas
-- répondu. Charger `peut_envoyer` des conditions de relance obligerait chaque appelant à dire
-- lequel des deux cas il traite — et ce drapeau finirait par être faux.
--
-- Ce qui n'est PAS recopié ici : les sept conditions d'envoi. `peut_relancer` commence par
-- appeler `peut_envoyer` et rend son refus tel quel. Un domaine suspendu, un plafond atteint, une
-- désinscription : la relance s'arrête pour les mêmes raisons que l'envoi, sans qu'on ait à s'en
-- souvenir à deux endroits.

-- ⚠️ LA CADENCE EST UN CHOIX, ET IL N'EST DOCUMENTÉ NULLE PART AILLEURS.
--
-- L'ADN dit « relancer une fois, puis une seconde, en espaçant » (migration 0039) : le nombre est
-- donc fixé à deux par le métier lui-même. Les DÉLAIS, en revanche, ne le sont pas — aucun
-- document du dépôt ne les donne. Les valeurs ci-dessous sont un choix par défaut, retenues
-- croissantes parce que « en espaçant » l'exige, et posées ici plutôt qu'en dur dans le moteur
-- pour qu'un ajustement soit une migration de trois lignes, jamais un redéploiement de code.
--
-- À revoir avec des chiffres réels dès qu'il y aura des réponses à compter.
create or replace function public.cadence_de_relance(p_rang integer)
returns integer
language sql
immutable
as $$
  -- Délai minimal, en jours, avant la relance de rang p_rang, compté depuis le dernier message.
  select case p_rang
    when 1 then 4   -- première relance : assez tard pour ne pas talonner, assez tôt pour exister
    when 2 then 7   -- seconde : l'espacement double presque, c'est le sens de « en espaçant »
    else null       -- au-delà, il n'y a pas de délai : il n'y a pas de relance
  end;
$$;

comment on function public.cadence_de_relance(integer) is
  'Délai minimal en jours avant une relance de rang donné. NULL au-delà du rang 2 (METIER-12).';

-- ─────────────────────────────────────────────────────────────────────────────
-- La garde de relance.
--
-- Elle rend « ok » ou le MOTIF du refus, jamais un booléen : un refus muet sur sa raison oblige
-- l'appelant à deviner, et il devinera mal. Même convention que `peut_envoyer`.
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- 1. Tout ce qui interdit un envoi interdit une relance. Sans exception, et sans recopie.
  verdict_envoi := public.peut_envoyer(
    p_tenant, p_lead, p_domaine, p_envoyes_aujourdhui, p_plafond_formule);
  if verdict_envoi <> 'ok' then
    return verdict_envoi;
  end if;

  -- 2. Un prospect qui a répondu n'est plus un prospect qu'on relance. C'est la condition dont
  --    l'absence coûterait le plus cher : relancer quelqu'un qui vient de répondre est le geste
  --    qui fait passer le client pour un automate, et c'est exactement ce que l'ADN interdit.
  select status into statut_prospect
    from public.lead where id = p_lead and tenant_id = p_tenant;
  if statut_prospect = 'repondu' then
    return 'prospect_a_deja_repondu';
  end if;

  -- Une réponse peut aussi être constatée sur le message plutôt que sur la fiche — les deux
  -- chemins existent (`outbound_message.status`), et il suffit d'un pour arrêter la relance.
  if exists (
    select 1 from public.outbound_message
     where tenant_id = p_tenant and lead_id = p_lead and status = 'repondu'
  ) then
    return 'prospect_a_deja_repondu';
  end if;

  -- 3. Le rang se DÉDUIT des messages déjà partis : le stocker serait un second état à tenir
  --    d'accord avec le premier, et il divergerait.
  select count(*), max(sent_at) into deja_envoyes, dernier_envoi
    from public.outbound_message
   where tenant_id = p_tenant and lead_id = p_lead;

  if deja_envoyes = 0 then
    -- Relancer quelqu'un qu'on n'a jamais contacté n'est pas une relance : c'est un premier
    -- message qui contourne les obligations dues au premier message (origine de la donnée).
    return 'aucun_message_a_relancer';
  end if;

  rang := deja_envoyes;  -- 1 message parti → la prochaine est la relance de rang 1.

  delai_minimal := public.cadence_de_relance(rang);
  if delai_minimal is null then
    return 'relances_epuisees';
  end if;

  -- 4. L'espacement, compté depuis le DERNIER message et non depuis le premier.
  if dernier_envoi > now() - make_interval(days => delai_minimal) then
    return 'trop_tot_pour_relancer';
  end if;

  return 'ok';
end;
$$;

comment on function public.peut_relancer(uuid, uuid, uuid, integer, integer) is
  'Garde de relance : les sept conditions d''envoi, plus réponse reçue, rang épuisé et espacement (METIER-12).';

-- Même fermeture que `peut_envoyer` : cette fonction n'est pas offerte au rôle public. Elle est
-- appelée par le runtime, qui travaille sous un rôle de service.
revoke execute on function public.peut_relancer(uuid, uuid, uuid, integer, integer) from public;

do $$
begin
  raise notice 'OK  relance — garde en place : réponse reçue, rang épuisé, espacement.';
end;
$$;
