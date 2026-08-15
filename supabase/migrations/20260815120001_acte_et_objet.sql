-- LADY-A — une capacité cesse d'être un métier : elle devient un ACTE appliqué à un OBJET.
--
-- ⚠️ AUCUN COMPORTEMENT NE CHANGE ICI. Les cinq capacités existantes gardent leur contrat, leur
-- classe d'effet et leur moteur. Ce qui change est leur IDENTITÉ : elles cessent d'être cinq
-- choses distinctes pour devenir cinq actes appliqués au même objet.
--
-- ══ POURQUOI ══
--
-- `relancer_un_prospect` enferme l'objet dans le nom de l'acte. Tant que c'est le cas, relancer
-- un candidat sans réponse ou une facture impayée exige d'écrire une capacité de plus — et le
-- coût de la bibliothèque croît avec le nombre de métiers. C'est exactement le retour aux agents
-- spécialisés que `docs/adr/0029` interdit.
--
-- Séparés, un acte écrit et testé une seule fois sert plusieurs métiers :
--
--     relancer  ×  { prospect, candidat, facture }
--     qualifier ×  { prospect, candidature }
--
-- La couverture devient un PRODUIT de deux axes, plus une énumération. Détail :
-- `docs/28-bibliotheque-et-creation-de-lady.md` §2.
--
-- ══ CE QUE LA BASE GARANTIT DÉSORMAIS ══
--
--   · `key` n'est plus saisie : elle est ENGENDRÉE depuis l'acte et l'objet. Elle ne peut donc
--     plus les contredire — le cas classique où l'on renomme l'un en oubliant l'autre.
--   · ni l'acte ni l'objet ne contiennent le séparateur : sans ça, `relancer.prospect.urgent`
--     et `relancer.prospect` + objet `urgent` produiraient la même clé.
--   · (acte, objet) est unique : la même chose ne peut pas être déclarée deux fois sous deux
--     contrats différents.
--
-- ══ CE QUI N'EST PAS TOUCHÉ ══
--
-- L'ADN v1 du Commercial (`20260729120039`) ne cite aucune clé de capacité — il est en prose.
-- Le renommage ne l'atteint donc pas, et aucune version v2 n'a à être publiée pour lui.
-- `capability_binding` et `employee_capability` désignent la capacité par son identifiant, pas
-- par sa clé : leurs liaisons survivent intactes.
--
-- Réalise : LADY-A

-- ── 1. Les deux axes ────────────────────────────────────────────────────────────────────────

alter table public.capability
  add column acte  text,
  add column objet text;

comment on column public.capability.acte is
  'Le verbe, sans métier ni objet dans son nom : relancer, qualifier, rediger. '
  'Écrit une fois, il sert tous les objets auxquels on l''applique.';
comment on column public.capability.objet is
  'L''entité sur laquelle l''acte porte : prospect, candidat, facture. '
  'C''est ici que vit la spécificité métier — jamais dans l''acte.';

-- ── 2. Les cinq capacités existantes, relues comme cinq actes sur un seul objet ──────────────
--
-- Le « métier commercial » se révèle être exactement ceci : cinq actes appliqués au prospect.
-- Aucun d'eux n'est commercial en lui-même — c'est leur composition qui l'est.

update public.capability set acte = 'rechercher',    objet = 'prospect' where key = 'trouver_des_prospects';
update public.capability set acte = 'qualifier',     objet = 'prospect' where key = 'qualifier_un_prospect';
update public.capability set acte = 'envoyer',       objet = 'prospect' where key = 'envoyer_un_message';
update public.capability set acte = 'relancer',      objet = 'prospect' where key = 'relancer_un_prospect';
update public.capability set acte = 'mettre_a_jour', objet = 'prospect' where key = 'mettre_a_jour_une_fiche';

-- Une capacité laissée sans acte serait une capacité qu'on ne sait plus nommer. Mieux vaut
-- arrêter la migration que la laisser passer et découvrir le trou à l'exécution.
do $$
declare
  orpheline text;
begin
  select string_agg(key, ', ' order by key) into orpheline
  from public.capability
  where acte is null or objet is null;

  if orpheline is not null then
    raise exception
      'capacités sans acte ni objet : %. Les traduire ici avant de poursuivre.', orpheline;
  end if;
end;
$$;

alter table public.capability
  alter column acte  set not null,
  alter column objet set not null;

-- ── 3. La clé devient dérivée ───────────────────────────────────────────────────────────────
--
-- Elle reste l'adresse d'une capacité — moteurs, accords permanents, journal — mais elle n'est
-- plus une donnée saisissable. Postgres ne sait pas convertir une colonne existante en colonne
-- engendrée : on la retire et on la repose. Rien n'y fait référence par clé étrangère.

alter table public.capability drop column key;

alter table public.capability
  add column key text generated always as (acte || '.' || objet) stored;

alter table public.capability
  add constraint capability_cle_unique unique (key),
  add constraint capability_acte_objet_unique unique (acte, objet),
  -- Le séparateur n'appartient qu'à la clé engendrée. Toléré dans un axe, il rendrait deux
  -- capacités différentes indiscernables une fois assemblées.
  add constraint capability_axes_sans_separateur
    check (acte not like '%.%' and objet not like '%.%'),
  add constraint capability_axes_non_vides
    check (length(trim(acte)) > 0 and length(trim(objet)) > 0);

comment on column public.capability.key is
  'Adresse de la capacité, ENGENDRÉE depuis acte et objet — jamais saisie, donc jamais en '
  'contradiction avec eux.';
