-- ════════════════════════════════════════════════════════════════════
-- Migration 0007 — Mémoire long terme (archi §5, §8)
--
-- Des faits structurés courts, pas des embeddings : c'est la mémoire
-- utile en premier (archi §5 — la récupération sur données structurées
-- couvre 80% du besoin ; le sémantique/vectoriel viendra en Phase 4+
-- si un vrai besoin de non-structuré apparaît).
--
-- Alimentée par la réflexion post-run (principe n°1 : l'apprentissage
-- est une CONSÉQUENCE du fait qu'on trace tout, pas un module à part —
-- ces faits sont extraits du journal execution_event d'un run terminé).
-- ════════════════════════════════════════════════════════════════════

create table agent_memory (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant(id) on delete cascade,
  agent_instance_id uuid not null references agent_instance(id) on delete cascade,
  fact              text not null,
  -- La tâche dont ce souvenir est issu — traçabilité (Ch.74), permet de
  -- retrouver le contexte complet d'où vient un fait mémorisé.
  source_task_id    uuid references task(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index on agent_memory (agent_instance_id, created_at desc);

alter table agent_memory enable row level security;
create policy tenant_isolation on agent_memory
  for all using (is_member(tenant_id));
