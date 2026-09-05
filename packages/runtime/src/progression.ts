/**
 * EVOL-04 — la façon de travailler qui gagne CHEZ CE CLIENT prend le dessus.
 *
 * ══ CE QUE ÇA CHANGE POUR LE DIRIGEANT ══
 *
 * Il n'achète pas un employé, il achète un employé qui **s'améliore chez lui**. Le registre de
 * langage qui fonctionne dans son secteur, l'angle qui obtient des réponses de ses prospects :
 * rien de tout cela n'est décidé à l'avance, tout est mesuré sur ses missions à lui.
 *
 * ══ CE QUI SÉPARE CECI DE LA RÉÉVALUATION DE CONFIGURATION ══
 *
 * `reevaluation.ts` peut proposer que Lady change de RÔLE — ça touche ce qu'elle est pour cette
 * entreprise, donc ça demande l'accord du dirigeant (§10 de la vision). Ici, le rôle ne bouge
 * pas : c'est une manière à l'intérieur du rôle, réversible et interne. Elle s'applique donc
 * seule — mais **jamais en silence** : chaque changement écrit un `strategy_change` et une
 * notification d'évolution, adossée à sa preuve (`20260729120021`).
 *
 * ⚠️ Une part des missions continue d'être tirée entre toutes les variantes
 * (`PART_D_EXPLORATION`). Une préférence qu'on n'explore plus n'est plus une mesure, c'est une
 * conviction — et le jour où le marché change, personne ne le voit.
 *
 * Réalise : EVOL-04
 */

import { departagerLesVariantes, type ResultatDeVariante } from "@sentio/domain";
import type { EmployeeId, TenantId } from "@sentio/domain";
import type { JournalWriter } from "@sentio/core";
import type { SqlClient } from "@sentio/db";

/** La nature journalisée quand une façon de travailler a été retenue. */
export const PROGRESSION_RETENUE = "progression_retenue";
/** La nature journalisée quand rien n'a été retenu — et pourquoi. */
export const PROGRESSION_SANS_SUITE = "progression_sans_suite";

export interface ProgressionDeps {
  readonly sql: SqlClient;
  readonly journal: JournalWriter;
}

export interface RapportDeProgression {
  readonly examines: number;
  /** Préférences réellement changées — jamais le nombre de genres examinés. */
  readonly retenues: number;
  readonly silences: Readonly<Record<string, number>>;
}

/** Comment le dirigeant lit un genre de variante. « kind » est notre mot, pas le sien. */
const MOTS_DU_GENRE: Record<string, string> = {
  registre: "sa façon de s'exprimer",
  angle: "sa façon d'aborder une entreprise",
  moment_de_relance: "le moment où il relance",
};

/**
 * Relit les résultats de chaque entreprise et retient ce qui marche chez elle.
 *
 * **Une entreprise en échec n'arrête pas les autres.**
 */
export async function faireProgresserLesEmployes(
  deps: ProgressionDeps,
  maintenant: Date,
): Promise<RapportDeProgression> {
  const silences: Record<string, number> = {};
  const jour = maintenant.toISOString().slice(0, 10);
  let examines = 0;
  let retenues = 0;

  for (const employe of await employesEnActivite(deps.sql)) {
    // Une fois par jour, comme la réévaluation : les résultats se comptent en missions, pas en
    // minutes, et relire à chaque battement ne ferait que remplir le journal.
    if (await dejaExamineAujourdhui(deps.sql, employe, jour)) continue;

    examines += 1;
    try {
      retenues += await faireProgresserUnEmploye(deps, employe, silences);
    } catch (error) {
      silences["erreur"] = (silences["erreur"] ?? 0) + 1;
      await journaliser(deps, employe, PROGRESSION_SANS_SUITE, {
        raison: "erreur",
        detail: String(error),
      });
    }
  }

  return { examines, retenues, silences };
}

interface EmployeEnActivite {
  readonly tenantId: TenantId;
  readonly employeeId: EmployeeId;
}

async function employesEnActivite(sql: SqlClient): Promise<readonly EmployeEnActivite[]> {
  const rows = await sql.query<{ tenant_id: string; employee_id: string }>(
    // ⚠️ Un employé arrêté par son dirigeant ne progresse pas non plus. Laisser sa façon de
    // travailler changer pendant qu'il est à l'arrêt, c'est exactement ce qu'un arrêt existe
    // pour empêcher : que quelque chose bouge sans lui.
    `select e.tenant_id, e.id as employee_id
       from employee e
      where e.en_pause_depuis is null
      order by e.tenant_id, e.id`,
    [],
  );
  return rows.map((row) => ({
    tenantId: row.tenant_id as TenantId,
    employeeId: row.employee_id as EmployeeId,
  }));
}

async function dejaExamineAujourdhui(
  sql: SqlClient,
  employe: EmployeEnActivite,
  jour: string,
): Promise<boolean> {
  const [row] = await sql.query<{ deja: boolean }>(
    `select exists (
       select 1 from execution_event e
        where e.tenant_id = $1 and e.employee_id = $2
          and e.kind = any($3::text[])
          -- ⚠️ « at time zone 'UTC' », et surtout PAS « ::timestamptz ».
          --
          -- Le jour ($4) est calculé par Node, en UTC. Le cast direct « ::date::timestamptz »,
          -- lui, interprète cette date dans le fuseau de la SESSION Postgres. Sur un serveur en
          -- Europe/Paris, la fenêtre glissait donc de deux heures : entre minuit et 2 h locales,
          -- l'événement écrit à l'instant tombait APRÈS la fin de la fenêtre, la garde ne le
          -- voyait pas, et le travail du jour se refaisait à chaque battement.
          --
          -- Un défaut qui n'existe que deux heures par nuit ne se voit jamais en journée : il a
          -- fallu que la vérification tourne à 00 h 12 pour qu'il apparaisse.
          and e.created_at >= ($4::date)::timestamp at time zone 'UTC'
          and e.created_at <  ($4::date + 1)::timestamp at time zone 'UTC'
     ) as deja`,
    [employe.tenantId, employe.employeeId, [PROGRESSION_RETENUE, PROGRESSION_SANS_SUITE], jour],
  );
  return row?.deja === true;
}

async function faireProgresserUnEmploye(
  deps: ProgressionDeps,
  employe: EmployeEnActivite,
  silences: Record<string, number>,
): Promise<number> {
  const resultats = await resultatsParVariante(deps.sql, employe.tenantId);

  if (resultats.length === 0) {
    silences["rien_a_mesurer"] = (silences["rien_a_mesurer"] ?? 0) + 1;
    await journaliser(deps, employe, PROGRESSION_SANS_SUITE, { raison: "rien_a_mesurer" });
    return 0;
  }

  const genres = [...new Set(resultats.map((resultat) => resultat.kind))].sort();
  let retenues = 0;

  for (const genre of genres) {
    // ⚠️ Un genre à la fois. Comparer un angle à une cadence de relance n'aurait aucun sens : ce
    // ne sont pas deux façons de faire la même chose.
    const verdict = departagerLesVariantes(resultats.filter((r) => r.kind === genre));

    if (verdict.statut !== "gagnante") {
      silences[verdict.statut] = (silences[verdict.statut] ?? 0) + 1;
      await journaliser(deps, employe, PROGRESSION_SANS_SUITE, {
        raison: verdict.statut,
        genre,
        detail: verdict.motif,
      });
      continue;
    }

    const [deja] = await deps.sql.query<{ variant_id: string }>(
      "select variant_id from tenant_variant_preference where tenant_id = $1 and kind = $2",
      [employe.tenantId, genre],
    );

    if (deja?.variant_id === verdict.variantId) {
      // La mesure confirme ce qui s'applique déjà. Republier annoncerait un changement qui
      // n'existe pas — le mensonge le plus tentant du produit (`docs/08`).
      silences["deja_en_place"] = (silences["deja_en_place"] ?? 0) + 1;
      await journaliser(deps, employe, PROGRESSION_SANS_SUITE, {
        raison: "deja_en_place",
        genre,
      });
      continue;
    }

    await deps.sql.query(
      `insert into tenant_variant_preference
         (tenant_id, kind, variant_id, missions_comparees, raison)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, kind) do update
         set variant_id = excluded.variant_id,
             missions_comparees = excluded.missions_comparees,
             raison = excluded.raison,
             decided_at = now()`,
      [employe.tenantId, genre, verdict.variantId, verdict.missionsComparees, verdict.raison],
    );

    await annoncer(deps, employe, genre, verdict.raison);

    await journaliser(deps, employe, PROGRESSION_RETENUE, {
      genre,
      variante: verdict.key,
      missionsComparees: verdict.missionsComparees,
    });
    retenues += 1;
  }

  return retenues;
}

/**
 * Le changement est ENREGISTRÉ avant d'être annoncé.
 *
 * L'ordre est la garantie : une notification d'évolution ne peut pas exister sans sa preuve
 * (`20260729120021`), et c'est cet ordre-là qui l'assure au lieu d'une intention.
 */
async function annoncer(
  deps: ProgressionDeps,
  employe: EmployeEnActivite,
  genre: string,
  raison: string,
): Promise<void> {
  const quoi = MOTS_DU_GENRE[genre] ?? "sa façon de travailler";
  const description = `${quoi.charAt(0).toUpperCase()}${quoi.slice(1)} a changé. ${raison}`;

  const [changement] = await deps.sql.query<{ id: string }>(
    `insert into strategy_change (tenant_id, employee_id, description)
     values ($1, $2, $3) returning id`,
    [employe.tenantId, employe.employeeId, description],
  );

  await deps.sql.query(
    `insert into notification (tenant_id, employee_id, kind, message, strategy_change_id)
     values ($1, $2, 'evolution', $3, $4)`,
    [employe.tenantId, employe.employeeId, description, changement?.id],
  );
}

async function resultatsParVariante(
  sql: SqlClient,
  tenantId: TenantId,
): Promise<readonly ResultatDeVariante[]> {
  const lignes = await sql.query<{
    variant_id: string;
    kind: string;
    key: string;
    missions: number;
    reponses: number;
    rendez_vous: number;
    ventes: number;
  }>("select * from resultats_par_variante($1)", [tenantId]);

  return lignes.map((ligne) => ({
    variantId: ligne.variant_id,
    kind: ligne.kind,
    key: ligne.key,
    missions: Number(ligne.missions),
    reponses: Number(ligne.reponses),
    rendezVous: Number(ligne.rendez_vous),
    ventes: Number(ligne.ventes),
  }));
}

async function journaliser(
  deps: ProgressionDeps,
  employe: EmployeEnActivite,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await deps.journal.append({
    tenantId: employe.tenantId,
    employeeId: employe.employeeId,
    taskId: null,
    kind,
    payload,
  });
}
