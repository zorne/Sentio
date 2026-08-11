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

/**
 * Un client capable de **transactions**.
 *
 * Séparé de `SqlClient` parce que tout le monde n'en a pas besoin, et parce que c'est le pilote
 * qui le fournit — pas le domaine. Les deux hôtes l'implémentent : `pg` côté Node, le pilote Deno
 * côté fonction serveur ([`adr/0028`](../../../docs/adr/0028-executant-en-fonction-serveur.md)).
 * Le runtime, lui, ne connaît que ce port : c'est ce qui lui permet de tourner sur les deux sans
 * une ligne de différence.
 */
export interface TransactionalSqlClient extends SqlClient {
  withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T>;
}

/** Erreur d'usage du client — distincte d'une erreur remontée par la base. */
export class DataAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataAccessError";
  }
}
