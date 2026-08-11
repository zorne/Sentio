/**
 * Le pilote Postgres de l'hôte **Deno** — jumeau de `apps/worker/src/adapters/postgres-node.ts`.
 *
 * ⚠️ C'est le **seul** fichier de cet hôte qui connaît un pilote, exactement comme son jumeau Node
 * l'est du sien ([`adr/0021`](../../../docs/adr/0021-execution-serveur-en-ue.md), règle 3 :
 * « le port existe déjà, l'adaptateur se double »). Rien d'autre, dans tout le dépôt, ne sait
 * qu'il existe deux pilotes.
 *
 * ══ CE QUI DIFFÈRE DE NODE, ET POURQUOI ══
 *
 *   · **Le pool est ouvert paresseusement et fermé à la fin de l'invocation.** Une fonction
 *     serveur ne vit pas entre deux requêtes : garder un pool ouvert n'accélérerait rien et
 *     retiendrait des connexions d'une base dont le nombre est étroit.
 *   · **`queryObject`, jamais `query`.** Le pilote Deno rend des tableaux par défaut ; le domaine
 *     lit des colonnes par leur nom. Ce détail ne se voit pas à la compilation — il se voit quand
 *     `rowToDomain` rend un objet vide.
 *   · **Le délai maximal est posé côté serveur** (`statement_timeout`), pas côté client : une
 *     requête emballée doit être coupée par Postgres, sinon elle occupe une connexion d'un pool
 *     très étroit et bloque les autres entreprises.
 *
 * ══ AUCUNE FUITE DE SECRET ══
 *
 * La chaîne de connexion contient un mot de passe. Elle n'est jamais journalisée, jamais reprise
 * dans un message d'erreur, et les erreurs du pilote sont réémises **sans leur cause d'origine**,
 * qui peut la contenir (`AGENTS.md`, invariant 7).
 */

import { Pool, type PoolClient } from "@db/postgres";
import type { SqlClient, TransactionalSqlClient } from "@sentio/db";

/** Erreur de base **dépouillée** : le message d'origine peut porter la chaîne de connexion. */
export class ErreurDeBase extends Error {
  constructor(operation: string) {
    super(`La base a refusé une opération (${operation}).`);
    this.name = "ErreurDeBase";
  }
}

export interface OptionsPostgresDeno {
  /** Connexions simultanées. Étroit à dessein : une fonction sert une invocation à la fois. */
  readonly connexions?: number;
  /** Délai maximal d'une requête, appliqué PAR POSTGRES. */
  readonly delaiMaximalMs?: number;
}

export class PostgresDeno implements TransactionalSqlClient {
  private constructor(
    private readonly pool: Pool,
    private readonly delaiMaximalMs: number,
  ) {}

  static ouvrir(connectionString: string, options: OptionsPostgresDeno = {}): PostgresDeno {
    if (connectionString.trim() === "") {
      throw new Error("Chaîne de connexion vide : la variable d'environnement n'est pas définie.");
    }
    // `lazy` : aucune connexion n'est ouverte tant qu'aucune requête n'arrive. Une invocation qui
    // refuse une signature ne doit pas coûter une connexion.
    return new PostgresDeno(
      new Pool(connectionString, options.connexions ?? 2, true),
      options.delaiMaximalMs ?? 15_000,
    );
  }

  private async avecConnexion<T>(travail: (c: PoolClient) => Promise<T>): Promise<T> {
    const connexion = await this.pool.connect();
    try {
      await connexion.queryObject(`set local statement_timeout = ${this.delaiMaximalMs}`);
      return await travail(connexion);
    } finally {
      connexion.release();
    }
  }

  async query<Row>(text: string, params: readonly unknown[]): Promise<Row[]> {
    try {
      return await this.avecConnexion(async (c) => {
        const resultat = await c.queryObject<Record<string, unknown>>({
          text,
          args: params as unknown[],
        });
        return resultat.rows as Row[];
      });
    } catch {
      // ⚠️ La cause n'est volontairement PAS rattachée : le pilote y recopie la chaîne de
      //    connexion, mot de passe compris, et une erreur finit toujours dans un journal.
      throw new ErreurDeBase("requête");
    }
  }

  withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.avecConnexion(async (connexion) => {
      // ⚠️ DIFFÉRENCE RÉELLE AVEC NODE, trouvée en exécutant : le pilote Deno **verrouille la
      // connexion** au profit de la transaction. Une requête passée à `connexion.queryObject`
      // pendant une transaction lève « This connection is currently locked ». Tout doit passer
      // par l'objet transaction — ce que `pg` n'impose pas. C'est exactement le genre de détail
      // qu'aucune relecture n'attrape et qu'un test de parité attrape du premier coup.
      const transaction = connexion.createTransaction(
        `sentio_${crypto.randomUUID().replaceAll("-", "")}`,
      );
      await transaction.begin();

      const tx: SqlClient = {
        query: async <Row>(text: string, params: readonly unknown[]) => {
          const resultat = await transaction.queryObject<Record<string, unknown>>({
            text,
            args: params as unknown[],
          });
          return resultat.rows as Row[];
        },
      };

      try {
        const resultat = await work(tx);
        await transaction.commit();
        return resultat;
      } catch (erreur) {
        await transaction.rollback().catch(() => undefined);
        throw erreur;
      }
    });
  }

  /** À appeler à la fin de l'invocation. Un pool laissé ouvert retient des connexions. */
  async fermer(): Promise<void> {
    await this.pool.end();
  }
}
