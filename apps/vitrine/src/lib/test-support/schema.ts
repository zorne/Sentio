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

/**
 * Refuse une chaîne de connexion qui ne désigne pas une base jetable.
 *
 * ⚠️ CE GARDE EXISTE PARCE QUE LA FONCTION CI-DESSOUS DÉTRUIT. Elle commence par
 * `drop schema public cascade` : pointée sur le projet distant, elle effacerait l'ADN, les 350
 * identités, les formules et les quotas en une commande, sans confirmation et sans retour.
 *
 * `supabase/tests/run.sh` porte exactement ce garde depuis le début ; ce chemin-ci ne l'avait
 * pas. Un banc d'essai qui peut détruire la production n'est pas un banc d'essai — et le seul
 * moment où l'on découvrirait l'oubli serait celui où il aurait déjà servi.
 *
 * Le refus porte sur ce qui est reconnaissable : les hôtes du fournisseur. Ce n'est pas une
 * preuve que la base est locale — c'est la seule chose qu'on puisse vérifier sans se connecter,
 * et elle attrape le cas réel, celui d'une variable d'environnement laissée en place.
 */
export function assertBaseJetable(connectionString: string): void {
  if (/supabase\.(co|com)|pooler\.supabase/.test(connectionString)) {
    throw new Error(
      "DATABASE_URL désigne un projet Supabase distant. Ces tests EFFACENT le schéma public : " +
        "ils ne s'exécutent que sur une base jetable. Pour le distant, c'est `supabase db push`.",
    );
  }
}

/**
 * Efface et reconstruit le schéma applicatif à partir des migrations réelles.
 *
 * La chaîne de connexion est un paramètre OBLIGATOIRE, et elle ne sert qu'à être vérifiée. La
 * rendre facultative reviendrait à rendre le garde facultatif : ici, le compilateur refuse tout
 * appel qui ne l'a pas traversé.
 */
export async function applyVitrineSchema(
  db: Queryable,
  connectionString: string | undefined,
): Promise<void> {
  // `undefined` est accepté au TYPE mais refusé au comportement : les suites lisent une variable
  // d'environnement, donc le compilateur ne peut pas garantir qu'elle existe. Ce qu'on refuse,
  // c'est d'effacer un schéma sans savoir lequel — le contraire d'un `!` posé chez l'appelant,
  // qui aurait fait taire la question au lieu d'y répondre.
  if (connectionString === undefined) {
    throw new Error(
      "applyVitrineSchema sans chaîne de connexion : le garde ne peut pas vérifier ce qu'on " +
        "s'apprête à effacer, donc on n'efface pas.",
    );
  }
  assertBaseJetable(connectionString);
  await db.query(`drop schema if exists public cascade; create schema public;`);
  await db.query(SHIM_SUPABASE);

  const fichiers = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const fichier of fichiers) {
    await db.query(await readFile(join(MIGRATIONS, fichier), "utf8"));
  }
}

/** Le schéma du CŒUR — `supabase/migrations`, la source de vérité (`adr/0025`, `adr/0030`). */
const MIGRATIONS_DU_COEUR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

/**
 * Monte le schéma RÉEL, celui qui tourne en production.
 *
 * ══ POURQUOI DEUX MONTAGES, ET LEQUEL DIT LA VÉRITÉ ══
 *
 * `applyVitrineSchema` ci-dessus rejoue `apps/vitrine/migrations` — le schéma de la vitrine
 * d'AVANT la fusion, qui n'a jamais été appliqué au projet Supabase. Il contient des tables qui
 * n'existent nulle part en ligne (`agent_instance`, `agent_definition`, `rgpd_request`), et il
 * lui manque tout le cœur (`employee`, `lady_configuration`, `conversation_message`).
 *
 * ⚠️ **Une suite montée sur ce schéma-là ne prouve rien sur la production.** C'est ce qui a
 * laissé passer l'appel à `agent_instance` dans `claimTenantsForCurrentUser` : la table existait
 * dans le schéma des tests, et seulement là. Les tests étaient verts contre une fiction.
 *
 * Toute suite qui touche au cœur — l'espace du dirigeant, ses employées, ses conversations —
 * utilise CE montage-ci. Le premier reste en place tant que les suites qui en dépendent n'ont
 * pas été portées ; le faire basculer d'un coup dépasse la correction en cours.
 */
export async function applySchemaDuCoeur(
  db: Queryable,
  connectionString: string | undefined,
): Promise<void> {
  if (connectionString === undefined) {
    throw new Error(
      "applySchemaDuCoeur sans chaîne de connexion : le garde ne peut pas vérifier ce qu'on " +
        "s'apprête à effacer, donc on n'efface pas.",
    );
  }
  assertBaseJetable(connectionString);
  await db.query(`drop schema if exists public cascade; create schema public;`);
  await db.query(SHIM_SUPABASE);
  // ⚠️ `auth` N'EST PAS DANS `public`, DONC IL NE TOMBE PAS AVEC LUI. Le shim le crée avec des
  // `if not exists` : ses comptes survivent d'une exécution à la suivante, et la deuxième échoue
  // sur une clé dupliquée. Une suite qui ne passe qu'une fois sur une base neuve n'est pas une
  // suite — c'est un coup de chance qu'on rejouera en croyant qu'il prouve quelque chose.
  await db.query(`truncate table auth.users cascade;`);
  // Le défaut permissif de la plateforme, reproduit : sans lui, les migrations qui RÉVOQUENT des
  // droits corrigeraient un danger inexistant, et leur test ne prouverait rien.
  await db.query(`
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);

  const fichiers = (await readdir(MIGRATIONS_DU_COEUR)).filter((f) => f.endsWith(".sql")).sort();
  for (const fichier of fichiers) {
    await db.query(await readFile(join(MIGRATIONS_DU_COEUR, fichier), "utf8"));
  }
}
