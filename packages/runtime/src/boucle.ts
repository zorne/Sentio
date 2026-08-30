/**
 * EXEC-12 — la boucle complète : de la file au journal, un pas à la fois.
 *
 * C'est ici que toutes les pièces écrites depuis `EXEC-01` deviennent **une machine qui tourne** :
 *
 *     file (verrou) → état relu → contexte → proposition → politique → effet → journal → suite
 *
 * ══ CE QUE CE MODULE GARANTIT, ET COMMENT ══
 *
 * | Garantie | Ce qui la tient — jamais ce module |
 * |---|---|
 * | deux exécutants ne prennent pas le même travail | `for update skip locked` (`file-de-travaux.ts`) |
 * | aucun effet extérieur produit deux fois | `unique (tenant_id, idempotency_key)` (EXEC-06) |
 * | un exécutant mort ne bloque pas un travail | le bail sur `locked_at` |
 * | aucune donnée ne franchit une entreprise | `TenantScope` sur chaque lecture (`adr/0013`) |
 *
 * Ce module ne défend aucune de ces propriétés lui-même. Il les **utilise**. C'est délibéré : une
 * garantie tenue par du JavaScript est une garantie qui tombe à la première course.
 *
 * ══ RIEN N'EST GARDÉ EN MÉMOIRE ENTRE DEUX PAS ══
 *
 * L'état est relu depuis le journal au début du pas, et **relu à nouveau** après, pour que la
 * décision de suite porte sur ce qui a réellement été écrit. Le recalculer de tête — « c'était 3,
 * j'ai fait un pas, donc 4 » — ferait diverger la mémoire du processus et la vérité du journal au
 * premier chemin oublié.
 *
 * Réalise : EXEC-12
 */

import { REGLAGES_RUNTIME_PAR_DEFAUT, type ReglagesRuntime } from "@sentio/config";
import {
  ATTENTION_REQUISE,
  RUN_DEMARRE,
  deciderLaSuite,
  executeDecidedAction,
  issueDepuisErreur,
  peutReprendre,
  reconstruireEtatRun,
  type CapabilityEngine,
  type CapabilityRegistry,
  type EffectLedger,
  type EtatRun,
  type FileDeTravaux,
  type IssueDuPas,
  type JournalWriter,
  type ManqueDOutil,
  type ModelGateway,
  type PasDuBattement,
  type PolicyEngine,
  type ResultatExecution,
  type TravailPris,
} from "@sentio/core";
import { ExecutionJournal, TenantScope, type SqlClient } from "@sentio/db";
import type { TaskId, TenantId } from "@sentio/domain";

/**
 * Ce que la boucle rapporte — distinct du compte rendu du battement, et c'est délibéré.
 *
 * La boucle DIT ce qu'elle a fait ; elle ne JUGE pas. Le verdict « normal / anormal » se calcule
 * en connaissant aussi l'approvisionnement et la reprise, donc dans la composition. Mêler les deux
 * ici obligerait la boucle à connaître des choses qu'elle n'exécute pas.
 */
export interface RapportDeBoucle {
  readonly traites: number;
  readonly echoues: number;
  /** Ce que chaque pas a produit, par motif. Sans lui, un report ressemble à un succès. */
  readonly motifs: Readonly<Record<string, number>>;
  /**
   * Ce que chaque pas a produit, **rattaché à son employé**.
   *
   * ⚠️ POURQUOI PAS SEULEMENT LES COMPTES. « Du travail se fait-il ? » ne se répond pas au niveau
   * du battement : dix entreprises qui travaillent et une onzième totalement bloquée rendent des
   * compteurs rassurants. Le compteur suit donc UN EMPLOYÉ, et c'est ce détail qui le permet.
   *
   * ⚠️ **CES LIGNES NE SORTENT PAS DU PROCESSUS.** Elles portent des identifiants d'entreprise :
   * la composition les consomme et ne les fait suivre ni au compte rendu HTTP, ni au journal
   * d'exploitation. Un rapport rendu à un planificateur n'a pas à savoir qui sont nos clients.
   */
  readonly pas: readonly PasDuBattement[];
}
import { atteler, EntreeRefusee } from "./attelage.js";
import { decideNextStep } from "./next-step.js";
import { reflechirApresLeRun } from "./reflexion.js";
import { appliquerLaSuite } from "./suite-du-run.js";

export interface BoucleDeps {
  readonly sql: SqlClient;
  readonly file: FileDeTravaux;
  readonly journal: JournalWriter;
  readonly gateway: ModelGateway;
  readonly policy: PolicyEngine;
  readonly registry: CapabilityRegistry;
  readonly ledger: EffectLedger;
  /** Résout le moteur d'une capacité pour CETTE entreprise (`capability_binding`, NOYAU-18). */
  readonly moteurPour: (tenantId: TenantId, capabilityKey: string) => Promise<CapabilityEngine>;
  readonly reglages?: ReglagesRuntime;
}

export interface OptionsDeBoucle {
  /** Qui prend le travail. Sert au diagnostic : « quel exécutant tenait ce verrou ? ». */
  readonly prisPar: string;
  /**
   * ⚠️ FACULTATIF, ET SON ABSENCE EST LE CAS DE PRODUCTION.
   *
   * Deux usages vivaient sous ce nom, et les confondre a coûté un défaut :
   *
   *   · **prendre un travail** — comparer une échéance posée par la BASE. C'est là que mélanger
   *     l'horloge du processus et celle de Postgres faisait sauter des travaux dus (voir
   *     `PostgresFileDeTravaux.prendre`). Omis, la base tranche seule ;
   *   · **décider la suite** — arithmétique de cadence, sans aucune comparaison à la base. Elle
   *     n'a jamais été en cause, et son comportement ne change pas.
   *
   * Fourni, c'est un instant CHOISI : les suites qui déplacent le temps — bail expiré, « rien
   * n'est dû » — en ont besoin, et elles seules.
   */
  readonly maintenant?: Date;
  /** Borne d'un battement. Sans elle, un battement pourrait tourner sans fin. */
  readonly maxTravaux?: number;
  /**
   * Classe de données traitées pendant ce battement.
   *
   * ⚠️ **OBLIGATOIRE, ET CE N'ÉTAIT PAS LE CAS.** Ce champ était facultatif et retombait sur
   * `real` par un `??`. Le défaut était le bon — `real` est la valeur prudente, c'est `synthetic`
   * qui abaisse la garde du Gateway — mais il était **invisible** : `composition.ts` ne le passait
   * pas, et personne ne pouvait dire, en lisant le montage, dans quelle classe l'exécutant
   * tournait.
   *
   * Le rendre obligatoire déplace la garantie du runtime vers le COMPILATEUR : aucun appelant,
   * présent ou futur, ne peut plus hériter d'une classe de données sans l'avoir écrite.
   */
  readonly dataClass: "real" | "synthetic";
  readonly envelope?: string;
}

/**
 * Vide la file, un travail à la fois, jusqu'à épuisement ou jusqu'à la borne du battement.
 *
 * **Un travail cassé n'arrête pas les autres.** Une exception est comptée, journalisée, et la
 * boucle continue : un battement qui s'interromprait au premier incident laisserait tous les
 * travaux suivants à l'arrêt, et l'incident d'une entreprise deviendrait la panne de toutes.
 */
export async function executerLesTravauxDus(
  deps: BoucleDeps,
  options: OptionsDeBoucle,
): Promise<RapportDeBoucle> {
  const reglages = deps.reglages ?? REGLAGES_RUNTIME_PAR_DEFAUT;
  const maxTravaux = options.maxTravaux ?? reglages.travauxMaxParBattement;
  let traites = 0;
  let echoues = 0;
  /** Ce que chaque pas a produit, par motif. Sans ce compte, un report ressemble à un succès. */
  const motifs: Record<string, number> = {};
  /** Le même détail, rattaché à son employé : c'est ce que le compteur relit. */
  const pas: PasDuBattement[] = [];

  for (let i = 0; i < maxTravaux; i++) {
    // ⚠️ `maintenant` est passé TEL QUEL, `undefined` compris : c'est ainsi que la base devient
    // l'horloge en production. Y substituer `new Date()` ici rétablirait exactement le défaut.
    const travail = await deps.file.prendre({
      pris_par: options.prisPar,
      ...(options.maintenant !== undefined && { maintenant: options.maintenant }),
    });
    // Plus rien de dû : le cas le plus fréquent, et pas une erreur.
    if (travail === null) break;

    try {
      // ⚠️ LE MOTIF EST COMPTÉ, PAS SEULEMENT LE PASSAGE. « Traité » disait seulement qu'aucune
      // exception n'avait été levée : un run reporté faute de fournisseur conforme comptait donc
      // comme un succès, et le compte rendu annonçait `{traites:N, echoues:0}` pendant que rien
      // n'aboutissait. Un rapport rassurant et faux, toutes les dix minutes. C'est le motif qui
      // dit si quelque chose a AVANCÉ.
      const issue = await executerUnPas(deps, options, travail);
      motifs[issue.motif] = (motifs[issue.motif] ?? 0) + 1;
      pas.push({
        tenantId: travail.tenantId,
        employeeId: travail.employeeId,
        motif: issue.motif,
        manque: issue.manque,
      });
      traites += 1;
    } catch (erreur) {
      echoues += 1;
      // ⚠️ COMPTÉ COMME UN PAS, ET SANS ABOUTISSEMENT. Une interruption laissée hors du relevé
      // rendrait un employé dont TOUS les pas plantent indistinct d'un employé qui n'avait rien à
      // faire — c'est-à-dire silencieux au moment où il faut crier.
      pas.push({
        tenantId: travail.tenantId,
        employeeId: travail.employeeId,
        motif: "pas_interrompu",
        manque: null,
      });
      // ⚠️ Le travail n'est PAS remis en file ici. Son bail expirera, et un exécutant le
      // reprendra — en comptant la reprise. Le remettre tout de suite ferait tourner en boucle
      // serrée une mission qui échoue à chaque fois, sans que le compteur de reprises ne bouge.
      await deps.journal.append({
        tenantId: travail.tenantId,
        taskId: travail.taskId,
        employeeId: travail.employeeId,
        kind: ATTENTION_REQUISE,
        payload: { motif: "pas_interrompu", detail: String(erreur) },
      });
    }
  }

  return { traites, echoues, motifs, pas };
}

/** L'état du run, relu depuis le journal. Jamais gardé, jamais recalculé de tête. */
async function relire(
  sql: SqlClient,
  tenantId: TenantId,
  taskId: TaskId,
): Promise<{ ok: true; etat: EtatRun } | { ok: false; detail: string }> {
  const journal = new ExecutionJournal(sql, TenantScope.of(tenantId));
  const reconstruction = reconstruireEtatRun(await journal.forTask(taskId));
  if (reconstruction.ok) return { ok: true, etat: reconstruction.etat };
  return {
    ok: false,
    detail: reconstruction.anomalies.map((anomalie) => anomalie.detail).join(" | "),
  };
}

/**
 * Un pas, sur un travail déjà pris.
 *
 * L'ordre des trois contrôles d'entrée n'est pas indifférent : chacun coûte moins cher que le
 * suivant, et surtout, aucun n'appelle le modèle. Un travail incohérent, à l'arrêt, ou empoisonné
 * ne doit pas consommer une seule requête payante avant d'être écarté.
 */
async function executerUnPas(
  deps: BoucleDeps,
  options: OptionsDeBoucle,
  travail: TravailPris,
): Promise<{ readonly motif: string; readonly manque: ManqueDOutil | null }> {
  const reglages = deps.reglages ?? REGLAGES_RUNTIME_PAR_DEFAUT;
  const { tenantId, taskId, employeeId } = travail;

  // ── 1. Une mission qui tue l'exécutant le tuera aussi la fois suivante.
  if (travail.reprises >= reglages.repriseMaxApresInterruption) {
    await arreterPourHumain(
      deps,
      travail,
      "reprises_epuisees",
      `Cette mission a été reprise ${travail.reprises} fois sans aboutir : elle n'est plus rejouée.`,
    );
    return { motif: "reprises_epuisees", manque: null };
  }

  // ── 2. Un journal incohérent ne rend pas un état, et on ne devine pas à sa place (EXEC-02).
  const avant = await relire(deps.sql, tenantId, taskId);
  if (!avant.ok) {
    await arreterPourHumain(deps, travail, "journal_incoherent", avant.detail);
    return { motif: "journal_incoherent", manque: null };
  }

  // ── 3. Le journal fait foi : s'il dit que ce run ne peut pas reprendre, la file avait tort.
  //    On la remet d'accord avec lui plutôt que de travailler sur un état que personne n'assume.
  if (!peutReprendre(avant.etat)) {
    await remettreLaFileDaccord(deps, travail, avant.etat);
    return { motif: "file_remise_d_accord", manque: null };
  }

  // ── Le premier événement de toute mission, sans exception. Sans lui, la reconstruction du pas
  //    suivant refuse le journal entier (« un événement survient avant tout démarrage »).
  if (avant.etat.phase === "jamais_demarre") {
    await deps.journal.append({
      tenantId,
      taskId,
      employeeId,
      kind: RUN_DEMARRE,
      payload: { prisPar: options.prisPar },
    });
  }

  // ── EXEC-11 — le client a tranché, et il a dit oui.
  //
  // ⚠️ On N'APPELLE PAS le modèle. L'action qu'il a proposée est déjà écrite au journal, et c'est
  // ELLE que le client a autorisée — pas « une action de ce genre ». La reproposer laisserait le
  // modèle en écrire une autre, que la politique suspendrait de nouveau : le client dirait oui
  // indéfiniment sans que rien ne parte. C'était le défaut trouvé par la répétition générale.
  const issue =
    avant.etat.actionEnAttente !== null
      ? await reprendreLActionAutorisee(deps, travail, avant.etat.actionEnAttente)
      : await unPasDeDecision(deps, options, travail);

  // ── L'état relu APRÈS le pas : c'est lui qui porte le pas qu'on vient d'écrire, donc le budget
  //    réellement consommé. Le déduire ferait diverger la mémoire du processus et le journal.
  const apres = await relire(deps.sql, tenantId, taskId);
  if (!apres.ok) {
    await arreterPourHumain(deps, travail, "journal_incoherent", apres.detail);
    return { motif: "journal_incoherent", manque: null };
  }

  // ⚠️ ICI, L'HORLOGE DU PROCESSUS RESTE LA BONNE. `deciderLaSuite` calcule une échéance future
  // — de l'arithmétique de cadence, jamais une comparaison à une valeur venue de la base. C'est
  // l'autre usage de `maintenant`, celui qui n'a jamais été en cause : son comportement ne change
  // pas, et ce lot ne touche à aucun comportement métier.
  const suite = deciderLaSuite({
    issue,
    etat: apres.etat,
    reglages,
    maintenant: options.maintenant ?? new Date(),
  });

  await appliquerLaSuite(
    { journal: deps.journal, file: deps.file },
    { tenantId, taskId, employeeId, suite },
  );

  // ── La réflexion, une fois le travail FINI et rendu à la file.
  //
  // ⚠️ Après `appliquerLaSuite`, jamais avant : la mission est déjà close et son verrou rendu,
  // donc rien de ce qui suit ne peut la retenir ni la faire échouer. C'est la traduction en code
  // de « la mémoire est un bonus, jamais une condition de succès ».
  //
  // Et seulement sur un run TERMINÉ : réfléchir sur un run reporté ou suspendu ferait retenir
  // des conclusions tirées d'un travail à moitié fait.
  if (suite.kind === "terminer" && suite.issue === "termine") {
    await reflechirApresLeRun(
      { sql: deps.sql, gateway: deps.gateway, journal: deps.journal, reglages },
      {
        tenantId,
        taskId,
        employeeId,
        dataClass: options.dataClass,
        envelope: options.envelope ?? "sold_employees",
      },
    );
  }

  // ⚠️ LE MANQUE VOYAGE AVEC LE MOTIF, ET IL S'ARRÊTERAIT ICI SANS CETTE LIGNE. C'est le dernier
  // maillon du fil qui distingue « le dirigeant peut l'activer » de « nous devons le monter ».
  return { motif: suite.motif, manque: suite.kind === "attendre_humain" ? suite.manque : null };
}

/**
 * Le pas lui-même : proposer, décider, exécuter.
 *
 * `TaskDeferred` est la seule erreur rattrapée — un plafond atteint est un **report**, pas une
 * panne (NOYAU-07). Tout le reste remonte : avaler une erreur de fournisseur ou un routage non
 * conforme les transformerait en « le modèle n'a rien proposé », c'est-à-dire en travail
 * silencieusement non fait.
 */
/**
 * Exécute l'action que le client vient d'autoriser.
 *
 * ══ POURQUOI LA POLITIQUE N'EST PAS RECONSULTÉE ══
 *
 * Ce n'est pas un contournement : **l'accord EST la décision de politique**. La repasser au
 * moteur reviendrait à redemander au client ce qu'il vient d'accorder.
 *
 * Mais on ne se fie pas au journal seul pour l'affirmer : l'accord est **relu en base** avant
 * d'exécuter. Le journal dit ce qui s'est passé ; la table dit ce qui est vrai maintenant. Si
 * l'accord a été révoqué entre-temps, rien ne part.
 */
/**
 * Le moteur d'une capacité, **attelé à cette mission**.
 *
 * ⚠️ C'est ici que la cible d'une action est fixée, et elle vient de la base : le sujet de la
 * mission, relu au moment d'agir. Le modèle n'a écrit que le geste. Sans cet attelage,
 * `execute-action.ts` passerait au moteur l'entrée brute du modèle — c'est-à-dire lui laisserait
 * désigner sur qui agir (`attelage.ts`).
 *
 * Le sujet est relu à chaque action plutôt que porté par `TravailPris` : une lecture de plus sur
 * une ligne déjà verrouillée coûte peu, et la faire ici garde le port de la file inchangé pour
 * tous ceux qui n'agissent pas.
 */
function moteurAttele(
  deps: BoucleDeps,
  travail: TravailPris,
): (capabilityKey: string) => Promise<{ execute: (input: unknown) => Promise<unknown> }> {
  return async (capabilityKey: string) => {
    const moteur = await deps.moteurPour(travail.tenantId, capabilityKey);

    const [mission] = await deps.sql.query<{ subject_kind: string; subject_id: string }>(
      "select subject_kind, subject_id from task where tenant_id = $1 and id = $2",
      [travail.tenantId, travail.taskId],
    );
    if (mission === undefined) {
      throw new EntreeRefusee(
        "La mission a disparu entre sa prise et son exécution : rien n'est exécuté sans savoir " +
          "sur quoi.",
      );
    }

    return atteler(moteur, capabilityKey, {
      tenantId: travail.tenantId,
      employeeId: travail.employeeId,
      taskId: travail.taskId,
      sujetKind: mission.subject_kind,
      sujetId: mission.subject_id,
    });
  };
}

async function reprendreLActionAutorisee(
  deps: BoucleDeps,
  travail: TravailPris,
  proposition: unknown,
): Promise<IssueDuPas> {
  const accords = await deps.sql.query<{ state: string }>(
    `select state from approval
      where tenant_id = $1 and task_id = $2
      order by requested_at desc limit 1`,
    [travail.tenantId, travail.taskId],
  );

  if (accords[0]?.state !== "granted") {
    return {
      kind: "contexte_incomplet",
      detail:
        "accord : le journal porte un accord accordé, la base non. Rien n'est exécuté — un " +
        "accord révoqué entre-temps ne doit pas laisser partir l'action qu'il couvrait.",
    };
  }

  const decision = {
    kind: "agir" as const,
    proposition: proposition as never,
    decision: { outcome: "allow" as const, notify: true, basis: "accord_ponctuel" as const },
  };

  try {
    const execution = await executeDecidedAction(
      {
        registry: deps.registry,
        ledger: deps.ledger,
        engineFor: moteurAttele(deps, travail),
      },
      {
        tenantId: travail.tenantId,
        taskId: travail.taskId,
        employeeId: travail.employeeId,
        decision,
      },
    );
    return { kind: "decision", decision, execution };
  } catch (erreur) {
    const report = issueDepuisErreur(erreur);
    if (report !== null) return report;
    throw erreur;
  }
}

async function unPasDeDecision(
  deps: BoucleDeps,
  options: OptionsDeBoucle,
  travail: TravailPris,
): Promise<IssueDuPas> {
  try {
    const resultat = await decideNextStep(
      deps.sql,
      {
        gateway: deps.gateway,
        policy: deps.policy,
        registry: deps.registry,
        journal: deps.journal as Parameters<typeof decideNextStep>[1]["journal"],
      },
      {
        tenantId: travail.tenantId,
        taskId: travail.taskId,
        employeeId: travail.employeeId,
        dataClass: options.dataClass,
        envelope: options.envelope ?? "sold_employees",
      },
    );

    if (!resultat.ok) {
      if (resultat.raison === "aucune_capacite_applicable") {
        // ⚠️ Un motif à part, jamais `echec_definitif`. Le dirigeant PEUT y remédier — c'est la
        // seule information qui rend ce blocage actionnable, et la perdre reviendrait à laisser
        // une mission mourir sans que personne ne sache qu'il lui manquait un outil.
        return {
          kind: "capacite_absente",
          sujetKind: resultat.sujetKind,
          // La cause vient du filtre, qui SAIT laquelle de ses deux conditions a vidé la liste.
          // La recalculer ici la ferait diverger de lui au premier changement.
          cause: resultat.cause,
          detail:
            `Cette mission porte sur « ${resultat.sujetKind} », et aucune capacité activée ne s'y ` +
            `applique. Activées : ${resultat.capacitesActives.join(", ") || "aucune"}.`,
        };
      }
      return {
        kind: "contexte_incomplet",
        detail: resultat.manques.map((manque) => `${manque.quoi} : ${manque.detail}`).join(" | "),
      };
    }

    let execution: ResultatExecution | null = null;
    if (resultat.decision.kind === "agir") {
      execution = await executeDecidedAction(
        {
          registry: deps.registry,
          ledger: deps.ledger,
          engineFor: moteurAttele(deps, travail),
        },
        {
          tenantId: travail.tenantId,
          taskId: travail.taskId,
          employeeId: travail.employeeId,
          decision: resultat.decision,
          stepId: resultat.stepId,
        },
      );
    }

    return { kind: "decision", decision: resultat.decision, execution };
  } catch (erreur) {
    const report = issueDepuisErreur(erreur);
    if (report !== null) return report;
    throw erreur;
  }
}

/** Arrête la mission et appelle une personne, sans jamais laisser le travail verrouillé. */
async function arreterPourHumain(
  deps: BoucleDeps,
  travail: TravailPris,
  motif: string,
  detail: string,
): Promise<void> {
  await deps.journal.append({
    tenantId: travail.tenantId,
    taskId: travail.taskId,
    employeeId: travail.employeeId,
    kind: ATTENTION_REQUISE,
    payload: { motif, detail },
  });
  await deps.file.mettreDeCote({
    tenantId: travail.tenantId,
    taskId: travail.taskId,
    motif: "attention_requise",
  });
}

/**
 * Le journal dit que ce run est fini, refusé, ou en attente ; la file le croyait dû.
 *
 * Ça arrive légitimement — un exécutant tué juste après avoir écrit le journal et avant d'avoir
 * touché la file (`suite-du-run.ts` documente précisément cet état). Le réparer ici est ce qui
 * rend cette interruption **réparable par répétition** : le battement suivant retombe sur la même
 * décision et la réapplique, au lieu de rejouer un travail que le journal a déjà refermé.
 */
async function remettreLaFileDaccord(
  deps: BoucleDeps,
  travail: TravailPris,
  etat: EtatRun,
): Promise<void> {
  const { tenantId, taskId } = travail;
  if (etat.phase === "attente_accord") {
    await deps.file.mettreDeCote({ tenantId, taskId, motif: "accord_attendu" });
    return;
  }
  if (etat.phase === "attention_requise") {
    await deps.file.mettreDeCote({ tenantId, taskId, motif: "attention_requise" });
    return;
  }
  await deps.file.retirer({
    tenantId,
    taskId,
    issue: etat.phase === "echoue" ? "echoue" : "termine",
  });
}
