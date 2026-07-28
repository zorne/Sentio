/**
 * Lexique — mots interdits dans tout texte visible par un client.
 *
 * `docs/17-lexique.md` est la **source unique** de cette liste (`AGENTS.md`, invariant 8) : elle
 * n'est recopiée nulle part, y compris ici. Ce module la **lit**, il ne la redéfinit pas — trois
 * copies divergentes valent zéro règle.
 */

/** Chemin du lexique, relatif à la racine du dépôt. */
export const LEXIQUE_DOC_PATH = "docs/17-lexique.md";

const FORBIDDEN_SECTION_HEADING = "## Interdit dans tout texte visible par un client";

/**
 * Extrait les termes interdits du corps markdown du lexique.
 *
 * Fonction pure : elle ne lit aucun fichier, ce qui la rend testable sans infrastructure.
 * Le tableau attendu est `| Interdit | Pourquoi |`, une cellule pouvant lister plusieurs
 * variantes séparées par des virgules.
 */
export function parseForbiddenTerms(markdown: string): string[] {
  const start = markdown.indexOf(FORBIDDEN_SECTION_HEADING);
  if (start === -1) {
    throw new Error(
      `Section « ${FORBIDDEN_SECTION_HEADING} » introuvable dans ${LEXIQUE_DOC_PATH}. ` +
        `Le lexique a changé de structure : corriger ce parseur, jamais recopier la liste.`,
    );
  }

  const afterHeading = markdown.slice(start + FORBIDDEN_SECTION_HEADING.length);
  const nextHeading = afterHeading.indexOf("\n## ");
  const section = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);

  const terms: string[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed.split("|").slice(1, -1);
    const first = cells[0]?.trim();
    if (first === undefined || first === "") continue;
    // En-tête du tableau et ligne de séparation.
    if (first === "Interdit" || /^-+$/.test(first)) continue;

    for (const variant of first.split(",")) {
      const term = variant.trim().toLowerCase();
      if (term !== "") terms.push(term);
    }
  }

  if (terms.length === 0) {
    throw new Error(
      `Aucun terme interdit extrait de ${LEXIQUE_DOC_PATH}. Un lexique vide laisserait passer ` +
        `n'importe quel texte : c'est une erreur, pas un cas limite.`,
    );
  }

  return terms;
}

export interface LexiqueViolation {
  term: string;
  index: number;
}

/**
 * Repère les termes interdits présents dans un texte visible par un client.
 *
 * La correspondance se fait sur des mots entiers : « agent » est interdit, « agenda » ne l'est
 * pas. Les pages légales sont exemptées (`docs/17-lexique.md`, cas particuliers) — c'est à
 * l'appelant de ne pas les soumettre.
 */
export function findForbiddenTerms(text: string, forbiddenTerms: readonly string[]): LexiqueViolation[] {
  const violations: LexiqueViolation[] = [];

  for (const term of forbiddenTerms) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
    for (const match of text.matchAll(pattern)) {
      violations.push({ term, index: match.index });
    }
  }

  return violations.sort((a, b) => a.index - b.index);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
