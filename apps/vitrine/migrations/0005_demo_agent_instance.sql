-- ════════════════════════════════════════════════════════════════════
-- Migration 0005 — Instance du Sales Agent pour le tenant de démo
-- Une Task référence toujours une agent_instance (clé étrangère non
-- nulle) : il faut déployer l'agent chez le tenant avant de l'exécuter.
-- ════════════════════════════════════════════════════════════════════

insert into agent_instance (id, tenant_id, definition_id, name)
select
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  id,
  'Employé IA · Commercial (démo)'
from agent_definition
where key = 'sales'
on conflict (id) do nothing;
