-- FOND-24 — table capability_binding : quel moteur sert quelle capacité.
-- Réalise : FOND-24
--
-- C'est la table qui permet de remplacer le moteur derrière une capacité sans toucher à aucun
-- employé existant. Un employé ne connaît jamais son moteur — il n'appelle qu'un contrat.
-- Ne jamais coder en dur le fournisseur d'une capacité dans un employé (AGENTS.md).
--
-- Le rattachement à plan_id est ce qui rend « plus d'intégrations » des formules supérieures
-- une donnée, et non du code.

create table public.capability_binding (
  id             uuid primary key default gen_random_uuid(),
  capability_id  uuid not null references public.capability (id) on delete cascade,
  plan_id        uuid not null references public.plan (id) on delete cascade,
  engine_key     text not null,
  -- Priorité de sélection : le moteur de plus haute priorité disponible sert la capacité.
  priority       integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (capability_id, plan_id, engine_key)
);

alter table public.capability_binding enable row level security;
-- Aucune politique : quel moteur sert quoi est de la mécanique, jamais exposée au client
-- (docs/07-parcours-produit.md). Lu côté serveur uniquement.
