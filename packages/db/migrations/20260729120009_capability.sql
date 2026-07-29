-- FOND-23 — table capability : le CONTRAT d'une capacité.
--
-- ⚠️ Ordre corrigé par rapport au backlog : celui-ci créait employee_capability (FOND-12) avant
-- capability (FOND-23), alors que la première référence la seconde. L'incohérence était déjà
-- signalée dans docs/20-plan-action.md, phase 1.
--
-- Une capacité est un contrat stable (« trouver des prospects ») ; son moteur est remplaçable
-- (docs/adr/0006). C'est ce qui permet de changer d'outil sans toucher à aucun employé —
-- exigence §21 de la vision.
--
-- Table globale : le catalogue des capacités ne dépend d'aucune entreprise.

create table public.capability (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  -- Forme des entrées et des sorties attendues. C'est le contrat, il ne nomme aucun moteur.
  contract    jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.capability enable row level security;

create policy capability_select on public.capability
  for select to authenticated
  using (true);
