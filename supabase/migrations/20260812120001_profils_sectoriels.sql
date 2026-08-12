-- METIER-24 — publier un profil sectoriel, et le versionner sans jamais réécrire l'existant.
-- Réalise : METIER-24
--
-- La table `sector_profile` existe depuis FOND-38 : globale, sans `tenant_id`, immuable, avec une
-- contrainte d'unicité sur (secteur, version). Ce qui manquait n'était donc pas le stockage —
-- c'était la RÈGLE DE PUBLICATION. Deux manques précis, chacun corrigé ici.
--
-- 1. LA VERSION ÉTAIT ÉCRITE À LA MAIN. `20260729120039_adn_commercial_v1.sql` pose `version, 1`
--    en dur. Publier une v2 demandait de connaître la v1 et de ne pas se tromper. Un numéro de
--    version que quelqu'un calcule de tête est un numéro qui finira par être faux — et il sera
--    faux silencieusement, parce qu'une version qui écrase la précédente ne lève rien.
--
-- 2. RIEN NE VÉRIFIAIT LA FORME DU CONTENU À L'ÉCRITURE. `parseSectorKnowledge`
--    (`packages/core/src/context/assemble.ts`) refuse un profil mal formé — mais à la LECTURE,
--    c'est-à-dire au milieu d'un run, chez un client. Une migration pouvait donc semer un profil
--    que le moteur rejetterait des semaines plus tard, loin de la cause. Le garde descend ici :
--    la base refuse à l'écriture exactement ce que le code refuse à la lecture.
--
-- ⚠️ CE QUE CE MÉCANISME GARANTIT, et qui commande tout le reste : publier une version NE TOUCHE
-- JAMAIS aux versions déjà publiées. Un employé figé sur la v1 continue de lire la v1, quoi qu'on
-- publie ensuite. Même règle que l'ADN (`docs/04-contextes-memoire.md`), pour la même raison :
-- ce qui a été vendu ne change pas dans le dos de celui qui l'a acheté.
--
-- Ce que cette migration ne fait PAS : écrire le contenu d'un secteur. Rédiger le premier profil
-- est METIER-23, et ce choix éditorial appartient à une personne
-- (`docs/22-niche-et-verticalisation.md` : « tu peux y atteindre des clients »). Le mécanisme
-- ci-dessous accepte un secteur qu'il ne connaît pas encore, sans modification de code.

-- ─────────────────────────────────────────────────────────────────────────────
-- La validation, énoncée une seule fois et réutilisée par le déclencheur.
--
-- Elle reproduit `parseSectorKnowledge` volontairement à l'identique, y compris ses tolérances :
-- `sector` ou `secteur`, `cycleAchat` ou `cycle_achat`. Toute divergence entre les deux gardes
-- serait pire que l'absence de l'un des deux — on croirait vérifier ce qu'on ne vérifie pas.
--
-- Tous les champs sauf le secteur sont FACULTATIFS, et c'est délibéré : un profil qui ne connaît
-- encore que le vocabulaire doit pouvoir servir. Ce qui est absent reste absent.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.valider_profil_sectoriel(p_contenu jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_secteur jsonb;
  v_champ   text;
  v_valeur  jsonb;
begin
  if p_contenu is null or jsonb_typeof(p_contenu) <> 'object' then
    raise exception 'Profil sectoriel illisible : un objet est attendu.';
  end if;

  v_secteur := coalesce(p_contenu -> 'sector', p_contenu -> 'secteur');
  if v_secteur is null
     or jsonb_typeof(v_secteur) <> 'string'
     or btrim(v_secteur #>> '{}') = '' then
    raise exception
      'Profil sectoriel invalide : le secteur est obligatoire — sans lui, on ne sait pas à qui ce savoir s''applique.';
  end if;

  foreach v_champ in array array['vocabulaire', 'interlocuteurs', 'objections', 'angles'] loop
    v_valeur := p_contenu -> v_champ;
    if v_valeur is not null and jsonb_typeof(v_valeur) <> 'null' then
      if jsonb_typeof(v_valeur) <> 'array'
         or exists (
           select 1
             from jsonb_array_elements(v_valeur) as element
            where jsonb_typeof(element) <> 'string'
         ) then
        raise exception 'Profil sectoriel invalide : « % » doit être une liste de textes.', v_champ;
      end if;
    end if;
  end loop;

  v_valeur := coalesce(p_contenu -> 'cycleAchat', p_contenu -> 'cycle_achat');
  if v_valeur is not null
     and jsonb_typeof(v_valeur) <> 'null'
     and jsonb_typeof(v_valeur) <> 'string' then
    raise exception 'Profil sectoriel invalide : « cycleAchat » doit être un texte.';
  end if;
end;
$$;

comment on function public.valider_profil_sectoriel(jsonb) is
  'Refuse à l''écriture exactement ce que parseSectorKnowledge refuse à la lecture (METIER-24).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Le déclencheur d'écriture.
--
-- Il ajoute une vérification que le code TypeScript ne PEUT PAS faire, parce qu'elle porte sur
-- deux endroits à la fois : le secteur de la colonne et celui du contenu doivent désigner le même
-- métier. Sans elle, la table peut dire « plomberie » là où le contenu dit « boulangerie ». La
-- couche de contexte lit le CONTENU : elle parlerait donc du mauvais métier, et la requête qui a
-- sélectionné la ligne, elle, aurait filtré sur la colonne. Personne ne verrait la divergence
-- avant qu'un employé s'adresse au mauvais interlocuteur.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.valider_profil_sectoriel_avant_ecriture()
returns trigger
language plpgsql
as $$
declare
  v_secteur_du_contenu text;
begin
  perform public.valider_profil_sectoriel(new.content);

  if new.sector is null or btrim(new.sector) = '' then
    raise exception 'Profil sectoriel invalide : la colonne « sector » ne peut pas être vide.';
  end if;

  v_secteur_du_contenu := coalesce(new.content ->> 'sector', new.content ->> 'secteur');

  if lower(btrim(v_secteur_du_contenu)) <> lower(btrim(new.sector)) then
    raise exception
      'Profil sectoriel incohérent : la colonne annonce « % », le contenu annonce « % ». Les deux désignent le même métier, ou la ligne est refusée.',
      new.sector, v_secteur_du_contenu;
  end if;

  return new;
end;
$$;

create trigger sector_profile_valide
  before insert on public.sector_profile
  for each row execute function public.valider_profil_sectoriel_avant_ecriture();

-- ─────────────────────────────────────────────────────────────────────────────
-- La publication.
--
-- Un seul appel, la version calculée par la base. C'est ce qui rend une v2 sans danger : elle
-- s'ajoute, elle ne remplace pas, et personne n'a à se souvenir du numéro précédent.
--
-- Sur la concurrence, et pourquoi ce n'est pas un défaut caché : deux publications simultanées du
-- même secteur calculeraient la même version, et la contrainte `unique (sector, version)` en
-- ferait échouer une. C'est le comportement voulu — publier est un geste de migration, joué en
-- série, et un échec bruyant vaut mieux qu'une version écrasée en silence. Le verrou n'est pas
-- pris ici parce qu'il donnerait l'illusion de couvrir un cas d'usage qui n'existe pas.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.publier_profil_sectoriel(p_secteur text, p_contenu jsonb)
returns integer
language plpgsql
as $$
declare
  v_version integer;
begin
  if p_secteur is null or btrim(p_secteur) = '' then
    raise exception 'Publication refusée : le secteur est obligatoire.';
  end if;

  insert into public.sector_profile (sector, version, content)
  select btrim(p_secteur),
         coalesce(max(version), 0) + 1,
         p_contenu
    from public.sector_profile
   where sector = btrim(p_secteur)
  returning version into v_version;

  return v_version;
end;
$$;

comment on function public.publier_profil_sectoriel(text, jsonb) is
  'Publie une nouvelle version d''un profil sectoriel. N''écrase jamais une version existante (METIER-24).';

-- ─────────────────────────────────────────────────────────────────────────────
-- La lecture de la version courante.
--
-- Sans cette vue, tout appelant voulant « le profil du secteur » devrait trier par version et
-- prendre la première ligne — c'est-à-dire réimplémenter la règle, chacun à sa façon, et se
-- tromper une fois. La règle est écrite ici, une seule fois.
--
-- ⚠️ `security_invoker` : sans lui, une vue s'exécute avec les droits de son propriétaire et
-- contourne la politique de la table sous-jacente. Ici la table est publique en lecture, donc
-- l'effet serait nul aujourd'hui — mais une vue qui ne porte pas ce réglage est une vue qui
-- deviendra fausse le jour où la table sous-jacente se restreindra.
--
-- Elle ne remplace pas `sector_profile` : un employé figé sur une version ancienne la lit
-- directement par son identifiant, et doit continuer de le faire.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.sector_profile_courant
  with (security_invoker = true)
as
select distinct on (sector)
       id,
       sector,
       version,
       content,
       published_at
  from public.sector_profile
 order by sector, version desc;

comment on view public.sector_profile_courant is
  'La dernière version publiée de chaque profil sectoriel — la règle « le plus récent » écrite une seule fois (METIER-24).';
