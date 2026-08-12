/**
 * METIER-15 — choisir une variante de stratégie, de façon reproductible.
 *
 * ══ POURQUOI PAS UN TIRAGE AU SORT ══
 *
 * Parce qu'un tirage rend le produit impossible à expliquer. Un client demande « pourquoi mon
 * employé a-t-il écrit comme ça ? » ; avec `Math.random()`, la seule réponse honnête est « on ne
 * peut pas savoir ». Le choix est donc **dérivé de la mission elle-même** : la même mission donne
 * toujours la même variante, un rejeu après panne aussi, et le journal se relit sans ambiguïté.
 *
 * ══ POURQUOI RÉPARTIR PLUTÔT QUE SUIVRE LA VARIANTE PAR DÉFAUT ══
 *
 * Parce que sans répartition, aucune variante autre que celle par défaut n'est jamais jouée —
 * donc jamais mesurée, donc EVOL-04 n'aura jamais rien à comparer. Une variante qu'on n'essaie
 * pas n'est pas une variante, c'est une intention.
 *
 * La répartition est **uniforme et sans mémoire** : elle ne tient pas compte des résultats. C'est
 * exactement ce qu'on veut à ce stade — exploiter des résultats est le travail d'EVOL-04, et
 * l'esquisser ici produirait un choix qui a l'air d'apprendre sans rien mesurer.
 *
 * ══ CE QUI SE PASSE QUAND ON AJOUTE UNE VARIANTE ══
 *
 * La répartition des missions FUTURES change — c'est inévitable et c'est voulu. Ce qui ne change
 * pas : les missions déjà jouées gardent la variante inscrite dans `task_variant`, donc les
 * résultats déjà mesurés restent attribués à ce qui a réellement tourné. Ajouter une variante
 * n'invalide aucune mesure passée.
 *
 * Réalise : METIER-15
 */

export interface VarianteDeStrategie {
  readonly id: string;
  readonly kind: string;
  readonly key: string;
  readonly actif: boolean;
  readonly parDefaut: boolean;
}

/**
 * Empreinte entière d'une chaîne — FNV-1a 32 bits, suivi d'un finaliseur d'avalanche.
 *
 * Choisie pour ce qu'elle n'est pas : ni cryptographique (inutile ici), ni dépendante d'une
 * bibliothèque, ni dépendante de la plateforme. Le même identifiant de mission doit donner le
 * même nombre sous Node et sous Deno, aujourd'hui et dans un an — les deux hôtes montent ce même
 * code (`docs/adr/0028`).
 *
 * ⚠️ LE FINALISEUR N'EST PAS DÉCORATIF, et il a été ajouté parce qu'un test a échoué.
 *
 * FNV-1a seul est LINÉAIRE sur son bit de poids faible : le multiplicateur est impair, donc ce bit
 * final vaut le XOR des bits de poids faible de tous les caractères. Conséquence directe, et
 * invisible à la relecture : ajouter un suffixe fixe (« :angle », « :moment_de_relance ») ne fait
 * qu'inverser ce bit d'une constante. Avec deux variantes par genre, `empreinte % 2` donnait donc
 * toujours des choix appariés — deux combinaisons possibles au lieu de quatre, et une répartition
 * qui avait l'air de croiser les stratégies sans jamais les croiser.
 *
 * Le finaliseur (celui de MurmurHash3) mélange les bits de poids fort dans les bits de poids
 * faible, ce qui supprime cette linéarité.
 */
export function empreinteStable(texte: string): number {
  let empreinte = 0x811c9dc5;
  for (let index = 0; index < texte.length; index += 1) {
    empreinte ^= texte.charCodeAt(index);
    empreinte = Math.imul(empreinte, 0x01000193) >>> 0;
  }

  empreinte ^= empreinte >>> 16;
  empreinte = Math.imul(empreinte, 0x85ebca6b) >>> 0;
  empreinte ^= empreinte >>> 13;
  empreinte = Math.imul(empreinte, 0xc2b2ae35) >>> 0;
  empreinte ^= empreinte >>> 16;

  return empreinte >>> 0;
}

/**
 * La variante à jouer pour une mission donnée, ou `null` s'il n'y en a aucune d'active.
 *
 * `null` n'est pas un cas dégradé qu'on comblerait par un repli : c'est un refus. Un genre de
 * variante sans aucune variante active signifie que quelqu'un a tout désactivé, et jouer « quand
 * même » une variante éteinte défait précisément le geste qui l'a éteinte.
 *
 * Le tri par `key` avant l'indexation n'est pas cosmétique : sans lui, l'ordre rendu par la base
 * déciderait du choix, et deux lectures pourraient attribuer deux variantes différentes à la même
 * mission.
 */
export function choisirUneVariante(
  variantes: readonly VarianteDeStrategie[],
  cleDeRepartition: string,
): VarianteDeStrategie | null {
  const actives = variantes
    .filter((variante) => variante.actif)
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key));

  if (actives.length === 0) return null;
  if (cleDeRepartition.trim() === "") {
    // Sans mission à laquelle s'adosser, il n'y a rien à dériver : on retombe sur la variante
    // déclarée par défaut, et à défaut sur la première — jamais sur un tirage.
    return actives.find((variante) => variante.parDefaut) ?? actives[0] ?? null;
  }

  const index = empreinteStable(cleDeRepartition) % actives.length;
  return actives[index] ?? null;
}

/**
 * Le jeu de variantes à appliquer à une mission : au plus une par genre.
 *
 * Deux angles sur un même message ne se composent pas — ils se contredisent. La borne « une par
 * genre » est donc une règle de sens, pas une limite de confort.
 */
export function choisirLesVariantes(
  variantes: readonly VarianteDeStrategie[],
  cleDeRepartition: string,
): readonly VarianteDeStrategie[] {
  const genres = [...new Set(variantes.map((variante) => variante.kind))].sort();
  const choisies: VarianteDeStrategie[] = [];

  for (const genre of genres) {
    const duGenre = variantes.filter((variante) => variante.kind === genre);
    // La clé inclut le genre : sans cela, une mission tomberait sur le même RANG dans chaque
    // genre, et les variantes se retrouveraient corrélées entre elles au lieu d'être croisées.
    const choisie = choisirUneVariante(duGenre, `${cleDeRepartition}:${genre}`);
    if (choisie !== null) choisies.push(choisie);
  }

  return choisies;
}
