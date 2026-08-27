-- Le rattachement de l'acheteur, quand deux personnes arrivent en même temps.
--
-- ══ CE QUI MANQUAIT, ET CE QUE ÇA COÛTAIT ══
--
-- `rattacher_par_email` (20260815120013) choisissait l'attente la plus ancienne par un `select
-- … limit 1`, puis la marquait consommée par un `update`. Entre les deux, rien ne la tenait.
--
-- Deux connexions simultanées portant la MÊME adresse lisaient donc la même ligne, et
-- rattachaient toutes les deux le compte à la même entreprise. L'insertion est idempotente
-- (`on conflict do nothing`), donc aucune donnée n'était mélangée et aucun étranger n'a jamais
-- rien pu voir : ce n'est pas une fuite. Mais la SECONDE attente restait ouverte, et l'entreprise
-- qu'elle désignait n'était rattachée à personne. Un dirigeant qui a payé deux fois, ou qui a
-- reçu deux invitations, se retrouvait avec une entreprise inaccessible et aucun message pour le
-- lui dire.
--
-- ⚠️ POURQUOI `skip locked` ET NON `for update` SEUL.
--
-- Avec un verrou simple, la seconde connexion ATTENDRAIT la première, puis relirait la même
-- ligne, la verrait consommée, et repartirait les mains vides. Avec `skip locked`, elle passe à
-- l'attente suivante : chacune prend la sienne. C'est exactement le motif de `reserve_identity`
-- (20260729120008), et pour la même raison — deux arrivées simultanées ne doivent pas se
-- disputer la même ligne.
--
-- ══ CE QUI N'EST PAS EN CAUSE, ET QU'IL FAUT SAVOIR AVANT DE « CORRIGER » PLUS LOIN ══
--
-- Le rapprochement se fait sur une adresse PROUVÉE par le fournisseur d'identité. Deux clients
-- distincts ont deux adresses distinctes, donc deux attentes distinctes : il n'existe aucun
-- chemin par lequel l'un recevrait l'entreprise de l'autre. Ce que cette migration corrige est
-- une course entre DEUX ARRIVÉES DE LA MÊME PERSONNE, jamais entre deux personnes.

create or replace function public.rattacher_par_email(p_user uuid, p_email text)
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
   limit 1
   for update skip locked;

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

-- ⚠️ RECRÉER UNE FONCTION LA FAIT NAÎTRE OUVERTE (piège 8 de `docs/31`). Le `revoke` n'est pas
-- une précaution de style : sans lui, `rattacher_par_email` deviendrait appelable par n'importe
-- quelle session, et rattacher un compte à une entreprise cesserait d'être un geste du serveur.
revoke execute on function public.rattacher_par_email(uuid, text) from public, authenticated, anon;

comment on function public.rattacher_par_email(uuid, text) is
  'Rapproche un compte fraîchement connecté de l''entreprise qu''il a payée. L''adresse est '
  'prouvée par le fournisseur d''identité. Verrouille l''attente qu''elle consomme : deux '
  'arrivées simultanées de la même personne prennent chacune la leur, au lieu de se disputer '
  'la même et d''en laisser une orpheline.';
