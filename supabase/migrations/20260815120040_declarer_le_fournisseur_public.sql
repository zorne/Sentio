-- Déclarer le fournisseur qui sert le diagnostic public.
--
-- ══ LA PANNE, ET POURQUOI ELLE NE SE VOYAIT PAS ══
--
-- Le diagnostic public répondait « nous n'avons pas pu vous répondre » à chaque question, pour
-- tout le monde. Deux causes empilées, et la seconde n'apparaissait qu'une fois la première
-- réparée :
--
--   1. le modèle nommé en dur avait été retiré par le fournisseur (corrigé côté code) ;
--   2. **`provider_quota` refusait d'écrire**, parce que sa clé étrangère pointe vers
--      `provider_credential`, et que cette table était VIDE.
--
-- Le plafond d'inférence ne pouvait donc pas compter, l'appel échouait, et le visiteur recevait
-- une phrase polie. Le produit n'était pas en panne : il était devenu muet, ce qui n'apparaît
-- dans aucune alerte et se découvre le jour où quelqu'un essaie.
--
-- ⚠️ CETTE LIGNE EST UNE DONNÉE DE RÉFÉRENCE, PAS DU JEU D'ESSAI. Sans elle le diagnostic ne
-- fonctionne pas du tout. Sa place est donc dans une migration, au même titre que les formules
-- (`20260729120031`) : elle voyage avec le schéma, elle ne s'oublie pas au déploiement.
--
-- ⚠️ ET ELLE NE CONTIENT AUCUN SECRET. Cette table déclare une POLITIQUE, jamais une clé : la
-- clé vit en variable d'environnement et n'entre jamais dans le dépôt (`AGENTS.md`, invariant 7).

insert into public.provider_credential (provider_key, data_policy, enabled)
values
  -- ⚠️ « free », ET C'EST LE POINT LE PLUS IMPORTANT DE CETTE MIGRATION.
  --
  -- `free` signifie : entraînement NON désactivé, ou pas prouvé. La contrainte
  -- `provider_no_train_needs_proof` interdit d'écrire `no_train` sans date d'opt-out, et c'est
  -- l'invariant 5 rendu mécanique. Tant que cette preuve n'existe pas, aucune donnée réelle de
  -- client ne doit partir chez ce fournisseur.
  --
  -- ⚠️ Le diagnostic public l'appelle pourtant avec des descriptions d'entreprises RÉELLES,
  -- étiquetées `test` dans le code de la vitrine pour franchir le garde-fou. C'est le constat
  -- **B5** de `docs/32`, et il reste ouvert : déclarer le fournisseur ici ne le referme pas, mais
  -- rend la situation LISIBLE en base au lieu de la laisser cachée dans un objet littéral.
  ('groq', 'free', false)
on conflict (provider_key) do nothing;

do $$
declare
  n integer;
begin
  select count(*) into n from public.provider_credential;
  if n = 0 then
    raise exception 'Aucun fournisseur déclaré : le plafond d''inférence ne pourra rien écrire.';
  end if;
  raise notice 'OK  fournisseur public déclaré : le plafond du diagnostic peut compter.';
end;
$$;
