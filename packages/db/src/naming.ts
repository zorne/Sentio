/**
 * Traduction entre les conventions du domaine et celles de la base.
 *
 * `docs/02-architecture.md` impose le code et les tables en anglais, mais rien n'y aligne les
 * conventions de casse : le domaine écrit `employeeDefinitionId`, Postgres renvoie
 * `employee_definition_id`. Sans traduction explicite, un repository typé sur le domaine ment —
 * il annonce des champs que la ligne ne porte pas, et ils valent `undefined` à l'exécution.
 *
 * Ce module est le seul endroit où les deux conventions se rencontrent. Le domaine n'apprend
 * jamais que la base existe.
 */

/** `employeeDefinitionId` → `employee_definition_id` */
export function toSnakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** `employee_definition_id` → `employeeDefinitionId` */
export function toCamelCase(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

/**
 * Convertit une ligne renvoyée par la base en objet du domaine.
 *
 * Ne touche qu'aux **clés**. Les valeurs traversent telles quelles : convertir aussi les valeurs
 * reviendrait à interpréter des données dont ce module ne sait rien.
 */
export function rowToDomain<Row>(row: Record<string, unknown>): Row {
  const converted: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    converted[toCamelCase(column)] = value;
  }
  return converted as Row;
}
