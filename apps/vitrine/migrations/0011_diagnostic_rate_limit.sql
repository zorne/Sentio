-- ════════════════════════════════════════════════════════════════════
-- Migration 0011 — Limitation par visiteur et par adresse sur le
-- diagnostic public (ACQUIS-17 ; ACQUIS-18, l'enveloppe d'inférence
-- dédiée avec son propre plafond global, reste à faire séparément).
--
-- Le diagnostic manipule de l'inférence dès le premier échange, sans
-- authentification : sans plafond, un script peut consommer le quota
-- Groq de la plateforme entière en boucle. Deux compteurs, tous deux
-- nécessaires (ADR équivalent à celui de METIER-19/20 pour la
-- prospection : la base fait foi, pas la mémoire du process serveur,
-- qui ne survit pas à un redémarrage sans état sur Vercel) :
--
--   · par visiteur (cookie httpOnly, une ligne par jour) ;
--   · par adresse IP, hachée — jamais l'IP en clair, elle n'a aucune
--     utilité une fois le plafond appliqué et resterait une donnée
--     personnelle inutilement conservée.
-- ════════════════════════════════════════════════════════════════════

create table if not exists diagnostic_rate_limit (
  id             uuid primary key default gen_random_uuid(),
  visitor_id     uuid not null,
  ip_hash        text not null,
  day            date not null default current_date,
  message_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (visitor_id, day)
);

create index if not exists diagnostic_rate_limit_ip_day_idx
  on diagnostic_rate_limit (ip_hash, day);

-- Aucune policy RLS : jamais accédée depuis le client Supabase anon,
-- uniquement via le pool serveur (Server Action), même principe que
-- 0009 (rgpd_request) et 0010 (notification).
alter table diagnostic_rate_limit enable row level security;
