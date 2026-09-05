/**
 * METIER-14 — la réflexion d'après-run : le seul moment où un employé écrit dans sa mémoire.
 *
 * ══ CE QUI MANQUAIT ══
 *
 * `learned_fact` existait, était lue à chaque pas, effacée avec l'entreprise, protégée par RLS —
 * et **rien ne l'écrivait jamais**. La couche « ce que vous avez appris en travaillant pour elle »
 * était donc structurellement vide : un employé recommençait chaque mission comme la première.
 * Le tri des faits (`@sentio/core`, `trierLesFaitsDUnRun`) était écrit et testé ; personne ne
 * l'appelait.
 *
 * ══ LA RÈGLE QUI COMMANDE CE FICHIER ══
 *
 * **La mémoire est un bonus, jamais une condition de succès.** Une réflexion qui échoue —
 * fournisseur en panne, quota épuisé, réponse illisible — journalise et se tait. Elle ne fait
 * jamais échouer la mission. Cette règle vient d'un incident réel : une tâche accomplie
 * rapportée comme échouée parce que la réflexion d'après-coup avait planté
 * (`docs/08-evolution-apprentissage.md`).
 *
 * ⚠️ **Ce n'est pas du ré-entraînement.** Aucun poids n'est modifié. L'employé progresse par ce
 * qu'il LIT au prochain run, ce qui rend l'évolution instantanée, réversible et lisible par le
 * client — trois propriétés qu'un ré-entraînement n'aurait pas.
 *
 * Réalise : METIER-14
 */

import { REGLAGES_RUNTIME_PAR_DEFAUT, type ReglagesRuntime } from "@sentio/config";
import {
  parseDna,
  textOf,
  trierLesFaitsDUnRun,
  type EmployeeDna,
  type JournalWriter,
  type ModelGateway,
} from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

/** La nature journalisée quand la réflexion a produit quelque chose — ou explicitement rien. */
export const REFLEXION_FAITE = "reflexion_faite";
/** La nature journalisée quand elle n'a pas pu avoir lieu. Jamais une erreur de mission. */
export const REFLEXION_SANS_SUITE = "reflexion_sans_suite";

export interface ReflexionDeps {
  readonly sql: SqlClient;
  readonly gateway: ModelGateway;
  readonly journal: JournalWriter;
  readonly reglages?: ReglagesRuntime;
}

export interface ReflexionInput {
  readonly tenantId: TenantId;
  readonly employeeId: EmployeeId;
  readonly taskId: TaskId;
  readonly dataClass: "real" | "synthetic";
  readonly envelope: string;
  readonly stepId?: string;
}

/**
 * La consigne de réflexion.
 *
 * ⚠️ Elle demande **ce qui servira la prochaine fois**, pas un compte rendu. La différence est
 * tout le sujet : « j'ai écrit à trois entreprises » est vrai et inutile ; « les dirigeants de ce
 * secteur répondent surtout le matin » change le travail suivant.
 *
 * Elle interdit aussi explicitement le fait inventé. Un modèle à qui l'on demande trois faits en
 * produit trois — y compris quand le run n'en a appris aucun. « Aucun fait » doit rester une
 * réponse normale et sans reproche, sinon la mémoire se remplit de vraisemblable.
 */
const CONSIGNE = [
  "Vous venez de terminer un travail pour cette entreprise.",
  "",
  "Retenez de 0 à 3 faits QUI SERVIRONT LA PROCHAINE FOIS. Un fait est une observation sur cette",
  "entreprise, ses interlocuteurs ou son marché — pas un résumé de ce que vous avez fait.",
  "",
  "N'inventez rien. Si ce travail n'a rien appris, rendez une liste vide : c'est une réponse",
  "normale, et de loin la plus fréquente.",
  "",
  'Répondez UNIQUEMENT par un objet JSON de la forme : {"faits": ["...", "..."]}',
].join("\n");

/**
 * Relit le run terminé et écrit ce qu'il a appris.
 *
 * **Ne lève jamais.** Le seul contrat de cette fonction envers l'appelant est de rendre la main.
 */
export async function reflechirApresLeRun(
  deps: ReflexionDeps,
  input: ReflexionInput,
): Promise<void> {
  const reglages = deps.reglages ?? REGLAGES_RUNTIME_PAR_DEFAUT;

  try {
    const dna = await chargerLAdn(deps.sql, input.tenantId, input.employeeId);
    if (dna === null) {
      await taire(deps, input, "adn_illisible", "L'ADN de cet employé ne se lit pas.");
      return;
    }

    const faitsConnus = await chargerLesFaits(deps.sql, input.tenantId, input.employeeId);
    const journalDuRun = await resumerLeRun(deps.sql, input.tenantId, input.taskId);

    if (journalDuRun.length === 0) {
      // Un run sans le moindre événement n'a rien à apprendre. Interroger le modèle coûterait un
      // appel pour lui faire inventer quelque chose.
      await taire(deps, input, "run_vide", "Aucun événement à relire.");
      return;
    }

    const resultat = await deps.gateway.complete({
      turns: [
        { role: "system", type: "text", text: CONSIGNE },
        { role: "user", type: "text", text: journalDuRun.join("\n") },
      ],
      dataClass: input.dataClass,
      envelope: input.envelope,
      tenantId: input.tenantId,
    });

    const propositions = lireLesFaits(textOf([resultat.turn]));
    if (propositions === null) {
      await taire(deps, input, "reponse_illisible", "La réflexion n'a pas rendu de JSON lisible.");
      return;
    }

    const tri = trierLesFaitsDUnRun({
      propositions,
      dna,
      faitsConnus,
      maximum: reglages.faitsMaxParRun,
    });

    for (const fait of tri.retenus) {
      await deps.sql.query(
        // ⚠️ L'auteur est « apprentissage », jamais « client » ni « sentio ». Un fait déduit
        // d'un run ne doit pas se lire comme une déclaration du dirigeant : c'est lui qui doit
        // pouvoir contredire ce que son employé a cru comprendre, pas l'inverse.
        `insert into learned_fact (tenant_id, employee_id, source_task_id, fact, author, status)
         values ($1, $2, $3, $4, 'apprentissage', 'actif')`,
        [input.tenantId, input.employeeId, input.taskId, fait],
      );
    }

    await deps.journal.append({
      tenantId: input.tenantId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      kind: REFLEXION_FAITE,
      ...(input.stepId !== undefined && { stepId: input.stepId }),
      // Les écartés sont journalisés AVEC leur raison : une mémoire qui ne retient rien doit
      // pouvoir s'expliquer, sinon on ne saura jamais si le filtre est trop strict ou le modèle
      // trop bavard.
      payload: { retenus: tri.retenus, ecartes: tri.ecartes },
    });
  } catch (error) {
    await taire(deps, input, "erreur", String(error));
  }
}

/**
 * Journalise l'absence de réflexion — et n'échoue pas non plus si le journal échoue.
 *
 * C'est la dernière ligne de la règle : rien, dans ce fichier, ne peut faire remonter une erreur
 * à une mission déjà accomplie.
 */
async function taire(
  deps: ReflexionDeps,
  input: ReflexionInput,
  raison: string,
  detail: string,
): Promise<void> {
  try {
    await deps.journal.append({
      tenantId: input.tenantId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      kind: REFLEXION_SANS_SUITE,
      ...(input.stepId !== undefined && { stepId: input.stepId }),
      payload: { raison, detail },
    });
  } catch {
    // Volontairement muet. Une réflexion qui n'a pas pu être écrite ne doit pas devenir une
    // panne de mission — c'est exactement l'incident que cette règle existe pour empêcher.
  }
}

async function chargerLAdn(
  sql: SqlClient,
  tenantId: TenantId,
  employeeId: EmployeeId,
): Promise<EmployeeDna | null> {
  const [ligne] = await sql.query<{ dna: unknown }>(
    `select d.dna from employee e
       join employee_definition d on d.id = e.employee_definition_id
      where e.tenant_id = $1 and e.id = $2`,
    [tenantId, employeeId],
  );
  if (ligne === undefined) return null;
  try {
    return parseDna(ligne.dna);
  } catch {
    return null;
  }
}

async function chargerLesFaits(
  sql: SqlClient,
  tenantId: TenantId,
  employeeId: EmployeeId,
): Promise<readonly string[]> {
  const lignes = await sql.query<{ fact: string }>(
    `select fact from learned_fact
      where tenant_id = $1 and employee_id = $2 and status = 'actif'`,
    [tenantId, employeeId],
  );
  return lignes.map((ligne) => ligne.fact);
}

/**
 * Ce que le run a produit, en clair.
 *
 * ⚠️ Les charges utiles ne sont PAS transmises telles quelles : elles contiennent des
 * identifiants techniques et des entrées de moteur dont un modèle n'a que faire, et dont
 * certaines sont des données personnelles (`docs/10-securite-rgpd.md`, collecte minimale). On
 * transmet la suite des natures d'événements et les raisons — de quoi dire ce qui s'est passé,
 * pas de quoi reconstituer un fichier client.
 */
async function resumerLeRun(
  sql: SqlClient,
  tenantId: TenantId,
  taskId: TaskId,
): Promise<readonly string[]> {
  const lignes = await sql.query<{ kind: string; payload: Record<string, unknown> | null }>(
    `select kind, payload from execution_event
      where tenant_id = $1 and task_id = $2 order by created_at, id`,
    [tenantId, taskId],
  );

  return lignes.map((ligne) => {
    const motif = ligne.payload?.["rationale"] ?? ligne.payload?.["motif"];
    return typeof motif === "string" ? `${ligne.kind} : ${motif}` : ligne.kind;
  });
}

/** Une réponse illisible rend `null`. Jamais une liste vide : « vide » est une réponse valide. */
function lireLesFaits(texte: string): readonly string[] | null {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;

  let lu: unknown;
  try {
    lu = JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return null;
  }

  if (typeof lu !== "object" || lu === null || Array.isArray(lu)) return null;
  const faits = (lu as Record<string, unknown>)["faits"];
  if (!Array.isArray(faits)) return null;

  // Un élément non textuel n'est pas converti « au mieux » : on refuse la réponse entière. Un
  // objet transformé en « [object Object] » deviendrait un fait appris parfaitement absurde.
  if (!faits.every((fait): fait is string => typeof fait === "string")) return null;

  return faits;
}
