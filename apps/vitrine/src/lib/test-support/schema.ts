// ════════════════════════════════════════════════════════════════════
// Montage d'une base jetable portant le schéma réel de la vitrine.
//
// Partagé par les suites d'intégration : chacune repart d'un `public`
// vide et rejoue les migrations dans l'ordre. Elles s'exécutent en
// série (vitest.config.ts, `fileParallelism: false`) — sans ça, deux
// fichiers effaceraient le schéma l'un de l'autre en pleine course.
// ════════════════════════════════════════════════════════════════════

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "migrations");

/** Le strict minimum de ce que Supabase fournit et qu'un Postgres nu n'a pas.
 *  Les rôles en font partie : sans eux, une policy `to authenticated` ne s'applique. */
const SHIM_SUPABASE = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  end $$;
`;

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: never[] } | unknown>;
}

/** Efface et reconstruit le schéma applicatif à partir des migrations réelles. */
export async function applyVitrineSchema(db: Queryable): Promise<void> {
  await db.query(`drop schema if exists public cascade; create schema public;`);
  await db.query(SHIM_SUPABASE);

  const fichiers = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const fichier of fichiers) {
    await db.query(await readFile(join(MIGRATIONS, fichier), "utf8"));
  }
}
