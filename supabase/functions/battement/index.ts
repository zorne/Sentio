/**
 * PROTOTYPE D16 — le battement, sous Deno.
 *
 * ══ CE QU'IL PROUVE ══
 *
 *   1. la **signature** écrite côté Node se vérifie ici, sans recopie — le module vit dans
 *      `packages/domain`, que `pnpm run functions:sync` descend vers `_generated/` ;
 *   2. le port `SqlClient` s'implémente sous Deno (`sql.ts`) ;
 *   3. la requête de prise de travail — `for update skip locked`, le cœur d'`EXEC-12` — s'exécute
 *      **à l'identique** : c'est du SQL, il ne connaît pas le runtime qui l'envoie.
 *
 * ══ CE QU'IL NE FAIT PAS, VOLONTAIREMENT ══
 *
 * Il n'exécute aucun pas, n'appelle aucun modèle, ne produit aucun effet. Un prototype qui ferait
 * travailler un employé ne serait plus un prototype : ce serait un second exécutant, capable
 * d'écrire à de vrais prospects, et il faudrait le traiter comme tel. Ici on relâche le verrou
 * aussitôt pris — la file ressort exactement comme elle est entrée.
 *
 * ⚠️ **Le worker Node reste la référence.** Ce fichier ne le remplace pas, il mesure si on
 * pourrait le remplacer.
 *
 * Réalise : EXEC-19
 */

import { HEARTBEAT_HEADER, verifyHeartbeat } from "@sentio/domain";

import { PostgresDeno } from "./sql.ts";

/** Ce qu'un battement de prototype rapporte : de quoi juger la viabilité, rien d'autre. */
export interface RapportPrototype {
  readonly disponibles: number;
  readonly msConnexion: number;
  readonly msRequete: number;
}

/**
 * Prend un travail dû, puis **rend le verrou immédiatement**.
 *
 * La requête est celle d'`EXEC-12`, au mot près. Si elle s'exécute ici, c'est que la migration
 * n'aura rien à réécrire du SQL — seulement du câblage.
 */
export async function sonder(sql: PostgresDeno, maintenant: Date): Promise<number> {
  const lignes = await sql.query<{ task_id: string }>(
    `with candidat as (
       select j.id
         from job j
        where j.next_run_at <= $1
          and j.locked_at is null
        order by j.priority desc, j.next_run_at, j.id
        for update of j skip locked
        limit 1
     )
     update job
        set locked_at = $1, locked_by = 'prototype-deno'
       from candidat
      where job.id = candidat.id
     returning job.task_id`,
    [maintenant],
  );

  // On repose le verrou : ce prototype observe, il ne travaille pas.
  if (lignes.length > 0) {
    await sql.query(`update job set locked_at = null, locked_by = null where task_id = $1`, [
      lignes[0]?.task_id,
    ]);
  }
  return lignes.length;
}

/**
 * Le gestionnaire, aux standards du web — comme côté Node.
 *
 * L'ordre est le même : méthode, puis signature, puis travail. Rien n'ouvre de connexion avant
 * que la signature ne soit vérifiée : une requête non signée ne doit pas coûter une connexion à
 * la base, sinon le refus devient lui-même un levier de saturation.
 */
export async function repondre(requete: Request): Promise<Response> {
  const json = (corps: unknown, statut: number) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });

  if (requete.method !== "POST") return json({ erreur: "Méthode non autorisée." }, 405);

  const verdict = await verifyHeartbeat({
    header: requete.headers.get(HEARTBEAT_HEADER),
    secret: Deno.env.get("SENTIO_HEARTBEAT_SECRET"),
    now: new Date(),
  });
  if (!verdict.ok) return json({ erreur: "Battement refusé." }, 401);

  const url = Deno.env.get("DATABASE_URL");
  if (url === undefined || url === "") return json({ erreur: "Erreur interne." }, 500);

  const debutConnexion = performance.now();
  const sql = await PostgresDeno.connecter(url);
  const msConnexion = performance.now() - debutConnexion;
  try {
    const debutRequete = performance.now();
    const disponibles = await sonder(sql, new Date());
    const rapport: RapportPrototype = {
      disponibles,
      msConnexion,
      msRequete: performance.now() - debutRequete,
    };
    return json(rapport, 200);
  } finally {
    await sql.fermer();
  }
}

// Ne sert que si ce fichier est le point d'entrée : à l'import (dans un test), rien n'écoute.
if (import.meta.main) Deno.serve(repondre);
