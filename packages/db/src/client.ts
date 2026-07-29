/**
 * Interface du pilote de base.
 *
 * Le code d'accès aux données ne connaît ni Supabase, ni PostgREST, ni le pilote retenu : une
 * migration d'hébergeur est probable dès le premier client payant (`docs/02-architecture.md`),
 * et elle doit rester un fichier à réécrire, pas l'ensemble des repositories.
 *
 * Conséquence pratique : les tests s'écrivent contre un faux client, sans base.
 */
export interface SqlClient {
  /**
   * Exécute une requête paramétrée. Les valeurs ne sont **jamais** interpolées dans le texte :
   * c'est la seule protection contre l'injection, et elle n'est pas négociable.
   */
  query<Row>(text: string, params: readonly unknown[]): Promise<Row[]>;
}

/** Erreur d'usage du client — distincte d'une erreur remontée par la base. */
export class DataAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataAccessError";
  }
}
