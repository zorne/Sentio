/**
 * EXEC-07 — la chaîne explicative d'un pas de run.
 *
 * ══ LA QUESTION À LAQUELLE CE MODULE RÉPOND ══
 *
 * « Pourquoi mon employé a-t-il fait ça ? »
 *
 * Et la réponse doit être une chaîne réelle, reconstruite depuis le journal :
 *
 *     contexte → décision du modèle → politique → effet → résultat
 *
 * Pas « l'IA l'a fait ». Pas un texte rédigé après coup pour rassurer. Chaque maillon est un
 * événement qui a été écrit AU MOMENT où il s'est produit, par le composant qui l'a produit, et
 * qu'aucun code ne peut réécrire (`execution_event` est en ajout seul).
 *
 * ══ CE QUE LA TRACE PORTE, ET CE QU'ELLE NE PORTE PAS ══
 *
 * Elle porte la **forme** du raisonnement : quelles couches de contexte ont parlé, combien de
 * faits ont été retenus, lesquels ont été écartés et pourquoi, ce que le modèle a proposé et avec
 * quel motif, ce que la politique a décidé et sur quel fondement, ce que l'effet a donné.
 *
 * Elle ne porte **pas** le contexte lui-même. Recopier le prompt assemblé dans le journal
 * dupliquerait les données personnelles du client dans une seconde table, ferait grossir sans fin
 * une table déjà bornée à 30 jours (`docs/adr/0012`), et n'ajouterait rien : ce que le client veut
 * savoir, c'est sur quelles bases son employé a agi, pas la formulation exacte reçue par le
 * modèle.
 *
 * ⚠️ **Conséquence de l'effacement, à assumer :** `erase_tenant()` remet `payload` à `{}`. Après
 * un droit à l'effacement, la SUITE des événements subsiste — donc la preuve qu'un processus
 * correct a eu lieu — mais son contenu disparaît. C'est le bon sens de l'arbitrage : la
 * conformité prime, et ce qui reste suffit à démontrer la mécanique sans exposer personne.
 *
 * Réalise : EXEC-07
 */

import type { JournalEntry } from "./trace.js";
import {
  ACCORD_ACCORDE,
  ACCORD_REFUSE,
  ACTION_ECHOUEE,
  ACTION_ENGAGEE,
  ACTION_EXECUTEE,
  CONTEXTE_ASSEMBLE,
  POLITIQUE_SUSPEND,
} from "./vocabulaire.js";

/** Ce qu'on retient d'un contexte assemblé : sa forme, jamais son contenu. */
export interface FormeDuContexte {
  /** Version de l'ADN réellement utilisée — un employé figé sur v1 n'a pas agi comme un v2. */
  readonly adnVersion?: number;
  /** Couches qui n'avaient rien à dire (EXEC-03). Une absence nommée, jamais tue. */
  readonly couchesAbsentes: readonly string[];
  /** Nombre d'entrées de profil entreprise injectées. */
  readonly entreesProfil: number;
  /** Faits appris injectés, et ceux qui ont été écartés avec leur raison. */
  readonly faitsRetenus: number;
  readonly faitsEcartes: readonly { readonly factId: string; readonly reason: string }[];
  /** L'objectif visé, en clair : c'est le « pour quoi » du pas. */
  readonly objectif?: string;
}

/**
 * Un maillon de la chaîne. `quand` et `rang` viennent du journal, jamais d'une horloge locale.
 */
export interface Maillon {
  readonly etape:
    | "contexte"
    | "proposition"
    | "politique"
    | "engagement"
    | "resultat"
    | "echec"
    | "accord";
  readonly kind: string;
  readonly rang: number;
  readonly quand: Date;
  readonly detail: Record<string, unknown>;
}

export interface TraceDuPas {
  readonly stepId: string | null;
  readonly maillons: readonly Maillon[];
  /** Les maillons manquants, nommés. Une chaîne incomplète se dit ; elle ne se comble pas. */
  readonly manquants: readonly Maillon["etape"][];
  /** Vrai quand la chaîne va du contexte jusqu'à une issue. */
  readonly complete: boolean;
}

const ETAPE_PAR_NATURE: Record<string, Maillon["etape"]> = {
  [CONTEXTE_ASSEMBLE]: "contexte",
  proposition_recue: "proposition",
  proposition_illisible: "proposition",
  politique_allow: "politique",
  politique_refuse: "politique",
  // `POLITIQUE_SUSPEND` vaut « politique_suspend » : c'est la même nature, écrite par le Policy
  // Engine sous `politique_${outcome}`. Une clé littérale en plus la dupliquerait.
  [POLITIQUE_SUSPEND]: "politique",
  [ACTION_ENGAGEE]: "engagement",
  [ACTION_EXECUTEE]: "resultat",
  [ACTION_ECHOUEE]: "echec",
  [ACCORD_ACCORDE]: "accord",
  [ACCORD_REFUSE]: "accord",
};

/** Les maillons attendus d'un pas qui va jusqu'au bout. L'engagement et le résultat manquent
 *  légitimement quand la politique a refusé ou suspendu — `manquants` en tient compte. */
const CHAINE_ATTENDUE: readonly Maillon["etape"][] = ["contexte", "proposition", "politique"];

/**
 * Reconstruit la chaîne explicative d'un pas, depuis les événements de ce pas.
 *
 * Fonction **pure**, comme la reconstruction d'état (EXEC-02) : elle lit, elle n'interroge rien.
 * Le tri est celui du rang — jamais l'horodatage, identique pour tous les événements d'une même
 * transaction.
 */
export function expliquerLePas(evenements: readonly JournalEntry[]): TraceDuPas {
  const tries = evenements.slice().sort((a, b) => a.seq - b.seq);

  const maillons: Maillon[] = tries
    .filter((e) => ETAPE_PAR_NATURE[e.kind] !== undefined)
    .map((e) => ({
      etape: ETAPE_PAR_NATURE[e.kind] as Maillon["etape"],
      kind: e.kind,
      rang: e.seq,
      quand: e.createdAt,
      detail: (typeof e.payload === "object" && e.payload !== null
        ? (e.payload as Record<string, unknown>)
        : {}) as Record<string, unknown>,
    }));

  const presentes = new Set(maillons.map((m) => m.etape));
  const manquants = CHAINE_ATTENDUE.filter((etape) => !presentes.has(etape));

  // Une politique qui refuse ou suspend n'a PAS à être suivie d'un effet : l'absence d'effet est
  // alors la preuve que la règle a tenu, pas un trou dans la chaîne.
  const politique = maillons.find((m) => m.etape === "politique");
  const attendaitUnEffet = politique?.kind === "politique_allow";
  const aUneIssue =
    presentes.has("resultat") || presentes.has("echec") || (politique !== undefined && !attendaitUnEffet);

  return {
    stepId: null,
    maillons,
    manquants,
    complete: manquants.length === 0 && aUneIssue,
  };
}

/**
 * Rend la chaîne en français, dans le vocabulaire du produit (`docs/17-lexique.md`).
 *
 * Destinée d'abord au support et à l'audit — c'est la réponse à « pourquoi ? » quand un client la
 * pose. Ce que le client voit dans son espace en est une projection plus courte, décidée au lot 6 ;
 * ici, rien n'est caché.
 */
export function raconterLePas(trace: TraceDuPas): string[] {
  const lignes: string[] = [];

  for (const maillon of trace.maillons) {
    switch (maillon.etape) {
      case "contexte": {
        const absentes = maillon.detail["couchesAbsentes"];
        const objectif = maillon.detail["objectif"];
        lignes.push(
          `Votre employé a relu ce qu'il sait de votre entreprise` +
            (typeof objectif === "string" ? `, pour viser : ${objectif}` : "") +
            ".",
        );
        if (Array.isArray(absentes) && absentes.length > 0) {
          lignes.push(`  Il ne disposait pas de : ${absentes.join(", ")}.`);
        }
        const ecartes = maillon.detail["faitsEcartes"];
        if (Array.isArray(ecartes) && ecartes.length > 0) {
          lignes.push(`  ${ecartes.length} chose(s) apprise(s) ont été écartées, hors de son métier.`);
        }
        break;
      }
      case "proposition": {
        if (maillon.kind === "proposition_illisible") {
          lignes.push("Il n'a pas su formuler d'action exploitable : rien n'a été tenté.");
          break;
        }
        const proposition = maillon.detail["proposition"] as
          | { capabilityKey?: unknown; rationale?: unknown }
          | undefined;
        const pourquoi = typeof proposition?.rationale === "string" ? proposition.rationale : null;
        lignes.push(
          `Il a proposé : ${String(proposition?.capabilityKey ?? "une action")}` +
            (pourquoi === null ? "." : ` — ${pourquoi}`),
        );
        break;
      }
      case "politique": {
        const capacite = String(maillon.detail["capacite"] ?? "cette action");
        if (maillon.kind === "politique_refuse") {
          lignes.push(`La règle a refusé « ${capacite} » : hors de ce que fait ce métier.`);
        } else if (maillon.kind === "politique_allow") {
          const fondement = maillon.detail["fondement"];
          lignes.push(
            fondement === "accord_permanent"
              ? `Vous aviez autorisé « ${capacite} » une fois pour toutes : il a pu agir.`
              : `« ${capacite} » ne sort pas de votre entreprise : il a pu agir sans vous déranger.`,
          );
        } else {
          lignes.push(`Il s'est arrêté et a demandé votre accord avant « ${capacite} ».`);
        }
        break;
      }
      case "engagement":
        lignes.push("Il a inscrit son intention avant d'agir, pour ne jamais agir deux fois.");
        break;
      case "resultat":
        lignes.push("L'action a été menée, et son résultat enregistré.");
        break;
      case "echec": {
        const definitif = maillon.detail["definitif"] === true;
        lignes.push(
          definitif
            ? "L'action a échoué et n'a pas été retentée."
            : "L'action a échoué de façon passagère : elle sera retentée.",
        );
        break;
      }
      case "accord":
        lignes.push(
          maillon.kind === ACCORD_ACCORDE ? "Vous avez donné votre accord." : "Vous avez refusé.",
        );
        break;
    }
  }

  if (trace.manquants.length > 0) {
    lignes.push(`⚠️ Chaîne incomplète : il manque ${trace.manquants.join(", ")}.`);
  }

  return lignes;
}
