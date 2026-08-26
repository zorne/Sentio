-- LADY-AF — le droit à l'effacement fonctionne enfin de bout en bout.
--
-- Le parcours client complet, joué en entier, s'arrêtait à la dernière étape :
--
--     « Un constat d'audit ne se supprime pas. »
--
-- `erase_tenant()` posait le drapeau de purge autour des seules configurations — par souci de
-- moindre privilège. Ça paraissait prudent, et c'était faux : la suppression du diagnostic,
-- quarante lignes plus bas, entraîne les constats d'audit en cascade, et leur verrou refusait,
-- hors fenêtre. Un client demandant l'effacement de ses données recevait une erreur parlant
-- d'audit, et **rien ne permettait de le satisfaire**.
--
-- ⚠️ La bonne fenêtre n'est pas « le moins de lignes possible », c'est **la fonction entière** :
-- elle EST le chemin autorisé, elle est réservée au serveur, elle refuse une entreprise inconnue,
-- et le drapeau est local à la transaction. Une fenêtre trop étroite ne protège de rien — elle
-- déplace seulement l'endroit où l'on se cassera le nez.
--
-- Réalise : LADY-AF

CREATE OR REPLACE FUNCTION public.erase_tenant(target uuid)
 RETURNS TABLE(relation text, lignes bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n bigint;
  depouillees bigint;
begin
  if not exists (select 1 from public.tenant where id = target) then
    raise exception 'Effacement demandé pour une entreprise inconnue (%).', target;
  end if;

  -- ⚠️ LE DRAPEAU COUVRE TOUTE LA FONCTION, ET PLUS SEULEMENT DEUX LIGNES.
  --
  -- Il était posé juste autour des configurations, par souci de moindre privilège. Ça paraissait
  -- prudent, et c'était faux : la suppression du diagnostic, quarante lignes plus bas, entraîne
  -- les constats d'audit en cascade — et leur verrou d'immuabilité refusait, hors fenêtre. Le
  -- droit à l'effacement échouait donc, sur un vrai client, avec un message parlant d'audit.
  --
  -- La fenêtre juste n'est pas « le moins de lignes possible » : c'est **cette fonction**. Elle
  -- EST le chemin autorisé, elle est réservée au serveur, et elle refuse déjà une entreprise
  -- inconnue. Le drapeau retombe à la fin, et il est de toute façon local à la transaction.
  perform set_config('sentio.retention_purge', 'on', true);

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
  delete from public.lady_configuration where tenant_id = target;
  get diagnostics n = row_count; relation := 'lady_configuration'; lignes := n; return next;

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

  -- ⚠️ ET ON LE RETIRE. Le drapeau est local à la transaction, pas à la fonction : le laisser
  -- levé rendrait supprimable, pour tout le reste de la transaction appelante, ce qui ne doit
  -- jamais l'être. Constaté immédiatement — une suite de contrôles a vu son « refus attendu »
  -- se transformer en suppression acceptée, deux blocs plus loin.
  perform set_config('sentio.retention_purge', 'off', true);
end;
$function$;
