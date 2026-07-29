-- CONF-05 — droit à l'effacement : une procédure qui s'exécute, pas un paragraphe.
--
-- ⚠️ POURQUOI CETTE MIGRATION EXISTE.
--
-- L'article 17 du RGPD donne un droit à l'effacement. Jusqu'ici, Sentio le documentait
-- ([`docs/10-securite-rgpd.md`](../../docs/10-securite-rgpd.md)) sans pouvoir l'exécuter :
-- supprimer une entreprise est **impossible**, la cascade se heurtant au journal en ajout seul.
-- Un droit qu'on ne sait pas exercer le jour où quelqu'un le demande n'est pas un droit.
--
-- Deux exigences se contredisent en apparence, et le RGPD tranche pour les deux à la fois :
--   • effacer les données de la personne (art. 17) ;
--   • conserver la trace de ce qui a été fait, y compris de l'effacement lui-même (art. 5.2,
--     obligation de rendre des comptes) — sans quoi on ne peut plus prouver l'avoir fait.
--
-- La réponse retenue est celle des autorités de contrôle : **anonymiser le journal plutôt que
-- le détruire**. Une ligne de journal perd son contenu et sa clé d'action, elle garde sa date,
-- sa nature et son rattachement. On sait toujours QU'IL S'EST PASSÉ quelque chose ; on ne sait
-- plus QUOI, et plus rien ne concerne une personne.
--
-- Ce que cette migration ne fait pas, volontairement :
--   • elle ne libère PAS l'identité de l'employé. Une identité n'est jamais réutilisée : elle a
--     signé des messages partis chez des tiers, la resservir à un autre client créerait deux
--     personnes portant le même nom (projet.md §9) ;
--   • elle ne supprime PAS l'abonnement ni les compteurs d'usage : les pièces qui fondent une
--     facture relèvent d'une obligation de conservation comptable, qui prime sur l'effacement
--     (art. 17.3.b — obligation légale). Ils ne contiennent aucune donnée personnelle ;
--   • elle ne touche PAS au compte d'authentification (`auth.users`), qui appartient à
--     l'hébergeur d'identité : sa suppression est une seconde opération, à faire dans la foulée.

-- ── Le journal se dépouille, il ne se réécrit jamais ─────────────────────────────────────────
-- Élargir le verrou d'ajout seul est le geste risqué de cette migration. Il est donc élargi le
-- moins possible : la seule mise à jour tolérée est celle qui vide `payload` et `idempotency_key`
-- **sans toucher à rien d'autre**. Une ligne peut perdre son contenu ; elle ne peut pas changer
-- de date, de nature, d'entreprise ni de tâche. Le garde compare les deux versions champ par
-- champ — il ne fait pas confiance à l'appelant.
create or replace function public.reject_journal_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('sentio.retention_purge', true) = 'on' then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and current_setting('sentio.erasure', true) = 'on'
     and new.payload = '{}'::jsonb
     and new.idempotency_key is null
     and (to_jsonb(new) - 'payload' - 'idempotency_key')
       = (to_jsonb(old) - 'payload' - 'idempotency_key') then
    return new;
  end if;

  raise exception
    'execution_event est en ajout seul : % refusé. Seules sont autorisées purge_execution_events() et l''anonymisation par erase_tenant().',
    tg_op;
end;
$$;

-- ── La procédure d'effacement ────────────────────────────────────────────────────────────────
-- Renvoie un compte-rendu ligne par ligne. Ce n'est pas un confort de développement : c'est la
-- preuve à remettre à la personne qui a exercé son droit, et à l'autorité de contrôle si elle
-- demande. Une procédure d'effacement qui ne rend rien ne se vérifie pas.
create function public.erase_tenant(target uuid)
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
  --    La recommandation part avec, par cascade.
  delete from public.diagnostic_session where tenant_id = target;
  get diagnostics n = row_count; relation := 'diagnostic_session'; lignes := n; return next;

  -- 4. Le rattachement des personnes à l'entreprise. Le compte d'authentification lui-même
  --    appartient à l'hébergeur d'identité : à supprimer dans la foulée, hors de cette fonction.
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

-- Réservée au serveur. Aucun rôle client ne doit pouvoir effacer quoi que ce soit — la demande
-- passe par une personne, pas par un bouton (docs/25-conformite-legale.md).
revoke execute on function public.erase_tenant(uuid) from public;

do $$
begin
  raise notice 'OK  effacement — procédure exécutable, journal anonymisé et non détruit.';
end;
$$;
