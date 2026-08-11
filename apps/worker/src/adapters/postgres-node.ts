import { Pool, type PoolConfig } from "pg";

import type { SqlClient, TransactionalSqlClient } from "@sentio/db";

/**
 * Implémentation de `SqlClient` sur Postgres.
 *
 * ⚠️ C'est le **seul** fichier du dépôt qui connaît le pilote. `docs/02-architecture.md` impose
 * de rester indépendant de l'hébergeur : une migration est probable dès le premier client payant,
 * et elle doit rester ce fichier à réécrire, pas l'ensemble du code d'accès.
 *
 * Rien ici ne sait ce qu'est une entreprise, un employé ou une capacité. L'isolation appartient
 * aux repositories (`docs/adr/0013`).
 */
export class PostgresClient implements TransactionalSqlClient {
  constructor(private readonly pool: Pool) {}

  async query<Row>(text: string, params: readonly unknown[]): Promise<Row[]> {
    const result = await this.pool.query(text, params as unknown[]);
    return result.rows as Row[];
  }

  /**
   * Exécute plusieurs requêtes dans une seule transaction, sur une seule connexion.
   *
   * Indispensable dès qu'une opération doit être atomique ou tout échouer ensemble — la
   * transaction de recrutement en quatre temps (`docs/20-plan-action.md`, phase 6) en est
   * l'exemple type : réserver l'identité, créer l'employé, initialiser son contexte, notifier.
   * Un échec au troisième temps ne doit pas laisser une identité consommée pour rien.
   *
   * Nécessaire aussi pour tout `set local` : hors transaction, un réglage local n'a aucune portée.
   */
  async withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T> {
    const connection = await this.pool.connect();
    const tx: SqlClient = {
      query: async <Row>(text: string, params: readonly unknown[]) => {
        const result = await connection.query(text, params as unknown[]);
        return result.rows as Row[];
      },
    };

    try {
      await connection.query("begin");
      const outcome = await work(tx);
      await connection.query("commit");
      return outcome;
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }

  /** À appeler à l'arrêt du processus. Un pool non fermé retient le processus en vie. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface PostgresClientOptions {
  /**
   * Délai au-delà duquel une requête est abandonnée.
   *
   * Sur une base en offre gratuite, une requête emballée ne coûte pas seulement de la latence :
   * elle occupe une connexion d'un pool très étroit, et bloque les autres entreprises. Un délai
   * par défaut vaut mieux qu'aucun.
   */
  readonly statementTimeoutMs?: number;
  readonly maxConnections?: number;
}

/**
 * Ouvre un pool de connexions.
 *
 * ⚠️ La chaîne de connexion contient un mot de passe. Elle vient d'une variable d'environnement,
 * jamais du dépôt (`AGENTS.md`, invariant 7), et n'est **jamais** journalisée — y compris dans un
 * message d'erreur, où elle finirait dans un outil de suivi d'erreurs.
 */
export function createPostgresClient(
  connectionString: string,
  options: PostgresClientOptions = {},
): PostgresClient {
  if (connectionString.trim() === "") {
    throw new Error("Chaîne de connexion vide : la variable d'environnement n'est pas définie.");
  }

  const config: PoolConfig = {
    connectionString,
    max: options.maxConnections ?? 5,
    statement_timeout: options.statementTimeoutMs ?? 15_000,
    // Le certificat d'un hébergeur managé n'est pas dans le magasin local. On chiffre malgré
    // tout : sans cette option, `pg` refuserait la connexion et la tentation serait de tout
    // désactiver.
    ssl: requiresSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  };

  return new PostgresClient(new Pool(config));
}

/** Une base locale de test n'a pas de TLS ; une base managée en exige un. */
function requiresSsl(connectionString: string): boolean {
  return !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
}
