-- LADY-AG — après assez de silence, elle s'arrête d'elle-même.
--
-- ══ CE QUI A INSPIRÉ CE GARDE-FOU ══
--
-- Le reproche le plus documenté fait aux produits concurrents, mot pour mot dans les avis
-- publics : **« ~1 400 emails envoyés. 0 réponse reçue. »** Le produit avait continué d'envoyer,
-- jour après jour, sans que rien ne s'interpose. Le client a payé pour ça, et il a payé deux
-- fois : en abonnement, et en réputation de domaine brûlée.
--
-- Ce n'est pas un défaut d'algorithme. C'est un défaut de POSTURE : ces produits sont construits
-- pour maximiser le volume, donc le silence total ne leur apparaît jamais comme une raison de
-- s'arrêter. Il apparaît comme un volume à augmenter.
--
-- ══ CE QUE FAIT SENTIO À LA PLACE ══
--
-- Passé un seuil d'envois **sans une seule réponse**, la garde d'envoi refuse. L'employée
-- s'arrête toute seule, et le dirigeant est prévenu qu'il y a quelque chose à revoir.
--
-- ⚠️ **C'est cohérent avec le cliquet d'autonomie (`20260815120021`), et pas une exception.** La
-- règle du produit est : n'importe quoi peut rendre l'employée PLUS PRUDENTE ; seul le dirigeant
-- peut la rendre plus libre. Un arrêt automatique va dans le sens autorisé. Le dirigeant reprend
-- la main quand il veut — en changeant quelque chose, ou en disant de continuer.
--
-- ⚠️ **Le seuil compte des envois, pas des jours.** « Deux semaines sans réponse » ne veut rien
-- dire si trois messages sont partis. Et il ne s'applique qu'au-dessus du seuil où un taux de
-- réponse commence à signifier quelque chose — c'est le même raisonnement, et le même chiffre,
-- que `ENVOIS_MINIMAUX_POUR_UN_TAUX` côté domaine.
--
-- Réalise : LADY-AG

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Le seuil, en données
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- En base et non en dur : le jour où l'on constate qu'il est trop bas ou trop haut, on le change
-- sans redéploiement — et on peut le desserrer pour une entreprise dont le cycle est long.

create table public.garde_du_silence (
  tenant_id        uuid primary key references public.tenant (id) on delete cascade,
  envois_tolere    integer not null default 40 check (envois_tolere between 10 and 500),
  -- Le dirigeant a été prévenu et a dit de continuer : on ne le prévient pas deux fois pour la
  -- même série. Sans ça, la garde devient un harcèlement et il finit par ne plus la lire.
  passe_outre_le   timestamptz,
  motif_du_passage text
);

alter table public.garde_du_silence enable row level security;

create policy garde_du_silence_select on public.garde_du_silence
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

grant select on public.garde_du_silence to authenticated;

create trigger garde_du_silence_tenant_locked
  before update on public.garde_du_silence
  for each row execute function public.reject_tenant_change();

comment on table public.garde_du_silence is
  'Après combien d''envois SANS UNE SEULE RÉPONSE l''employée s''arrête d''elle-même. Le reproche '
  'le plus documenté fait aux concurrents est « 1 400 emails, 0 réponse » : ils comptent le '
  'silence comme un volume à augmenter.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Le silence se mesure
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ On compte les envois depuis la DERNIÈRE réponse, pas depuis toujours. Une entreprise qui a
-- reçu une réponse hier n'est pas dans le silence, même si elle a envoyé mille messages avant.

create function public.envois_depuis_la_derniere_reponse(p_tenant uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.outbound_message m
   where m.tenant_id = p_tenant
     and m.sent_at > coalesce(
           (select max(o.recorded_at) from public.outcome o
             where o.tenant_id = p_tenant and o.kind in ('response', 'meeting', 'sale')),
           '-infinity'::timestamptz);
$$;

revoke execute on function public.envois_depuis_la_derniere_reponse(uuid) from public, authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. La garde d'envoi s'arrête sur le silence
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ══ L'ORDRE, ET IL A ÉTÉ CORRIGÉ APRÈS COUP ══
--
-- Premier réflexe : mettre la garde du silence tout en haut, juste après l'arrêt du dirigeant.
-- Un contrôle existant l'a immédiatement contredit — un domaine d'expédition suspendu pour
-- rebonds se mettait à rendre « silence_total ».
--
-- Et il avait raison. **Un domaine suspendu EXPLIQUE le silence** : si les messages rebondissent,
-- personne ne répond, forcément. Annoncer « personne ne vous répond » enverrait le dirigeant
-- réécrire son message alors que le problème est technique et qu'il a une solution technique.
--
-- La règle est donc : le silence n'est signalé **que lorsque rien d'autre ne bloque**. C'est la
-- seule situation où il est la vraie cause. Si un plafond du jour bloque aujourd'hui, la garde
-- s'exprimera demain — le silence, lui, ne s'en va pas tout seul.
--
create or replace function public.peut_envoyer(
  p_tenant uuid,
  p_lead uuid,
  p_domain uuid,
  p_envoyes_aujourdhui integer,
  p_plafond_formule integer
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  garde   public.garde_du_silence;
  verdict text;
begin
  if exists (
    select 1 from public.employee e
     where e.tenant_id = p_tenant and e.en_pause_depuis is not null
  ) then
    return 'employe_arrete';
  end if;

  -- Tout ce qui bloque pour une raison technique bloque en premier, et le dit avec SES mots.
  verdict := public.peut_envoyer_hors_arret(
    p_tenant, p_lead, p_domain, p_envoyes_aujourdhui, p_plafond_formule);
  if verdict <> 'ok' then
    return verdict;
  end if;

  select * into garde from public.garde_du_silence where tenant_id = p_tenant;

  -- Pas de ligne : le réglage par défaut s'applique. Une entreprise n'a pas à être inscrite
  -- quelque part pour être protégée.
  if garde.passe_outre_le is null
     and public.envois_depuis_la_derniere_reponse(p_tenant)
         >= coalesce(garde.envois_tolere, 40) then
    return 'silence_total';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.peut_envoyer(uuid, uuid, uuid, integer, integer) from public, authenticated, anon;

comment on function public.peut_envoyer(uuid, uuid, uuid, integer, integer) is
  'La garde d''envoi, arrêt du dirigeant et garde du silence compris. Un employé qui parle dans '
  'le vide depuis quarante messages rend « silence_total » — mais seulement si rien d''autre ne '
  'bloque : un domaine suspendu EXPLIQUE le silence, et l''annoncer enverrait le dirigeant '
  'réécrire son message alors que le problème est technique.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Le dirigeant décide de la suite
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.continuer_malgre_le_silence(p_tenant uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.garde_du_silence (tenant_id, passe_outre_le, motif_du_passage)
  values (p_tenant, now(), nullif(trim(coalesce(p_motif, '')), ''))
  on conflict (tenant_id) do update
    set passe_outre_le = now(), motif_du_passage = excluded.motif_du_passage;
end;
$$;

comment on function public.continuer_malgre_le_silence(uuid, text) is
  'Le dirigeant a vu l''alerte et demande de continuer. On ne le prévient pas deux fois pour la '
  'même série : une garde qui se répète devient un harcèlement, et il finit par ne plus la lire.';

revoke execute on function public.continuer_malgre_le_silence(uuid, text) from public, authenticated, anon;

-- Une réponse remet le compteur à zéro par construction (on compte depuis la dernière réponse) ;
-- le passe-droit, lui, doit être levé, sinon il vaudrait pour toujours.
-- ⚠️ `security definer` : c'est le CLIENT qui déclare ses réponses, et il n'a aucun droit
-- d'écriture sur la garde — à raison, sinon il pourrait se donner un passe-droit sans le voir.
-- Sans cette élévation, déclarer une réponse échouait avec « permission denied », c'est-à-dire
-- que le geste le plus positif du produit devenait impossible.
create function public.une_reponse_leve_le_passe_droit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind in ('response', 'meeting', 'sale') then
    update public.garde_du_silence
       set passe_outre_le = null, motif_du_passage = null
     where tenant_id = new.tenant_id and passe_outre_le is not null;
  end if;
  return new;
end;
$$;

create trigger outcome_leve_le_passe_droit
  after insert on public.outcome
  for each row execute function public.une_reponse_leve_le_passe_droit();
