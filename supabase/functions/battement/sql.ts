/**
 * PROTOTYPE D16 — `SqlClient` sous Deno.
 *
 * ══ CE QUE CE FICHIER PROUVE, ET RIEN DE PLUS ══
 *
 * Que le port `SqlClient` de `packages/db` est **implémentable sous Deno sans toucher au
 * domaine**. C'est exactement ce que [`adr/0021`](../../../docs/adr/0021-execution-serveur-en-ue.md)
 * annonçait (règle 3 : « le pilote Postgres utilisé côté Node n'est pas celui qui tournera côté
 * Deno. Le port existe déjà, l'adaptateur se double »), sans jamais le vérifier.
 *
 * ⚠️ **Prototype.** Il n'a ni pool, ni délai maximal, ni reconnexion. Il ouvre une connexion, sert
 * une invocation, referme. C'est suffisant pour une fonction serveur — qui ne vit pas entre deux
 * requêtes — et insuffisant pour tout le reste. Le worker Node reste la référence tant que D16
 * n'est pas finalisée.
 *
 * ══ LA SEULE VRAIE DIFFÉRENCE AVEC LE PILOTE NODE ══
 *
 * `node-postgres` rend les `bigint` en TEXTE et les lignes en objets. Le pilote Deno rend des
 * objets aussi (`query.object()`), mais **il faut le lui demander** : `query()` rend des tableaux,
 * et `rowToDomain` s'y perdrait en silence. Ce détail est exactement le genre de chose qui ne se
 * découvre qu'en exécutant.
 */

// Déclaré dans `supabase/functions/deno.json` — Deno refuse un préfixe `jsr:` en ligne, et
// il a raison : une version épinglée au milieu d'un fichier se duplique et diverge.
import { Client } from "@db/postgres";

/** Le port de `packages/db`, recopié ici en TYPE seul : une fonction n'importe pas `@sentio/db`. */
export interface SqlClientDeno {
  query<Row>(text: string, params: readonly unknown[]): Promise<Row[]>;
}

export class PostgresDeno implements SqlClientDeno {
  private constructor(private readonly client: Client) {}

  static async connecter(connectionString: string): Promise<PostgresDeno> {
    const client = new Client(connectionString);
    await client.connect();
    return new PostgresDeno(client);
  }

  async query<Row>(text: string, params: readonly unknown[]): Promise<Row[]> {
    // `.object()` et non `.array()` : le domaine lit des colonnes par leur nom.
    const resultat = await this.client.queryObject<Record<string, unknown>>({
      text,
      args: params as unknown[],
    });
    return resultat.rows as Row[];
  }

  async fermer(): Promise<void> {
    await this.client.end();
  }
}
