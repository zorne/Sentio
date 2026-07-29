import { DataAccessError } from "./client.js";

/**
 * Les noms de table et de colonne ne peuvent pas être paramétrés par le pilote : ils entrent
 * dans le texte de la requête. Ils sont donc validés puis échappés ici, et nulle part ailleurs.
 *
 * Ces noms viennent aujourd'hui du code, pas d'une entrée utilisateur. On valide quand même :
 * une valeur sûre à l'écriture cesse de l'être le jour où quelqu'un la rend configurable, et ce
 * jour-là personne ne repassera sur ce fichier.
 */

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function quoteIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new DataAccessError(
      `Identifiant SQL refusé : « ${name} ». Attendu : minuscules, chiffres et tirets bas.`,
    );
  }
  return `"${name}"`;
}
