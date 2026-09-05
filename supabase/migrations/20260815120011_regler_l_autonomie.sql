-- LADY-L — le client règle l'autonomie de sa Lady, et ce réglage laisse une trace.
--
-- ══ POURQUOI CE N'EST PAS UN `UPDATE` ══
--
-- Depuis `20260815120006`, `employee.autonomy` est une **projection** de la configuration active.
-- Laisser le client écrire cette colonne rétablirait exactement ce que l'étape 4 a supprimé : un
-- réglage modifié en place, sans raison, sans date, sans version précédente. Le lendemain,
-- personne ne peut plus dire *qui* a donné à Lady le droit d'agir seule, ni quand.
--
-- Or c'est le réglage le plus lourd de conséquences du produit : il décide si un message part
-- sans qu'une personne l'ait relu.
--
-- Le client ne modifie donc rien : **il publie une version suivante**. Même chemin que n'importe
-- quelle évolution de Lady, avec un déclencheur qui dit d'où elle vient — `demande_client`.
--
-- ⚠️ Le reste de la configuration est **recopié à l'identique**. Régler l'autonomie ne doit pas
-- pouvoir changer le rôle par la bande : c'est un réglage, pas une reconfiguration.
--
-- Réalise : DASH-16

create function public.regler_l_autonomie(
  p_tenant   uuid,
  p_employee uuid,
  p_niveau   text,
  p_raison   text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active   public.lady_configuration;
  suivante uuid;
begin
  if p_niveau not in ('confirm', 'confirm_once', 'auto') then
    raise exception 'Niveau d''autonomie inconnu : « % ». La liste est close.', p_niveau;
  end if;

  select * into active
    from public.lady_configuration c
   where c.tenant_id = p_tenant and c.employee_id = p_employee and c.active;

  if not found then
    raise exception
      'Cet employé n''a aucune configuration active : il n''y a rien à régler, et rien à copier.';
  end if;

  if active.autonomie = p_niveau then
    -- Republier à l'identique polluerait l'histoire d'une version qui ne dit rien. On rend
    -- l'existante : le client a demandé ce qui est déjà en place.
    return active.id;
  end if;

  -- Tout est recopié SAUF l'autonomie. Un réglage ne reconfigure pas Lady.
  insert into public.lady_configuration
    (tenant_id, employee_id, version, role, priorites, limites, autonomie,
     declencheur, raison, diagnostic_session_id, precedente_id, active)
  values (p_tenant, p_employee, active.version + 1,
          active.role, active.priorites, active.limites, p_niveau,
          'demande_client',
          coalesce(nullif(trim(p_raison), ''),
                   'Le client a réglé le niveau d''autonomie sur « ' || p_niveau || ' ».'),
          active.diagnostic_session_id, active.id, false)
  returning id into suivante;

  -- Les capacités suivent à l'identique : ce sont les mêmes pouvoirs, exercés plus ou moins
  -- librement. En perdre au passage retirerait du travail à Lady sans que personne l'ait demandé.
  insert into public.lady_configuration_capability (configuration_id, capability_id)
  select suivante, lcc.capability_id
    from public.lady_configuration_capability lcc
   where lcc.configuration_id = active.id;

  perform public.appliquer_la_configuration(suivante);

  return suivante;
end;
$$;

comment on function public.regler_l_autonomie(uuid, uuid, text, text) is
  'Le client ne modifie pas un réglage : il publie une version de configuration. C''est le seul '
  'moyen de pouvoir dire, plus tard, qui a autorisé Lady à agir seule — et quand.';

-- Réservée au serveur : la portée d'entreprise est vérifiée par l'appelant, qui connaît la
-- session. Une fonction `security definer` appelée directement par un client contournerait RLS.
revoke execute on function public.regler_l_autonomie(uuid, uuid, text, text) from public;
