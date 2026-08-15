/**
 * EXEC-03 — le contexte du pas courant.
 *
 * ══ QUI FAIT QUOI ══
 *
 * `assembleContext` (`@sentio/core`) est une fonction **pure** : elle ne connaît ni base, ni
 * réseau, ni horloge. Elle reçoit des données et rend des tours de conversation. Ce fichier est
 * son fournisseur : il lit ce qu'il faut dans Postgres, puis passe le tout au moteur.
 *
 * L'inverse — un accès Postgres dans le moteur — ferait perdre les deux propriétés qui rendent
 * `packages/core` utile : testable sans infrastructure, et déplaçable sans réécriture
 * (`docs/02-architecture.md`). C'est pourquoi ce chargeur vit dans `apps/worker`, le seul
 * composant qui connaît à la fois le noyau et la base.
 *
 * ══ LA RÈGLE QUI PRIME SUR TOUT ══
 *
 * **Aucune couche n'est inventée, supposée, ni complétée d'office.** Ce qui manque manque, et
 * se dit. Concrètement :
 *
 *   · ce qui rend le travail IMPOSSIBLE (tâche, employé, ADN, objectif) fait échouer le
 *     chargement, avec le nom de ce qui manque — jamais une valeur générique de remplacement ;
 *   · ce qui rend le travail MOINS BON (profil sectoriel, contexte entreprise, faits appris)
 *     laisse la couche vide et la déclare dans `couchesAbsentes`, pour qu'elle soit journalisée.
 *
 * Un objectif inventé enverrait un employé travailler sur un but que son client n'a jamais
 * formulé. Un secteur inventé le ferait parler d'un métier qu'il ne connaît pas. Les deux sont
 * pires que l'arrêt.
 *
 * ══ ISOLATION ══
 *
 * Toutes les lectures d'entreprise passent par `forTenant(sql, TenantScope.of(tenantId))`. Il
 * n'existe aucun autre chemin vers les tables client (`packages/db`, `forTenant`), et la portée
 * n'est donc pas une discipline de ce fichier : c'est une propriété de l'accès lui-même.
 * `sector_profile` et `employee_definition` sont les seules lectures globales — ce sont aussi les
 * seules tables sans `tenant_id`, écrites par Sentio et par personne d'autre (`docs/adr/0011`).
 *
 * Réalise : EXEC-03
 */

import {
  assembleContext,
  parseDna,
  parseSectorKnowledge,
  reconstruireEtatRun,
  ACTION_EXECUTEE,
  type AssembledContext,
  type EtatRun,
  type SectorKnowledge,
} from "@sentio/core";
import { ExecutionJournal, TenantScope, forTenant, globalRepositories, type SqlClient } from "@sentio/db";
import type { CompanyProfileEntry, LearnedFact } from "@sentio/domain";

/** Ce qui manque pour travailler. Nommé, jamais remplacé. */
export interface Manque {
  readonly quoi:
    | "tache"
    | "employe"
    | "adn"
    | "objectif"
    | "journal_incoherent"
    | "run_non_reprenable";
  readonly detail: string;
}

export type ChargementContexte =
  | {
      readonly ok: true;
      readonly contexte: AssembledContext;
      readonly etat: EtatRun;
      /** Les couches qui n'avaient rien à dire. À journaliser : une absence tue ressemble à un
       *  branchement oublié. */
      readonly couchesAbsentes: readonly string[];
      /** L'objectif visé, en clair. Rendu pour la trace (EXEC-07) : « pourquoi ? » commence par
       *  « pour quoi ? ». */
      readonly objectif: string;
    }
  | { readonly ok: false; readonly manques: readonly Manque[] };

/** Clé de `company_profile` où le client déclare son secteur. */
const CLE_SECTEUR = "secteur";

/**
 * Choisit le profil sectoriel à injecter.
 *
 * ⚠️ Version minimale et assumée comme telle. La vraie sélection — moteur déterministe, message
 * honnête quand aucun profil ne correspond — est `ACQUIS-24`, qui n'est pas faite. Ici : le
 * client a déclaré un secteur dans son contexte entreprise, et un profil publié porte ce nom,
 * ou bien il n'y a pas de couche sectorielle. Aucun rapprochement approximatif, aucun secteur
 * « par défaut » : un profil sectoriel appliqué au mauvais métier est pire que pas de profil.
 */
async function chargerSecteur(
  sql: SqlClient,
  profil: readonly CompanyProfileEntry[],
): Promise<SectorKnowledge | undefined> {
  const declare = profil.find((entree) => entree.status === "actif" && entree.key === CLE_SECTEUR);
  if (declare === undefined) return undefined;

  const secteur = typeof declare.value === "string" ? declare.value.trim() : "";
  if (secteur === "") return undefined;

  const publies = await globalRepositories(sql).sectorProfile.list({ sector: secteur });
  if (publies.length === 0) return undefined;

  // La version la plus récente : les profils se publient, ils ne se modifient pas.
  const dernier = publies.slice().sort((a, b) => b.version - a.version)[0];
  return dernier === undefined ? undefined : parseSectorKnowledge(dernier.content);
}

/** Ce que le run a déjà accompli, tiré du seul journal — jamais d'un état gardé en mémoire. */
function dejaFait(evenements: readonly { kind: string; payload: unknown }[]): string[] {
  return evenements
    .filter((e) => e.kind === ACTION_EXECUTEE)
    .map((e) => {
      const charge = e.payload as { resume?: unknown } | null;
      return typeof charge?.resume === "string" ? charge.resume : "une action, non résumée";
    });
}

/**
 * Charge et assemble le contexte du pas courant d'une tâche.
 *
 * Le résultat est **déterministe** pour un même état persistant : toutes les lectures sont
 * ordonnées, la reconstruction du run trie sur `seq` (EXEC-02), et le classement des faits appris
 * est celui d'`assembleContext`. Aucune horloge, aucun aléa n'entre dans l'assemblage.
 */
export async function loadStepContext(
  sql: SqlClient,
  input: { tenantId: string; taskId: string; maxLearnedFacts?: number },
): Promise<ChargementContexte> {
  const scope = TenantScope.of(input.tenantId);
  const repos = forTenant(sql, scope);
  const manques: Manque[] = [];

  // ── La tâche, et par elle l'employé. `forTenant` borne la lecture : une tâche d'une autre
  //    entreprise est introuvable, pas « trouvée puis refusée ».
  const tache = await repos.task.findById(input.taskId);
  if (tache === null) {
    return {
      ok: false,
      manques: [
        {
          quoi: "tache",
          detail: `Aucune tâche ${input.taskId} pour cette entreprise.`,
        },
      ],
    };
  }

  const employe = await repos.employee.findById(tache.employeeId);
  if (employe === null) {
    manques.push({
      quoi: "employe",
      detail: `La tâche ${input.taskId} désigne un employé introuvable pour cette entreprise.`,
    });
    return { ok: false, manques };
  }

  // ── Couche 1 — l'ADN. Global et immuable : il ne porte aucune donnée client, et une lecture
  //    hors portée d'entreprise est ici correcte (`packages/db`, `globalRepositories`).
  const definition = await globalRepositories(sql).employeeDefinition.findById(
    employe.employeeDefinitionId,
  );
  if (definition === null) {
    manques.push({
      quoi: "adn",
      detail: `L'employé ${employe.id} pointe un ADN introuvable : son métier n'est plus défini.`,
    });
    return { ok: false, manques };
  }
  // `parseDna` refuse un ADN sans périmètre ni limites. On le laisse lever : un ADN illisible
  // n'est pas une couche absente, c'est un employé sans frontières.
  const dna = parseDna(definition.dna);

  // ── Couches 3 et 4 — le contexte de CETTE entreprise. Bornées par `scope`, sans exception.
  // Casse du domaine : `forTenant` traduit vers les colonnes (`packages/db`, `naming.ts`).
  const profil = (await repos.companyProfile.list({ status: "actif" })) as CompanyProfileEntry[];
  // Bornés à CET employé : les faits appris d'un autre employé de la même entreprise ne sont pas
  // les siens, et une mémoire partagée par erreur est une fuite interne.
  const faits = (await repos.learnedFact.list({
    status: "actif",
    employeeId: employe.id,
  })) as LearnedFact[];

  // ── Couche 2 — le secteur. Facultative par construction.
  const secteur = await chargerSecteur(sql, profil);

  // ── Couche 5 — l'objectif et l'état du run.
  //
  // ⚠️ `state = 'actif'` n'est pas un détail de requête. Sans ce filtre, un objectif ATTEINT ou
  // RETIRÉ comptait encore comme « déclaré » : l'employé continuait de travailler vers un but que
  // son client venait de retirer, et le contexte du modèle citait cette cible comme si elle tenait
  // toujours. Le défaut date de `20260806120003`, qui a donné un état aux objectifs sans que ce
  // chemin de lecture le reprenne.
  //
  // Une entreprise n'en porte qu'un actif (`20260815120002`) : la liste rend donc zéro ou une
  // ligne, et « lequel » ne se pose plus.
  const objectifs = await repos.objective.list({ state: "actif" });
  if (objectifs.length === 0) {
    manques.push({
      quoi: "objectif",
      detail:
        "Aucun objectif actif dans cette entreprise. Le moteur n'en invente pas : un employé " +
        "lancé sur un but que son client n'a jamais formulé — ou qu'il vient de retirer — " +
        "travaille pour personne.",
    });
  }

  const journal = new ExecutionJournal(sql, scope);
  const evenements = await journal.forTask(input.taskId);
  const reconstruction = reconstruireEtatRun(evenements);
  if (!reconstruction.ok) {
    manques.push({
      quoi: "journal_incoherent",
      detail: `Le journal de la tâche ${input.taskId} ne peut pas être relu : ${reconstruction.anomalies
        .map((a) => a.detail)
        .join(" | ")}`,
    });
  }

  if (manques.length > 0) return { ok: false, manques };

  const etat = (reconstruction as { ok: true; etat: EtatRun }).etat;

  // L'objectif COURANT est le dernier déclaré. Le départage par identifiant n'est pas une
  // coquetterie : deux objectifs posés dans la même transaction partagent `created_at` (le même
  // piège qu'EXEC-02 sur le journal), et sans lui deux chargements du même état pourraient
  // rendre deux objectifs différents.
  //
  // ⚠️ DETTE CONNUE — `docs/16-compromis.md` C14, résolution `EXEC-16`. Le départage rend le
  // choix STABLE, il ne le rend pas JUSTE : entre deux objectifs du même instant, celui qui
  // gagne est celui dont l'UUID trie en premier. Sans effet aujourd'hui — aucune entreprise n'a
  // plus d'un objectif — mais **la gestion de plusieurs objectifs simultanés ne peut pas être
  // considérée comme fiable tant que ce n'est pas résolu**, ni construite, ni promise.
  const objectif = objectifs
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))[0]!;

  const contexte = assembleContext({
    dna,
    ...(secteur !== undefined && { sector: secteur }),
    profile: profil,
    facts: faits,
    task: {
      objective: `${objectif.metric} — cible ${objectif.targetValue} (${objectif.horizon})`,
      done: dejaFait(evenements),
    },
    ...(input.maxLearnedFacts !== undefined && { maxLearnedFacts: input.maxLearnedFacts }),
  });

  return {
    ok: true,
    contexte,
    etat,
    couchesAbsentes: contexte.missingLayers,
    objectif: `${objectif.metric} — cible ${objectif.targetValue} (${objectif.horizon})`,
  };
}
