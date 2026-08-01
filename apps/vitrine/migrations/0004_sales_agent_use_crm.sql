-- ════════════════════════════════════════════════════════════════════
-- Migration 0004 — Sales Agent utilise crm.read_leads (ADR-009)
-- ════════════════════════════════════════════════════════════════════

update agent_definition
set default_tools = '["crm.read_leads"]'::jsonb
where key = 'sales';
