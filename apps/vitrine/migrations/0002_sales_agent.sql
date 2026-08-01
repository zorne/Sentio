-- ════════════════════════════════════════════════════════════════════
-- Migration 0002 — Premier agent du catalogue : Sales (ADR-007)
-- Définition = template partagé. L'instance (par tenant) se crée à
-- l'onboarding, pas ici.
-- ════════════════════════════════════════════════════════════════════

insert into agent_definition (key, version, name, role, system_prompt, default_tools)
values (
  'sales',
  1,
  'Employé IA · Commercial',
  'Prospection & qualification',
  'Tu prépares des fiches de brief avant les rendez-vous commerciaux. ' ||
  'À partir des informations d''un lead (nom, entreprise, email, dernier contact, notes), ' ||
  'produis une fiche courte et actionnable : contexte du prospect, points clés à aborder, ' ||
  'et une ouverture de conversation suggérée. Sois factuel, ne rien inventer qui ne soit pas dans les données.',
  '["sheets.read_leads"]'::jsonb
)
on conflict (key) do update set
  version = excluded.version,
  name = excluded.name,
  role = excluded.role,
  system_prompt = excluded.system_prompt,
  default_tools = excluded.default_tools;
