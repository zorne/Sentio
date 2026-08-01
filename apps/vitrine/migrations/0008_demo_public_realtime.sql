-- ════════════════════════════════════════════════════════════════════
-- Migration 0008 — Lecture publique bornée au tenant démo (ADR-018)
--
-- TEMPORAIRE. L'authentification est différée (décision du fondateur :
-- finir agents + landing + dashboard avant de construire le vrai flux de
-- connexion). Le dashboard lit via un pool Postgres de confiance
-- (contourne RLS), mais le TEMPS RÉEL (Supabase Realtime, navigateur,
-- clé anon) a besoin d'une policy RLS explicite pour laisser passer les
-- abonnements sans session.
--
-- Portée strictement limitée : uniquement execution_event, uniquement
-- pour le tenant_id du tenant démo. Aucune autre table, aucun autre
-- tenant. Un seul tenant existe à ce jour (aucune vraie donnée client).
--
-- À SUPPRIMER avant d'onboarder un vrai second client :
--   drop policy demo_anon_read on execution_event;
-- ════════════════════════════════════════════════════════════════════

create policy demo_anon_read on execution_event
  for select
  using (tenant_id = '00000000-0000-0000-0000-000000000001');
