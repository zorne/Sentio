/**
 * EXEC-02 — l'état métier d'un run, reconstruit depuis le journal.
 *
 * ══ LA DISTINCTION QUI STRUCTURE CE MODULE ══
 *
 *   · Le **journal** (`execution_event`, et sa lecture `reconstructTrace`) dit CE QUI S'EST
 *     PASSÉ. Il est en ajout seul, il fait foi, il ne s'interprète pas.
 *   · L'**état métier** (ici) dit CE QUE L'EMPLOYÉ EST EN TRAIN DE FAIRE. C'est une
 *     **projection** : elle se recalcule intégralement à chaque battement, elle n'est stockée
 *     nulle part, et rien ne la corrige à la main.
 *
 * Les deux ne se mélangent pas. Le journal ne porte aucun champ d'état ; l'état ne survit à
 * aucun battement. C'est ce qui rend vraie la promesse de `docs/05-runtime-employe.md` : « rien
 * n'est conservé en mémoire entre deux pas ». Un worker peut être tué à n'importe quel instant :
 * le battement suivant relit le journal et retrouve exactement le même état — pas un état
 * approchant, le même.
 *
 * ══ DÉTERMINISME ══
 *
 * L'ordre de lecture est `seq` (migration `20260806120001`), un compteur d'insertion attribué par
 * la base. Pas `created_at` : tous les événements d'une même transaction le partagent, et l'ordre
 * retombait alors sur un UUID aléatoire. Deux reconstructions du même journal rendent le même
 * état, quel que soit l'ordre dans lequel les lignes arrivent — un test le vérifie en mélangeant
 * l'entrée.
 *
 * ══ CE QU'ON REFUSE DE DEVINER ══
 *
 * Un journal incohérent ne rend **pas** un état : il rend ses anomalies, et rien d'autre. Le
 * refus est délibéré. Un run bloqué se voit et se corrige ; un run repris sur un état faux
 * envoie de vrais messages à de vrais prospects au nom d'un vrai client, et personne ne
 * s'aperçoit de rien. Entre les deux, le choix n'est pas difficile.
 *
 * **Ce qu'on ne peut PAS détecter, et qu'il faut dire :** un événement manquant ne se voit pas
 * directement. `seq` est un compteur global, donc il comporte naturellement des trous dans le
 * fil d'une tâche — un trou ne prouve rien. Ce qui se détecte, c'est ce qu'une disparition
 * PRODUIT : une transition impossible (un accord sans suspension, un run qui agit sans avoir
 * démarré, un événement après la fin). C'est une détection par les conséquences, pas par
 * l'inventaire, et elle attrape les cas qui comptent.
 *
 * Réalise : EXEC-02
 */

import type { JournalEntry } from "./trace.js";
import {
  ACCORD_ACCORDE,
  ACCORD_REFUSE,
  ACTION_DECIDEE,
  ACTION_ECHOUEE,
  ACTION_ENGAGEE,
  ACTION_EXECUTEE,
  NATURES_TERMINALES,
  POLITIQUE_SUSPEND,
  RUN_DEMARRE,
  RUN_ECHOUE,
  RUN_TERMINE,
  estNatureConnue,
} from "./vocabulaire.js";

/** Où en est l'employé. Jamais persisté : toujours recalculé. */
export type PhaseRun =
  /** Aucun événement : la tâche existe, le travail n'a pas commencé. */
  | "jamais_demarre"
  | "en_cours"
  | "attente_accord"
  | "termine"
  | "echoue";

export interface EtatRun {
  readonly phase: PhaseRun;
  /** Nombre d'actions réellement exécutées. Sert les bornes de pas, pas l'affichage client. */
  readonly actionsExecutees: number;
  /** Rang du dernier événement pris en compte. C'est le point de reprise : le battement suivant
   *  n'a rien à relire avant lui. `null` si le journal est vide. */
  readonly reprendreApres: number | null;
  /** L'action suspendue qui attend un accord, telle qu'elle a été journalisée. `null` hors
   *  `attente_accord`. C'est elle qu'un « approuver » exécutera — reconstruite depuis le
   *  journal, jamais gardée en mémoire entre deux battements. */
  readonly actionEnAttente: unknown;
  /** Clés d'idempotence déjà consommées : ce qui a été fait ne se refait pas. */
  readonly effetsDejaProduits: ReadonlySet<string>;
  /**
   * Effets **engagés sans résultat connu** — l'action a été réservée, puis plus rien.
   *
   * C'est l'état laissé par une interruption entre l'engagement et l'enregistrement du résultat,
   * et c'est le seul cas où l'on ne sait pas si le monde extérieur a bougé. Il n'est pas rendu
   * pour information : c'est lui qui interdit de réessayer un effet irréversible (EXEC-06).
   */
  readonly effetsEngagesSansResultat: ReadonlySet<string>;
}

export type NatureAnomalie =
  /** Un événement sans rang : la reconstruction n'a plus d'ordre sur lequel s'appuyer. */
  | "rang_absent"
  /** Deux événements de même rang : l'ordre devient ambigu, donc la reprise non déterministe. */
  | "rang_duplique"
  /** Une nature que ce vocabulaire ne connaît pas. Sautée, elle produirait un état faux. */
  | "nature_inconnue"
  /** Le run agit sans avoir démarré — la trace de quelque chose qui a disparu. */
  | "jamais_demarre"
  /** Un second démarrage sur un run déjà commencé. */
  | "double_demarrage"
  /** Un événement après un événement terminal. Le journal continue après la fin. */
  | "evenement_apres_fin"
  /** Une suspension alors qu'on attendait déjà un accord. */
  | "double_suspension"
  /** Un accord — accordé ou refusé — sans suspension qui l'attendait. */
  | "accord_sans_suspension"
  /** La même clé d'idempotence deux fois : l'effet a pu être produit deux fois. */
  | "effet_duplique";

export interface Anomalie {
  readonly nature: NatureAnomalie;
  /** Rang de l'événement fautif, `null` quand c'est précisément lui qui manque. */
  readonly rang: number | null;
  /** Ce qu'un humain doit lire pour comprendre sans ouvrir la base. */
  readonly detail: string;
}

/**
 * Le résultat d'une reconstruction.
 *
 * Un type somme, et non un état accompagné d'une liste d'anomalies : une liste à côté s'ignore
 * d'un `if` oublié. Ici, obtenir l'état oblige à traiter le cas où il n'y en a pas.
 */
export type Reconstruction =
  | { readonly ok: true; readonly etat: EtatRun }
  | { readonly ok: false; readonly anomalies: readonly Anomalie[] };

const ETAT_VIDE: EtatRun = {
  phase: "jamais_demarre",
  actionsExecutees: 0,
  reprendreApres: null,
  actionEnAttente: null,
  effetsDejaProduits: new Set(),
  effetsEngagesSansResultat: new Set(),
};

/** La clé que porte un résultat ou un échec, pour le rattacher à son engagement. Elle vit dans
 *  la charge utile et non dans `idempotency_key`, que l'unicité réserve à l'engagement seul. */
function cleRattachee(payload: unknown): string {
  const charge = payload as { cle?: unknown } | null;
  return typeof charge?.cle === "string" ? charge.cle : "";
}

/** Trie sur `seq` seul. Aucun départage : deux rangs égaux sont une anomalie, pas un cas à gérer. */
function parRang(entrees: readonly JournalEntry[]): JournalEntry[] {
  return entrees.slice().sort((a, b) => a.seq - b.seq);
}

/**
 * Reconstruit l'état métier d'un run à partir de ses événements.
 *
 * Fonction **pure** : aucune entrée/sortie, aucune horloge, aucun aléa. Elle se teste
 * intégralement sans base — et ce qui dépend vraiment de la persistance (l'ordre réel rendu par
 * Postgres) se teste ailleurs, sur un vrai Postgres.
 */
export function reconstruireEtatRun(entrees: readonly JournalEntry[]): Reconstruction {
  const anomalies: Anomalie[] = [];

  // ── Contrôles d'intégrité de l'ordre, AVANT toute interprétation. Sans ordre fiable, la
  //    lecture des transitions ne voudrait rien dire, et ses anomalies seraient du bruit.
  for (const entree of entrees) {
    if (!Number.isSafeInteger(entree.seq)) {
      anomalies.push({
        nature: "rang_absent",
        rang: null,
        detail: `L'événement « ${entree.kind} » n'a pas de rang exploitable.`,
      });
    }
  }
  if (anomalies.length > 0) return { ok: false, anomalies };

  const etapes = parRang(entrees);
  const rangsVus = new Set<number>();
  for (const etape of etapes) {
    if (rangsVus.has(etape.seq)) {
      anomalies.push({
        nature: "rang_duplique",
        rang: etape.seq,
        detail: `Deux événements portent le rang ${etape.seq} : l'ordre est ambigu.`,
      });
    }
    rangsVus.add(etape.seq);
  }
  if (anomalies.length > 0) return { ok: false, anomalies };

  if (etapes.length === 0) return { ok: true, etat: ETAT_VIDE };

  // ── Lecture des transitions.
  let phase: PhaseRun = "jamais_demarre";
  let actionsExecutees = 0;
  let actionEnAttente: unknown = null;
  const effets = new Set<string>();
  // Engagés, puis refermés par un résultat ou un échec. Ce qui reste à la fin est ce dont on ne
  // sait rien — et dont on ne DOIT rien supposer.
  const enSuspens = new Set<string>();
  let dernierRang: number | null = null;

  for (const etape of etapes) {
    if (!estNatureConnue(etape.kind)) {
      anomalies.push({
        nature: "nature_inconnue",
        rang: etape.seq,
        detail: `Nature « ${etape.kind} » inconnue : elle ne peut pas être ignorée sans risquer un état faux.`,
      });
      continue;
    }

    const termine = phase === "termine" || phase === "echoue";
    if (termine) {
      anomalies.push({
        nature: "evenement_apres_fin",
        rang: etape.seq,
        detail: `« ${etape.kind} » survient après la fin du run.`,
      });
      continue;
    }

    if (etape.kind !== RUN_DEMARRE && phase === "jamais_demarre") {
      anomalies.push({
        nature: "jamais_demarre",
        rang: etape.seq,
        detail: `« ${etape.kind} » survient avant tout démarrage : un événement a disparu.`,
      });
      continue;
    }

    if (etape.idempotencyKey !== null) {
      if (effets.has(etape.idempotencyKey)) {
        anomalies.push({
          nature: "effet_duplique",
          rang: etape.seq,
          detail: `La clé « ${etape.idempotencyKey} » apparaît deux fois : l'effet a pu être produit deux fois.`,
        });
        continue;
      }
      effets.add(etape.idempotencyKey);
    }

    switch (etape.kind) {
      case RUN_DEMARRE:
        if (phase !== "jamais_demarre") {
          anomalies.push({
            nature: "double_demarrage",
            rang: etape.seq,
            detail: "Le run démarre une seconde fois.",
          });
          continue;
        }
        phase = "en_cours";
        break;

      case ACTION_DECIDEE:
        break;

      case ACTION_ENGAGEE:
        // La clé a déjà été enregistrée plus haut (elle est portée par cet événement) : on note
        // seulement que rien ne l'a encore refermée.
        if (etape.idempotencyKey !== null) enSuspens.add(etape.idempotencyKey);
        break;

      case ACTION_EXECUTEE:
        actionsExecutees += 1;
        enSuspens.delete(cleRattachee(etape.payload));
        break;

      case ACTION_ECHOUEE:
        // Un échec REFERME l'engagement : on sait ce qui s'est passé. C'est l'absence de toute
        // ligne — ni résultat, ni échec — qui laisse l'incertitude.
        enSuspens.delete(cleRattachee(etape.payload));
        break;

      case POLITIQUE_SUSPEND:
        if (phase === "attente_accord") {
          anomalies.push({
            nature: "double_suspension",
            rang: etape.seq,
            detail: "Une suspension survient alors qu'un accord était déjà attendu.",
          });
          continue;
        }
        phase = "attente_accord";
        actionEnAttente = etape.payload;
        break;

      case ACCORD_ACCORDE:
      case ACCORD_REFUSE:
        if (phase !== "attente_accord") {
          anomalies.push({
            nature: "accord_sans_suspension",
            rang: etape.seq,
            detail: `« ${etape.kind} » survient sans suspension à refermer.`,
          });
          continue;
        }
        // Un refus arrête le run sans exécuter l'action suspendue ; un accord le relance.
        phase = etape.kind === ACCORD_REFUSE ? "termine" : "en_cours";
        actionEnAttente = null;
        break;

      case RUN_TERMINE:
        phase = "termine";
        actionEnAttente = null;
        break;

      case RUN_ECHOUE:
        phase = "echoue";
        actionEnAttente = null;
        break;
    }

    dernierRang = etape.seq;
  }

  if (anomalies.length > 0) return { ok: false, anomalies };

  return {
    ok: true,
    etat: {
      phase,
      actionsExecutees,
      reprendreApres: dernierRang,
      actionEnAttente,
      effetsDejaProduits: effets,
      effetsEngagesSansResultat: enSuspens,
    },
  };
}

/** Le run peut-il reprendre au battement suivant ? Lecture unique, pour que la question ne soit
 *  pas posée de trois façons différentes ailleurs. */
export function peutReprendre(etat: EtatRun): boolean {
  return etat.phase === "jamais_demarre" || etat.phase === "en_cours";
}

/** Cette nature referme-t-elle un run ? Exposé pour que l'écriture et la lecture partagent la
 *  même définition — deux listes divergentes vaudraient zéro règle. */
export function estTerminale(kind: string): boolean {
  return NATURES_TERMINALES.has(kind);
}
