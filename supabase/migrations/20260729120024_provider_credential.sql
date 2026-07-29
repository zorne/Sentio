-- FOND-25 — table provider_credential : les fournisseurs de modèle et leur politique de données.
--
-- ⚠️ AUCUN SECRET ICI (AGENTS.md, invariant 7). Cette table décrit un fournisseur et son statut
-- de conformité ; la clé elle-même vit exclusivement dans les variables d'environnement de
-- l'hébergeur, et n'est jointe qu'à l'exécution.
--
-- data_policy est ce sur quoi le Model Gateway route : une donnée réelle ne part JAMAIS chez un
-- fournisseur qui n'est pas « sans entraînement » (invariant 5). Le Gateway SAUTE le fournisseur
-- non conforme, il ne le tente pas.
--
-- opt_out_proven_at matérialise l'assouplissement acté par docs/adr/0009 : tant que la date est
-- nulle, le fournisseur est NON CONFORME et aucune donnée réelle ne doit y transiter. C'est un
-- préalable de mise en service, pas une bonne pratique.

create table public.provider_credential (
  id                  uuid primary key default gen_random_uuid(),
  provider_key        text not null unique,
  -- 'no_train' : sans entraînement, par clause contractuelle ou par opt-out prouvé.
  -- 'free'     : tier gratuit sans garantie — données fictives uniquement.
  data_policy         text not null check (data_policy in ('no_train', 'free')),
  -- Date de la preuve archivée de l'opt-out. Nulle = non conforme.
  opt_out_proven_at   timestamptz,
  enabled             boolean not null default false,
  created_at          timestamptz not null default now(),
  -- Un fournisseur ne peut être déclaré « sans entraînement » sans preuve datée.
  constraint provider_no_train_needs_proof
    check (data_policy <> 'no_train' or opt_out_proven_at is not null)
);

alter table public.provider_credential enable row level security;
-- Aucune politique : le client ne voit jamais quels modèles ou fournisseurs sont utilisés
-- (projet.md §7). Lu côté serveur uniquement.
