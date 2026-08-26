/**
 * LADY-U — la boucle se referme : ce que Lady a produit revient dans son diagnostic.
 *
 * ══ CE QUI MANQUAIT ══
 *
 * Trois pièces existaient et ne se parlaient pas. La base savait compter le travail
 * (`mesures_du_travail`), le domaine savait en tirer des constats (`releverDesResultats`), le
 * moteur savait tirer une configuration de constats (`diagnostiquer` → `composer`). Entre les
 * trois : rien. Une Lady pouvait échouer un mois entier sans que sa configuration bouge.
 *
 * ══ LA RÈGLE QUI COMMANDE CE FICHIER ══
 *
 * **Elle propose. Elle n'applique pas** (§10 de la vision). La version publiée ici naît inactive
 * et le reste tant qu'un dirigeant n'a pas répondu. Un produit qui se reconfigure seul sur ses
 * propres chiffres déplace l'employé toutes les semaines, ne termine aucune approche, et le
 * client découvre au réveil que ce qu'il a acheté fait autre chose.
 *
 * ⚠️ **Les constats mesurés ne remplacent pas ceux du premier diagnostic, ils s'y ajoutent.** Ce
 * que le dirigeant a déclaré au départ reste vrai ; simplement, une mesure pèse plus lourd qu'une
 * déclaration (`CONFIANCE_PAR_SOURCE`), et c'est la pondération — pas un écrasement — qui fait
 * bouger la conclusion. Repartir des seules mesures reviendrait à oublier son entreprise à chaque
 * réévaluation.
 *
 * Réalise : LADY-U
 */

import {
  composer,
  diagnostiquer,
  releverDesResultats,
  type Constat,
  type MesuresDuTravail,
} from "@sentio/domain";
import type { EmployeeId, TenantId } from "@sentio/domain";
import type { SqlClient } from "@sentio/db";
import type { JournalWriter } from "@sentio/core";

/** La nature journalisée quand une réévaluation a produit une proposition. */
export const REEVALUATION_PROPOSEE = "reevaluation_proposee";
/** La nature journalisée quand elle s'est tue — et pourquoi. */
export const REEVALUATION_SANS_SUITE = "reevaluation_sans_suite";

export interface ReevaluationDeps {
  readonly sql: SqlClient;
  readonly journal: JournalWriter;
}

export interface RapportDeReevaluation {
  /** Employés dont les résultats ont été relus. */
  readonly examines: number;
  /** Propositions réellement publiées — jamais le nombre d'employés en difficulté. */
  readonly proposees: number;
  /** Pourquoi rien n'a été proposé, par raison. Un chiffre sans raison n'aide personne. */
  readonly silences: Readonly<Record<string, number>>;
}

/**
 * Relit les résultats de chaque employé et propose, s'il y a lieu, une version suivante.
 *
 * **Un employé dont la réévaluation échoue n'arrête pas les autres** : l'incident d'une
 * entreprise ne doit pas devenir la panne de toutes.
 */
export async function reevaluerLesEmployes(
  deps: ReevaluationDeps,
  maintenant: Date,
): Promise<RapportDeReevaluation> {
  const silences: Record<string, number> = {};
  const jour = maintenant.toISOString().slice(0, 10);
  let examines = 0;
  let proposees = 0;

  for (const employe of await employesConfigures(deps.sql)) {
    // ⚠️ UNE FOIS PAR JOUR, pas une fois par battement. Un battement tourne toutes les quelques
    // minutes ; relire les résultats à chaque fois n'apprendrait rien de neuf — les mesures
    // portent sur des jours — et remplirait le journal de centaines de « rien à dire » qui
    // noieraient ce qui compte. Le journal sert lui-même de garde : il est en ajout seul, donc
    // ce qu'il contient pour aujourd'hui est une réponse fiable.
    if (await dejaReevalueAujourdhui(deps.sql, employe, jour)) continue;

    examines += 1;
    try {
      const publiee = await reevaluerUnEmploye(deps, employe, silences);
      if (publiee) proposees += 1;
    } catch (error) {
      silences["erreur"] = (silences["erreur"] ?? 0) + 1;
      await journaliser(deps, employe, REEVALUATION_SANS_SUITE, {
        raison: "erreur",
        detail: String(error),
      });
    }
  }

  return { examines, proposees, silences };
}

/**
 * A-t-on déjà relu les résultats de cet employé aujourd'hui ?
 *
 * Le jour est celui du calendrier UTC, comme le lot d'approvisionnement (`battement.ts`) — jamais
 * le fuseau du processus, qui déciderait sinon quand une journée de travail commence.
 */
async function dejaReevalueAujourdhui(
  sql: SqlClient,
  employe: EmployeConfigure,
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
    [employe.tenantId, employe.employeeId, [REEVALUATION_PROPOSEE, REEVALUATION_SANS_SUITE], jour],
  );
  return row?.deja === true;
}

interface EmployeConfigure {
  readonly tenantId: TenantId;
  readonly employeeId: EmployeeId;
  readonly diagnosticSessionId: string | null;
}

/**
 * Les employés qui ont une configuration active.
 *
 * Sans configuration active, il n'y a pas de version « suivante » à proposer : la chaîne des
 * versions n'aurait rien à prolonger, et `proposer_une_configuration` refuserait — à raison.
 */
async function employesConfigures(sql: SqlClient): Promise<readonly EmployeConfigure[]> {
  const rows = await sql.query<{
    tenant_id: string;
    employee_id: string;
    diagnostic_session_id: string | null;
  }>(
    // Un employé arrêté ne se voit pas non plus proposer autre chose : le dirigeant a demandé
    // que rien ne bouge, et une proposition qui l'attend au réveil bouge déjà.
    `select c.tenant_id, c.employee_id, c.diagnostic_session_id
       from lady_configuration c
       join employee e on e.tenant_id = c.tenant_id and e.id = c.employee_id
      where c.active and e.en_pause_depuis is null
      order by c.tenant_id, c.employee_id`,
    [],
  );
  return rows.map((row) => ({
    tenantId: row.tenant_id as TenantId,
    employeeId: row.employee_id as EmployeeId,
    diagnosticSessionId: row.diagnostic_session_id,
  }));
}

async function reevaluerUnEmploye(
  deps: ReevaluationDeps,
  employe: EmployeConfigure,
  silences: Record<string, number>,
): Promise<boolean> {
  const mesures = await mesurerLeTravail(deps.sql, employe.tenantId);
  if (mesures === null) {
    // Aucun objectif actif : il n'y a pas de rythme à tenir, donc rien à conclure d'un retard.
    return taire(deps, employe, silences, "sans_objectif");
  }

  const verdict = releverDesResultats(mesures);
  if (verdict.statut === "trop_tot") {
    return taire(deps, employe, silences, "signal_trop_faible", { motif: verdict.motif });
  }

  // Le premier diagnostic reste au dossier. Les mesures s'ajoutent à lui.
  const constats = [
    ...(await constatsDOrigine(deps.sql, employe.diagnosticSessionId)),
    ...verdict.constats,
  ];

  const resultat = composer(diagnostiquer(constats));
  if (resultat.statut !== "compose") {
    // Hors périmètre ou sans besoin : on ne bricole pas une configuration de repli. Ce serait
    // proposer au dirigeant un déplacement que rien ne justifie.
    return taire(deps, employe, silences, resultat.statut, { motif: resultat.motif });
  }

  const proposition = resultat.configuration;
  const raison = raisonLisible(verdict.constats, proposition.motifs);

  const [publiee] = await deps.sql.query<{ configuration_id: string; deja_proposee: boolean }>(
    `select * from proposer_une_configuration($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      employe.tenantId,
      employe.employeeId,
      proposition.role,
      JSON.stringify(proposition.priorites),
      JSON.stringify(proposition.limites),
      proposition.autonomie,
      proposition.capacites,
      raison,
    ],
  );

  if (publiee === undefined || publiee.deja_proposee) {
    // Soit une question attend déjà une réponse, soit la conclusion est celle qui s'applique
    // déjà. Dans les deux cas, insister n'apporterait rien au dirigeant.
    return taire(deps, employe, silences, "deja_proposee");
  }

  await journaliser(deps, employe, REEVALUATION_PROPOSEE, {
    configuration: publiee.configuration_id,
    role: proposition.role,
    constats: verdict.constats.map((constat) => `${constat.genre}:${constat.domaine}`),
  });
  return true;
}

async function taire(
  deps: ReevaluationDeps,
  employe: EmployeConfigure,
  silences: Record<string, number>,
  raison: string,
  detail: Record<string, unknown> = {},
): Promise<boolean> {
  silences[raison] = (silences[raison] ?? 0) + 1;
  await journaliser(deps, employe, REEVALUATION_SANS_SUITE, { raison, ...detail });
  return false;
}

/** Les mesures brutes du travail, telles que la base les compte. `null` sans objectif actif. */
async function mesurerLeTravail(
  sql: SqlClient,
  tenantId: TenantId,
): Promise<MesuresDuTravail | null> {
  const [row] = await sql.query<{
    missions_ouvertes: string;
    missions_agies: string;
    reponses: string;
    rendez_vous: string;
    ventes: string;
    part_ecoulee: string;
    ecart_de_rythme: string;
  }>("select * from mesures_du_travail($1)", [tenantId]);

  if (row === undefined) return null;

  return {
    missionsOuvertes: Number(row.missions_ouvertes),
    missionsAgies: Number(row.missions_agies),
    reponses: Number(row.reponses),
    rendezVous: Number(row.rendez_vous),
    ventes: Number(row.ventes),
    partEcoulee: Number(row.part_ecoulee),
    ecartDeRythme: Number(row.ecart_de_rythme),
  };
}

/** Ce que le premier diagnostic avait constaté. Vide quand la configuration n'en vient pas. */
async function constatsDOrigine(
  sql: SqlClient,
  diagnosticSessionId: string | null,
): Promise<readonly Constat[]> {
  if (diagnosticSessionId === null) return [];

  return await sql.query<Constat>(
    `select genre, domaine, objet, source, confiance, libelle
       from audit_finding
      where diagnostic_session_id = $1
      order by created_at, id`,
    [diagnosticSessionId],
  );
}

/**
 * La raison, telle que le dirigeant la lira.
 *
 * Elle part de ce qui a été MESURÉ, pas de ce que le moteur en a conclu : « aucune réponse depuis
 * trois semaines » se vérifie, « le domaine communication_sortante est prioritaire » ne veut rien
 * dire pour quelqu'un qui dirige une entreprise.
 */
function raisonLisible(
  mesures: readonly Constat[],
  motifs: readonly string[],
): string {
  const observe = mesures.map((constat) => constat.libelle);
  const phrases = [...observe, ...motifs].filter((phrase) => phrase.trim().length > 0);
  return phrases.length === 0
    ? "Les résultats mesurés ce mois-ci justifient un ajustement."
    : phrases.join(" ");
}

async function journaliser(
  deps: ReevaluationDeps,
  employe: EmployeConfigure,
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
