-- FOND-17 — table job : la file d'exécution.
--
-- Une vraie file dans Postgres : consommée avec verrouillage par ligne et saut des lignes déjà
-- verrouillées. Elle tient plusieurs milliers de tâches par jour, coûte €0, et se remplace plus
-- tard par une file managée sans toucher au domaine (docs/03-modele-de-donnees.md).
--
-- La colonne priority EST la promesse « priorité d'exécution » des formules supérieures : elle
-- se lit depuis plan.job_priority, jamais depuis une condition sur la formule.

create table public.job (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  task_id      uuid not null references public.task (id) on delete cascade,
  priority     integer not null default 0,
  attempts     integer not null default 0 check (attempts >= 0),
  locked_at    timestamptz,
  locked_by    text,
  next_run_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  -- Un verrou porte toujours son porteur, et un job libre n'en porte aucun.
  check ((locked_at is null) = (locked_by is null))
);

-- Index de consommation de la file : priorité décroissante, puis échéance.
create index job_ready_idx on public.job (priority desc, next_run_at)
  where locked_at is null;

create index job_tenant_idx on public.job (tenant_id);

alter table public.job enable row level security;
-- Aucune politique : la file est de la mécanique, jamais exposée au client
-- (docs/07-parcours-produit.md — « jamais les workflows »). Consommée par le worker.
