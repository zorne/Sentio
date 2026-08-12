/**
 * METIER-14 — la réflexion d'après-run : ce qu'un employé retient, et surtout ce qu'il ne retient
 * pas.
 *
 * ══ POURQUOI UN PLAFOND SI BAS ══
 *
 * Trois faits par run, zéro compris. Ce n'est pas une économie de stockage : c'est ce qui rend la
 * mémoire d'entreprise utilisable. Un employé qui retient dix observations par cycle remplit la
 * mémoire de banalités en une semaine — « le prospect n'a pas répondu », « l'email est parti » —
 * et le tri par usage, celui qui décide quels faits entrent dans le contexte
 * (`context/assemble.ts`), n'a plus rien à distinguer. Contraindre à trois oblige à choisir, et
 * c'est le choix qui a de la valeur, pas la collecte.
 *
 * **Zéro est une issue normale.** Un run dont on n'a rien appris ne doit rien inventer pour
 * remplir le quota — c'est exactement le genre de chiffre creux que l'invariant 4 interdit.
 *
 * ══ CE QUE CE MODULE NE FAIT PAS ══
 *
 * Il n'appelle pas le modèle. Les propositions lui arrivent déjà rédigées ; lui décide seulement
 * lesquelles survivent. La séparation permet d'éprouver les six motifs de rejet sans réseau, sans
 * quota et sans hasard.
 *
 * Il n'écrit rien non plus : la persistance des faits retenus est EVOL-01. Ici, tout est pur.
 *
 * ══ TOTALE, DONC JAMAIS BLOQUANTE ══
 *
 * Cette fonction **ne lève jamais** : une proposition irrecevable est écartée avec son motif, pas
 * rejetée par une exception. C'est délibéré, et ce n'est pas la même chose qu'un `try/catch`
 * autour de l'appel — un `catch` avalerait aussi les pannes qu'on veut voir, et transformerait une
 * réflexion cassée en réflexion silencieusement vide. Ici, il n'y a rien à avaler : le seul
 * résultat possible est une liste de retenus et une liste d'écartés, motivée ligne à ligne.
 *
 * La tolérance aux pannes de ce qui l'ENTOURE — l'appel de modèle qui produit les propositions —
 * reste EXEC-15, et n'est pas faite ici.
 *
 * Réalise : METIER-14
 */

import { contradictsDna, normalizeForComparison, type EmployeeDna } from "../context/assemble.js";

/**
 * En deçà, ce n'est pas un fait : c'est un mot. « ok », « rien », « répondu » n'apprennent rien à
 * qui les relira dans trois mois, et occupent une place dans un contexte borné.
 */
export const LONGUEUR_MINIMALE_D_UN_FAIT = 12;

/**
 * Au-delà, ce n'est plus un fait : c'est un compte rendu. Un fait doit tenir dans une ligne du
 * contexte — ce qui n'y tient pas y sera tronqué, et un fait tronqué ment.
 */
export const LONGUEUR_MAXIMALE_D_UN_FAIT = 280;

export interface ReflexionInput {
  /** Ce que la réflexion propose de retenir, déjà rédigé. Peut être vide. */
  readonly propositions: readonly string[];
  /** L'ADN de l'employé : ses limites sont la matière du filtre anti-contradiction. */
  readonly dna: EmployeeDna;
  /** Les faits déjà connus de cette entreprise — pour ne pas réapprendre ce qui est su. */
  readonly faitsConnus: readonly string[];
  /** Plafond de faits retenus. Vient de `@sentio/config` (`faitsMaxParRun`), jamais d'ici. */
  readonly maximum: number;
}

export interface FaitEcarte {
  readonly fait: string;
  /** Toujours renseigné : une absence qu'on ne sait pas expliquer est un bug qu'on ne verra pas. */
  readonly raison: string;
}

export interface ResultatDeReflexion {
  readonly retenus: readonly string[];
  readonly ecartes: readonly FaitEcarte[];
}

/**
 * Trie les propositions d'une réflexion : ce qui est retenu, ce qui est écarté et pourquoi.
 *
 * L'ordre des contrôles n'est pas indifférent. Le plafond est vérifié **en dernier**, après tous
 * les motifs de rejet : sans cela, trois propositions vides consommeraient les trois places et une
 * quatrième, bonne, serait refusée pour « plafond atteint ». Le plafond doit compter des faits
 * retenus, pas des lignes reçues.
 */
export function trierLesFaitsDUnRun(input: ReflexionInput): ResultatDeReflexion {
  const retenus: string[] = [];
  const ecartes: FaitEcarte[] = [];

  const plafond = Number.isInteger(input.maximum) && input.maximum > 0 ? input.maximum : 0;

  const connus = new Set(input.faitsConnus.map((fait) => normalizeForComparison(fait.trim())));
  const vusDansCeRun = new Set<string>();

  for (const brut of input.propositions) {
    const fait = brut.trim();

    if (fait.length < LONGUEUR_MINIMALE_D_UN_FAIT) {
      ecartes.push({
        fait: brut,
        raison: `trop court pour être un fait (moins de ${LONGUEUR_MINIMALE_D_UN_FAIT} caractères)`,
      });
      continue;
    }

    if (fait.length > LONGUEUR_MAXIMALE_D_UN_FAIT) {
      ecartes.push({
        fait: brut,
        raison: `trop long : un fait tient dans une ligne (plus de ${LONGUEUR_MAXIMALE_D_UN_FAIT} caractères)`,
      });
      continue;
    }

    // Le filtre anti-contradiction, appliqué à l'ENTRÉE de la mémoire et pas seulement à sa
    // sortie. `assembleContext` écarte déjà un fait qui heurte l'ADN au moment de l'injecter —
    // mais un tel fait n'aurait jamais dû être écrit : il reste alors en base, visible du client,
    // et donne à lire que l'employé a « appris » ce que son métier lui interdit.
    const contradiction = contradictsDna(fait, input.dna);
    if (contradiction !== null) {
      ecartes.push({ fait: brut, raison: contradiction });
      continue;
    }

    const empreinte = normalizeForComparison(fait);

    if (connus.has(empreinte)) {
      ecartes.push({ fait: brut, raison: "déjà connu de cette entreprise" });
      continue;
    }

    if (vusDansCeRun.has(empreinte)) {
      ecartes.push({ fait: brut, raison: "répété dans le même run" });
      continue;
    }

    if (retenus.length >= plafond) {
      ecartes.push({ fait: brut, raison: `plafond de ${plafond} fait(s) par run atteint` });
      continue;
    }

    retenus.push(fait);
    vusDansCeRun.add(empreinte);
  }

  return { retenus, ecartes };
}
