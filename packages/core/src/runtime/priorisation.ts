/**
 * Ce que Lady fait en premier — et pourquoi, en toutes lettres.
 *
 * ══ CE QUI MANQUAIT ══
 *
 * `GisementDeProspects` tranchait entre deux travaux possibles par une règle écrite en dur :
 * « s'il reste un prospect à traiter, ne cherche jamais ». C'était honnête et testé, mais ce
 * n'était pas une décision — c'était une constante. Un dirigeant dont le diagnostic dit « votre
 * problème est le volume d'entreprises approchées » recevait exactement le même ordre de travail
 * qu'un dirigeant dont le diagnostic dit l'inverse : sa configuration ne changeait rien.
 *
 * ══ CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS ══
 *
 * **Une fonction pure, déterministe et totale.** Mêmes entrées, même ordre, même justification,
 * toujours — c'est la règle qui gouverne déjà `composer()` (`@sentio/domain`), et elle vaut ici
 * pour la même raison : « pourquoi Lady a-t-elle travaillé ceci plutôt que cela ? » doit avoir une
 * réponse vérifiable des mois plus tard, sans rejouer quoi que ce soit.
 *
 * ⚠️ **Aucun modèle n'intervient, et c'est le cœur de la décision d'architecture.** Un modèle qui
 * choisirait ce qui est important déciderait de ce que le client paie, sur un jugement qu'on ne
 * peut ni tester avant, ni comparer entre deux clients, ni expliquer après. Le modèle décide
 * **comment** traiter un travail (`next-action.ts`) ; il ne décide jamais lequel mérite l'attention.
 * C'est la même frontière que `attelage.ts` tient pour la cible d'une action.
 *
 * ══ LA FORMULE, ET POURQUOI CHAQUE FACTEUR EST BORNÉ ══
 *
 *     score = poids de la configuration     ← ce que le dirigeant a approuvé (rang, gouverné)
 *           × amplification du retard        ← ce que la mesure observe        (borné)
 *           × correction de l'historique     ← ce que les résultats ont appris (borné, ±)
 *           × facteur d'attente              ← depuis quand ce travail attend  (borné, saturé)
 *
 * Trois facteurs sur quatre croissent. Un facteur croissant sans plafond finit toujours par
 * écraser les autres — non parce qu'il compte plus, mais parce que rien ne l'arrête. Les bornes
 * vivent donc en configuration (`BornesDePriorisation`), nommées, et non enfouies ici.
 *
 * ══ POURQUOI UNE RÉPARTITION, ET PAS « LE PLUS FORT PREND TOUT » ══
 *
 * Le budget du jour se répartit **au prorata des scores**, jamais en totalité vers le mieux noté.
 * Dix créneaux sur des scores 60/40 donnent six et quatre, pas dix et zéro. C'est ce qui fait la
 * différence entre une employée qui mène plusieurs responsabilités de front et un automate qui en
 * sert une seule tant qu'elle n'est pas épuisée — c'est-à-dire, précisément, le défaut que la
 * règle en dur produisait.
 *
 * Réalise : le choix du travail, P0 de l'audit d'autonomie.
 */

import type { BornesDePriorisation } from "@sentio/config";

import type { SujetDeMission } from "./approvisionnement.js";

/**
 * Le couple `(domaine, objet)` d'un travail — le vocabulaire du diagnostic (`@sentio/domain`),
 * pas celui d'un métier. C'est lui qui relie ce que le dirigeant a approuvé à ce que Lady ouvre.
 */
export interface CoupleDeTravail {
  readonly domaine: string;
  readonly objet: string;
}

/**
 * Un travail possible, tel que le gisement le présente.
 *
 * ⚠️ `couples` est une LISTE, pas un couple : une mission `lead` peut, selon le pas, qualifier,
 * consigner ou écrire — trois domaines pour une seule nature de mission. Le rang retenu est le
 * meilleur des trois (voir `rangDuTravail`), parce que le dirigeant a priorisé des domaines, pas
 * des natures de mission.
 */
export interface TravailCandidat {
  /** La nature de mission (`task.subject_kind`) que ce travail ouvrirait. */
  readonly kind: string;
  readonly couples: readonly CoupleDeTravail[];
  /** Les sujets éligibles, **déjà ordonnés** par le gisement. Jamais réordonnés ici. */
  readonly sujets: readonly SujetDeMission[];
  /** Jours écoulés depuis la dernière mission de cette nature. 0 = travaillée aujourd'hui. */
  readonly joursSansTravail: number;
  /**
   * Ce que les résultats passés disent de ce travail, entre -1 et 1. `0` = rien d'appris.
   *
   * Vaut zéro partout aujourd'hui : `outcome` n'est alimenté par aucun chemin de production
   * (`docs/35`). Le facteur existe déjà, borné et testé, pour que le jour où le signal arrivera
   * il n'y ait rien à reconcevoir — et pour que la borne soit en place **avant** la donnée, pas
   * après.
   */
  readonly ajustementHistorique?: number;
}

/** Un travail que Lady ne peut pas ouvrir, et pourquoi. Journalisé, jamais silencieux. */
export interface TravailEcarte {
  readonly kind: string;
  readonly couples: readonly CoupleDeTravail[];
  readonly raison: "aucune_capacite_active";
}

export interface EntreeDePriorisation {
  readonly candidats: readonly TravailCandidat[];
  readonly ecartes: readonly TravailEcarte[];
  /**
   * `lady_configuration.priorites`, **tel quel** : des phrases, dans l'ordre approuvé.
   *
   * L'ordre EST la priorité — `composer()` les range par besoin décroissant. On ne relit donc
   * jamais les constats bruts pour recalculer un score : ce serait faire changer le comportement
   * de Lady avec des données que le dirigeant n'a pas validées, c'est-à-dire contourner
   * `accepter_la_configuration` par la lecture au lieu de l'écriture.
   */
  readonly priorites: readonly string[];
  /** Le domaine d'une phrase de priorité, ou `null`. Injecté pour garder ce module sans dépendance. */
  readonly domainePourPriorite: (priorite: string) => string | null;
  /**
   * Les domaines que la mesure du travail désigne comme bloquants (`goulot` ou `faiblesse`).
   *
   * Ils viennent de `releverDesResultats` (`@sentio/domain`), pas d'une table écrite pour
   * l'occasion : c'est **le même relevé** qui décide d'une proposition de reconfiguration. Les
   * deux ne peuvent donc pas diverger — Lady ne peut pas amplifier un domaine dont la
   * réévaluation dirait par ailleurs qu'il va bien.
   */
  readonly domainesEnRetard: readonly string[];
  /** Combien de missions peuvent être ouvertes en tout, toutes natures confondues. */
  readonly budget: number;
  readonly bornes: BornesDePriorisation;
}

/** Le détail du calcul pour un travail. Chaque facteur reste lisible séparément, à dessein. */
export interface PartDeTravail {
  readonly kind: string;
  /** Le couple qui a donné le rang, `null` si aucun des couples n'est priorisé. */
  readonly couple: CoupleDeTravail | null;
  /** Rang dans les priorités, 0 = premier. `null` = absent, poids plancher. */
  readonly rang: number | null;
  readonly poidsConfiguration: number;
  readonly multiplicateurEcart: number;
  readonly ajustementHistorique: number;
  readonly facteurVieillissement: number;
  readonly score: number;
  readonly disponibles: number;
  readonly creneaux: number;
}

/**
 * Pourquoi Lady a choisi ce travail plutôt qu'un autre — une structure, jamais une phrase.
 *
 * Elle est journalisée telle quelle. Un texte serait plus agréable à lire et strictement moins
 * utile : on ne peut pas comparer deux jours, ni retrouver quel facteur a fait basculer un choix.
 * La phrase se rend à partir d'ici (`raconterLaPriorisation`), jamais l'inverse.
 */
export interface JustificationDePriorisation {
  readonly budget: number;
  readonly parts: readonly PartDeTravail[];
  /**
   * Les travaux écartés faute de capacité active.
   *
   * ⚠️ Journalisé sans qu'aucun mécanisme ne s'en saisisse encore, et c'est délibéré : c'est la
   * matière première de « Lady signale qu'il lui manque un outil », qui est un autre chantier.
   * L'écrire dès maintenant coûte une ligne ; le reconstituer après coup coûterait l'historique.
   */
  readonly ecartes: readonly TravailEcarte[];
}

export interface Priorisation {
  /** Les sujets retenus, dans l'ordre d'ouverture. */
  readonly sujets: readonly SujetDeMission[];
  readonly justification: JustificationDePriorisation;
}

/** Ramène une valeur dans `[min, max]`. */
function borner(valeur: number, min: number, max: number): number {
  return Math.min(Math.max(valeur, min), max);
}

/**
 * Le rang d'un travail : le MEILLEUR de ses couples.
 *
 * Le dirigeant priorise des domaines ; une nature de mission peut en servir plusieurs. Prendre le
 * meilleur, c'est dire « ce travail sert au moins ce qui compte le plus » — prendre le pire dirait
 * l'inverse, et ferait dépendre la priorité d'un travail de ce qu'il fait *aussi*, accessoirement.
 */
function rangDuTravail(
  travail: TravailCandidat,
  entree: EntreeDePriorisation,
): { rang: number | null; couple: CoupleDeTravail | null } {
  let meilleur: { rang: number; couple: CoupleDeTravail } | null = null;

  for (const [rang, priorite] of entree.priorites.entries()) {
    const domaine = entree.domainePourPriorite(priorite);
    if (domaine === null) continue;
    for (const couple of travail.couples) {
      if (couple.domaine === domaine && (meilleur === null || rang < meilleur.rang)) {
        meilleur = { rang, couple };
      }
    }
  }

  return meilleur === null ? { rang: null, couple: null } : meilleur;
}

/** Le poids que la configuration donne à un rang. Premier = 1, puis 1/2, 1/3… */
function poidsDuRang(rang: number | null, bornes: BornesDePriorisation): number {
  const plancher = bornes.poidsSansPrioritePourcent / 100;
  if (rang === null) return plancher;
  // ⚠️ Jamais en dessous du plancher : un rang très bas resterait sinon derrière un travail que
  // le dirigeant n'a pas cité du tout, ce qui n'aurait aucun sens pour lui.
  return Math.max(1 / (rang + 1), plancher);
}

function partDeTravail(
  travail: TravailCandidat,
  entree: EntreeDePriorisation,
): Omit<PartDeTravail, "creneaux"> {
  const { rang, couple } = rangDuTravail(travail, entree);
  const poidsConfiguration = poidsDuRang(rang, entree.bornes);

  // ── Le retard amplifie, dans une limite. Il DOIT pouvoir dépasser une priorité déclarée faible
  //    — ce qu'on observe l'emporte sur ce qu'on croyait — mais jamais au point qu'un écart qui a
  //    à peine bougé retourne l'ordre de travail d'un jour à l'autre.
  const enRetard = travail.couples.some((c) => entree.domainesEnRetard.includes(c.domaine));
  const multiplicateurEcart = enRetard ? 1 + entree.bornes.ecartMaximumPourcent / 100 : 1;

  // ── L'historique nuance, il ne tranche jamais : c'est cette borne qui garantit qu'une mémoire
  //    apprise ne peut pas inverser un ordre approuvé par le dirigeant.
  const maxHistorique = entree.bornes.historiqueMaximumPourcent / 100;
  const ajustementHistorique = borner(
    travail.ajustementHistorique ?? 0,
    -maxHistorique,
    maxHistorique,
  );

  // ── L'attente relève, jusqu'à saturation. Sans plafond, un travail délaissé longtemps prendrait
  //    tout le budget d'un coup au lieu d'être simplement repris.
  const facteurVieillissement =
    1 +
    borner(
      Math.max(travail.joursSansTravail, 0) * (entree.bornes.vieillissementParJourPourcent / 100),
      0,
      entree.bornes.vieillissementMaximumPourcent / 100,
    );

  return {
    kind: travail.kind,
    couple,
    rang,
    poidsConfiguration,
    multiplicateurEcart,
    ajustementHistorique,
    facteurVieillissement,
    score:
      poidsConfiguration * multiplicateurEcart * (1 + ajustementHistorique) * facteurVieillissement,
    disponibles: travail.sujets.length,
  };
}

/**
 * L'ordre entre deux travaux, **total et déterministe**.
 *
 * ⚠️ Le départage ne s'arrête jamais au score. Deux scores égaux arrivent pour de vrai — deux
 * travaux au même rang, ou tous deux hors priorités — et laisser l'ordre d'arrivée trancher
 * rendrait le résultat dépendant de l'ordre des lignes rendues par la base, c'est-à-dire
 * irreproductible le jour où un index change. On descend donc jusqu'au nom.
 */
function comparerLesParts(
  a: Omit<PartDeTravail, "creneaux">,
  b: Omit<PartDeTravail, "creneaux">,
): number {
  if (b.score !== a.score) return b.score - a.score;
  const rangA = a.rang ?? Number.POSITIVE_INFINITY;
  const rangB = b.rang ?? Number.POSITIVE_INFINITY;
  if (rangA !== rangB) return rangA - rangB;
  const domaineA = a.couple?.domaine ?? "";
  const domaineB = b.couple?.domaine ?? "";
  if (domaineA !== domaineB) return domaineA.localeCompare(domaineB);
  const objetA = a.couple?.objet ?? "";
  const objetB = b.couple?.objet ?? "";
  if (objetA !== objetB) return objetA.localeCompare(objetB);
  return a.kind.localeCompare(b.kind);
}

/**
 * Répartit le budget au prorata des scores.
 *
 * Méthode des plus forts restes : chacun reçoit sa part entière, puis les créneaux qui restent
 * vont aux plus grandes fractions. C'est la répartition proportionnelle la plus simple qui soit
 * exactement reproductible — un arrondi « au plus proche » ne l'est pas, il peut distribuer un
 * créneau de plus ou de moins selon les valeurs.
 *
 * Ce qu'un travail ne peut pas prendre faute de sujets disponibles est rendu aux autres : un
 * budget de dix avec trois prospects et une recherche ouvre quatre missions, jamais dix.
 */
function repartir(
  parts: readonly Omit<PartDeTravail, "creneaux">[],
  budget: number,
): readonly PartDeTravail[] {
  const total = parts.reduce((somme, part) => somme + part.score, 0);
  if (budget <= 0 || total <= 0) {
    return parts.map((part) => ({ ...part, creneaux: 0 }));
  }

  const ideaux = parts.map((part) => (budget * part.score) / total);
  const creneaux = parts.map((part, index) =>
    Math.min(Math.floor(ideaux[index] as number), part.disponibles),
  );

  // Les restes, aux plus grandes fractions d'abord. `parts` est déjà trié : à fraction égale,
  // c'est donc l'ordre total de `comparerLesParts` qui départage, jamais l'ordre d'arrivée.
  const ordreDesRestes = parts
    .map((_, index) => index)
    .sort((a, b) => {
      const resteA = (ideaux[a] as number) - Math.floor(ideaux[a] as number);
      const resteB = (ideaux[b] as number) - Math.floor(ideaux[b] as number);
      return resteB - resteA || a - b;
    });

  let restant = budget - creneaux.reduce((somme, n) => somme + n, 0);

  const donnerUnCreneau = (index: number): boolean => {
    if (restant <= 0) return false;
    if ((creneaux[index] as number) >= (parts[index] as { disponibles: number }).disponibles) {
      return false;
    }
    creneaux[index] = (creneaux[index] as number) + 1;
    restant -= 1;
    return true;
  };

  // Première passe : les plus grandes fractions, c'est la règle des plus forts restes.
  for (const index of ordreDesRestes) donnerUnCreneau(index);

  // ⚠️ Puis on tourne jusqu'à épuisement, dans l'ORDRE DES SCORES. Un travail à court de sujets
  // rend ses créneaux, et il faut les redonner **entièrement** — une passe unique n'en rendrait
  // qu'un par travail, et un budget de dix n'ouvrirait que cinq missions alors que dix étaient
  // possibles : un manque à gagner silencieux, invisible dans le compte rendu. Ce qui reste va au
  // mieux classé, pas au plus grand reste : les fractions ont déjà joué leur rôle au-dessus.
  let progresse = true;
  while (restant > 0 && progresse) {
    progresse = false;
    for (const index of parts.keys()) {
      if (donnerUnCreneau(index)) progresse = true;
    }
  }

  return parts.map((part, index) => ({ ...part, creneaux: creneaux[index] as number }));
}

/**
 * Décide quels travaux Lady ouvre, et dans quel ordre.
 *
 * **Fonction pure et totale.** Un budget nul, aucun candidat, ou des priorités vides ne sont pas
 * des cas d'erreur : ils rendent une liste vide avec une justification qui dit pourquoi.
 */
export function prioriserLesTravaux(entree: EntreeDePriorisation): Priorisation {
  const parts = entree.candidats
    .filter((travail) => travail.sujets.length > 0)
    .map((travail) => partDeTravail(travail, entree))
    .sort(comparerLesParts);

  const reparties = repartir(parts, entree.budget);

  const sujets: SujetDeMission[] = [];
  for (const part of reparties) {
    const travail = entree.candidats.find((candidat) => candidat.kind === part.kind);
    if (travail === undefined) continue;
    // L'ordre interne du gisement est conservé tel quel : lui seul sait ce qui vient en premier
    // à l'intérieur d'une même nature de travail (le plus ancien, aujourd'hui).
    sujets.push(...travail.sujets.slice(0, part.creneaux));
  }

  return {
    sujets,
    justification: { budget: entree.budget, parts: reparties, ecartes: entree.ecartes },
  };
}

/**
 * La justification, en une phrase lisible par un humain.
 *
 * Rendue **à partir** de la structure, jamais rédigée à côté : si les deux divergeaient un jour,
 * c'est la phrase qu'on lirait et le chiffre qui ferait foi.
 */
export function raconterLaPriorisation(justification: JustificationDePriorisation): string {
  const retenues = justification.parts.filter((part) => part.creneaux > 0);
  if (retenues.length === 0) return "Aucun travail ouvert.";

  const phrases = retenues.map((part) => {
    const rang =
      part.rang === null
        ? "hors des priorités déclarées"
        : `priorité n°${part.rang + 1} du dirigeant`;
    const retard = part.multiplicateurEcart > 1 ? ", en retard sur l'objectif" : "";
    const attente = part.facteurVieillissement > 1 ? ", délaissé depuis plusieurs jours" : "";
    return `${part.creneaux} × « ${part.kind} » (${rang}${retard}${attente})`;
  });

  return phrases.join(" ; ") + ".";
}
