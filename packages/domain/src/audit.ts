/**
 * L'audit — ce que Sentio CONSTATE d'une entreprise, avant toute décision.
 *
 * ══ POURQUOI CETTE COUCHE EXISTE ══
 *
 * Jusqu'ici, le frein déclaré par le dirigeant décidait seul de la configuration : il disait
 * « je manque de prospects », et l'employé partait prospecter. C'est exactement ce que la vision
 * interdit — **la demande du client est une donnée, pas la décision** (`docs/adr/0029`).
 *
 * Un dirigeant décrit ce qu'il ressent, pas toujours ce qui le bloque. L'exemple canonique :
 * il demande de la prospection, alors que sa prospection fonctionne et que ce sont ses demandes
 * entrantes qui se perdent. Un produit qui prend la déclaration pour un diagnostic vend la
 * solution que le client croyait vouloir, et n'apporte rien de plus qu'un formulaire.
 *
 * Cette couche sépare donc trois choses qui étaient confondues :
 *
 *     ce que le client DIT   →   ce qu'on CONSTATE   →   ce qu'on en CONCLUT
 *       (DiagnosticProfile)      (AuditFinding[])       (BesoinPriorise[])
 *
 * ⚠️ **Aucun constat n'est deviné.** Chacun porte sa source et sa confiance : un constat déduit
 * d'une déclaration ne vaut pas un constat mesuré, et le moteur de composition en tient compte.
 * Inventer un constat pour étoffer un diagnostic serait la faute la plus coûteuse du produit.
 */

/**
 * Le genre d'un constat. Fermé : ce qui n'y est pas ne se constate pas.
 *
 * Les forces comptent autant que les faiblesses — c'est même souvent une force qui explique
 * pourquoi il ne faut PAS renforcer là où le client le demandait.
 */
export const GENRES_DE_CONSTAT = [
  "force",
  "faiblesse",
  "goulot",
  "risque",
  "opportunite",
] as const;
export type GenreDeConstat = (typeof GENRES_DE_CONSTAT)[number];

/**
 * Les domaines fonctionnels de la bibliothèque (`docs/28` §3). Un domaine est une famille de
 * gestes, **jamais un poste** : « communication_entrante » n'est pas « le support ».
 */
export const DOMAINES = [
  "recherche_selection",
  "evaluation",
  "communication_sortante",
  "communication_entrante",
  "donnees_fiches",
  "documents",
  "temps_echeances",
  "analyse_restitution",
] as const;
export type Domaine = (typeof DOMAINES)[number];

/**
 * D'où vient un constat. C'est ce qui permet de ne pas traiter une impression comme une mesure.
 *
 *   · `declare`  — le dirigeant l'a dit. Utile, et faillible.
 *   · `deduit`   — tiré d'une autre donnée déclarée, par une règle explicite.
 *   · `mesure`   — observé dans les résultats d'un travail déjà effectué. Le plus solide, et le
 *                  seul qui n'existe pas encore au premier diagnostic.
 */
export const SOURCES_DE_CONSTAT = ["declare", "deduit", "mesure"] as const;
export type SourceDeConstat = (typeof SOURCES_DE_CONSTAT)[number];

/** La confiance qu'on accorde à un constat. Elle pondère, elle ne tranche pas. */
export const CONFIANCES = ["faible", "moyenne", "forte"] as const;
export type Confiance = (typeof CONFIANCES)[number];

export interface Constat {
  readonly genre: GenreDeConstat;
  readonly domaine: Domaine;
  readonly source: SourceDeConstat;
  readonly confiance: Confiance;
  /** Formulé dans le vocabulaire du dirigeant. C'est ce qu'il relira dans sa justification. */
  readonly libelle: string;
}

/** La confiance par défaut d'une source. Une déclaration n'est jamais « forte » à elle seule. */
export const CONFIANCE_PAR_SOURCE: Record<SourceDeConstat, Confiance> = {
  declare: "moyenne",
  deduit: "faible",
  mesure: "forte",
};

/** Poids numérique d'une confiance. Sorti ici pour qu'aucune pondération ne soit écrite en dur. */
export const POIDS_DE_CONFIANCE: Record<Confiance, number> = {
  faible: 1,
  moyenne: 2,
  forte: 3,
};

/**
 * Ce qu'un genre de constat pèse dans le besoin d'un domaine.
 *
 * Une **force** pèse NÉGATIVEMENT : un domaine qui fonctionne n'a pas besoin de renfort, et c'est
 * précisément ce qui permet de recommander autre chose que ce que le client demandait.
 */
export const POIDS_DE_GENRE: Record<GenreDeConstat, number> = {
  force: -2,
  faiblesse: 2,
  goulot: 3,
  risque: 1,
  opportunite: 1,
};

/** Tri stable : deux constats identiques à l'ordre près doivent produire le même diagnostic. */
export function ordonnerLesConstats(constats: readonly Constat[]): readonly Constat[] {
  return [...constats].sort(
    (a, b) =>
      a.domaine.localeCompare(b.domaine) ||
      a.genre.localeCompare(b.genre) ||
      a.source.localeCompare(b.source) ||
      a.libelle.localeCompare(b.libelle),
  );
}
