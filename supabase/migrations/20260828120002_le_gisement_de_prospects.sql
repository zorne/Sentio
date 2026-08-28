-- Une entreprise trouvée deux fois ne devient pas deux prospects.
--
-- ══ POURQUOI CETTE COLONNE EXISTE ══
--
-- `lead` était dédoublonnée par `unique (tenant_id, email)`. Cette clé suppose que tout prospect
-- a une adresse — ce qui était vrai tant que la seule source imaginée était un fichier client.
--
-- ⚠️ L'ANNUAIRE PUBLIC DE L'ÉTAT NE DONNE AUCUNE ADRESSE EMAIL. Vérifié sur l'API réelle : aucun
-- champ de contact, nulle part. C'est structurel. Or Postgres autorise autant de `null` qu'on veut
-- dans une contrainte d'unicité : sans autre clé, **chaque recherche réinscrirait les mêmes
-- entreprises**, et le dirigeant verrait sa liste gonfler de doublons à chaque battement.
--
-- `external_ref` porte le SIRET de l'établissement retenu. Le SIREN ne suffirait pas : deux
-- agences d'un même groupe sont deux prospects distincts pour un commercial.
--
-- ⚠️ UNIQUE PAR ENTREPRISE CLIENTE, JAMAIS GLOBALEMENT. Deux clients de Sentio ont parfaitement le
-- droit de prospecter la même société ; une unicité globale ferait fuiter l'un dans l'autre — le
-- second se verrait refuser un prospect sans comprendre pourquoi, ce qui révèle l'existence du
-- premier.
--
-- Réalise : constat P0-1 de `docs/35-audit-avant-production.md`

alter table public.lead
  add column external_ref text;

create unique index lead_reference_externe_unique
  on public.lead (tenant_id, external_ref)
  where external_ref is not null;

comment on column public.lead.external_ref is
  'L''identifiant de ce prospect chez sa source (le SIRET pour l''annuaire de l''État). Sert à ne '
  'pas réinscrire la même entreprise à chaque recherche, là où « email » ne le peut pas : une '
  'source publique ne donne pas d''adresse, et Postgres autorise autant de null qu''on veut dans '
  'une clé d''unicité.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- La capacité de recherche s'exécute désormais vraiment.
--
-- ⚠️ Cette ligne DOIT rester synchrone avec les moteurs montés dans
-- `packages/runtime/src/composition.ts`. Un test d'intégration compare les deux et fait échouer
-- `pnpm run verify` en cas d'écart — c'est ce qui empêche `disponible` de devenir, à son tour, un
-- commentaire qui ment (constat P0-3).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

update public.capability set disponible = true where key = 'rechercher.prospect';

do $$
declare
  n integer;
begin
  select count(*) into n from public.capability where disponible;
  if n <> 3 then
    raise exception
      'Trois capacités doivent être exécutables (rechercher, qualifier, mettre_a_jour) ; % trouvée(s).', n;
  end if;
  raise notice 'OK  la recherche de prospects est montée : % capacités exécutables.', n;
end;
$$;
