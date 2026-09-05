-- LADY-H — une configuration s'efface avec l'entreprise, sans cesser d'être immuable.
--
-- ══ LE DÉFAUT INTRODUIT PAR `20260815120003`, ET TROUVÉ EN ÉCRIVANT LADY-G ══
--
-- L'immuabilité de `lady_configuration` refuse TOUTE suppression. Elle refusait donc aussi celle
-- qui vient d'une cascade — c'est-à-dire **la suppression d'une entreprise**. Autrement dit, la
-- garantie qui protège l'histoire d'une Lady empêchait d'exercer le droit à l'effacement.
--
-- Deux choses distinctes étaient confondues sous le même refus :
--
--   · **réécrire l'histoire** — interdit, sans exception. C'est ce que la garantie protège ;
--   · **effacer un client** — obligatoire, et par un chemin explicite.
--
-- La correction reprend le motif déjà établi pour le journal (`20260729120036`) : la suppression
-- n'est tolérée que sous le drapeau de purge, celui que pose le chemin d'effacement. Hors de ce
-- chemin, rien ne change — une configuration ne se supprime toujours pas.
--
-- ══ ET L'EFFACEMENT LES EMPORTE VRAIMENT ══
--
-- `erase_tenant()` ne connaissait pas ces tables : elles n'existaient pas quand il a été écrit.
-- Une configuration porte le rôle décidé pour l'entreprise et **la raison en clair** — « la
-- prospection produit, ce sont les demandes entrantes qui se perdent ». C'est de la donnée
-- client, et elle doit partir avec le reste.
--
-- Réalise : LADY-H

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Le verrou distingue « réécrire » de « effacer »
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.configuration_est_immuable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- Le seul chemin autorisé : celui de l'effacement, qui pose ce drapeau. Une suppression
    -- ordinaire reste refusée — sans quoi « on ne peut plus dire ce qu'il y avait avant ».
    if current_setting('sentio.retention_purge', true) = 'on' then
      return old;
    end if;
    raise exception
      'Une configuration ne se supprime pas : elle est remplacée par une version suivante. '
      'Sans elle, on ne peut plus dire ce qu''il y avait avant.';
  end if;

  if (new.role, new.priorites, new.limites, new.autonomie, new.declencheur, new.raison,
      new.version, new.employee_id, new.precedente_id)
     is distinct from
     (old.role, old.priorites, old.limites, old.autonomie, old.declencheur, old.raison,
      old.version, old.employee_id, old.precedente_id) then
    raise exception
      'Une configuration publiée ne se réécrit pas. Publier une version suivante, avec sa raison.';
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. L'effacement emporte les configurations
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Insérées AVANT `objective` dans l'ordre existant : une configuration référence l'employé, pas
-- l'objectif, mais la placer tôt garde la fonction lisible — d'abord ce que le client a décidé
-- ou reçu, ensuite ce qui l'exécute.

create or replace function public.erase_tenant(target uuid)
returns table (relation text, lignes bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n bigint;
  depouillees bigint;
begin
  if not exists (select 1 from public.tenant where id = target) then
    raise exception 'Effacement demandé pour une entreprise inconnue (%).', target;
  end if;

  -- 1. Ce que le client a écrit ou reçu, et ce que son employé a appris.
  delete from public.notification where tenant_id = target;
  get diagnostics n = row_count; relation := 'notification'; lignes := n; return next;

  delete from public.strategy_change where tenant_id = target;
  get diagnostics n = row_count; relation := 'strategy_change'; lignes := n; return next;

  delete from public.outcome where tenant_id = target;
  get diagnostics n = row_count; relation := 'outcome'; lignes := n; return next;

  delete from public.approval where tenant_id = target;
  get diagnostics n = row_count; relation := 'approval'; lignes := n; return next;

  delete from public.standing_approval where tenant_id = target;
  get diagnostics n = row_count; relation := 'standing_approval'; lignes := n; return next;

  -- Les configurations de Lady : elles portent le rôle décidé pour cette entreprise ET la raison
  -- en clair. Le drapeau de purge lève le verrou d'immuabilité le temps de la suppression, et
  -- seulement ici. `lady_configuration_capability` part en cascade.
  perform set_config('sentio.retention_purge', 'on', true);
  delete from public.lady_configuration where tenant_id = target;
  get diagnostics n = row_count; relation := 'lady_configuration'; lignes := n; return next;
  perform set_config('sentio.retention_purge', 'off', true);

  delete from public.objective where tenant_id = target;
  get diagnostics n = row_count; relation := 'objective'; lignes := n; return next;

  delete from public.company_profile where tenant_id = target;
  get diagnostics n = row_count; relation := 'company_profile'; lignes := n; return next;

  delete from public.learned_fact where tenant_id = target;
  get diagnostics n = row_count; relation := 'learned_fact'; lignes := n; return next;

  delete from public.employee_capability where tenant_id = target;
  get diagnostics n = row_count; relation := 'employee_capability'; lignes := n; return next;

  -- 2. Le travail en attente. Ce qui n'a pas encore eu lieu n'a pas à survivre à l'effacement.
  delete from public.job where tenant_id = target;
  get diagnostics n = row_count; relation := 'job'; lignes := n; return next;

  -- 3. Le diagnostic qui a précédé le recrutement : il porte le profil extrait du visiteur.
  --    La recommandation et les constats d'audit partent avec, par cascade.
  delete from public.diagnostic_session where tenant_id = target;
  get diagnostics n = row_count; relation := 'diagnostic_session'; lignes := n; return next;

  -- 4. Le rattachement des personnes à l'entreprise.
  delete from public.tenant_member where tenant_id = target;
  get diagnostics n = row_count; relation := 'tenant_member'; lignes := n; return next;

  -- 5. Le journal : dépouillé, jamais détruit. C'est ce qui distingue l'effacement d'une
  --    destruction de preuve.
  perform set_config('sentio.erasure', 'on', true);
  update public.execution_event
     set payload = '{}'::jsonb, idempotency_key = null
   where tenant_id = target
     and (payload <> '{}'::jsonb or idempotency_key is not null);
  get diagnostics depouillees = row_count;
  perform set_config('sentio.erasure', 'off', true);
  relation := 'execution_event (dépouillé)'; lignes := depouillees; return next;

  -- 6. L'entreprise elle-même : la ligne survit parce que le journal la référence, mais son nom
  --    est une donnée. Elle devient un identifiant sans porteur.
  update public.tenant
     set name = 'Entreprise effacée le ' || to_char(now(), 'YYYY-MM-DD')
   where id = target;
  get diagnostics n = row_count; relation := 'tenant (anonymisé)'; lignes := n; return next;

  -- 7. La trace de l'effacement, écrite APRÈS le dépouillement pour ne pas être dépouillée avec
  --    lui. Sans elle, impossible de prouver qu'on a fait ce qu'on devait faire (art. 5.2).
  insert into public.execution_event (tenant_id, kind, payload)
  values (target, 'effacement',
          jsonb_build_object('journal_depouille', depouillees, 'demande_le', now()));
  relation := 'execution_event (trace d''effacement)'; lignes := 1; return next;
end;
$$;

revoke execute on function public.erase_tenant(uuid) from public;
