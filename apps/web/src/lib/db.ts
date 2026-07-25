// ════════════════════════════════════════════════════════════════════
// Pool Postgres partagé pour les Server Components — lecture directe,
// sans passer par Supabase Auth/RLS (ADR-018 : auth différée).
//
// Singleton sur globalThis pour survivre au hot-reload de Next.js en dev
// (sinon chaque rechargement ouvrirait un nouveau pool, épuisant les
// connexions disponibles côté Postgres).
// ════════════════════════════════════════════════════════════════════

import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ?? new Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 5 });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
