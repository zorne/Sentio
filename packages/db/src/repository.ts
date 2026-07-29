import { DataAccessError, type SqlClient } from "./client.js";
import { quoteIdentifier } from "./identifiers.js";
import type { TenantScope } from "./tenant-scope.js";

/** Conditions d'égalité simples. Tout le reste passe par un repository spécifique. */
export type Filter = Readonly<Record<string, unknown>>;

export interface ListOptions {
  readonly orderBy?: string;
  readonly direction?: "asc" | "desc";
  readonly limit?: number;
}

/**
 * Repository d'une table portant `tenant_id`.
 *
 * ⚠️ La condition d'entreprise est ajoutée **par le repository**, jamais par l'appelant. Il
 * n'existe aucune méthode publique permettant d'interroger la table sans elle : c'est tout
 * l'objet de `docs/adr/0013`.
 *
 * Pourquoi ce n'est pas redondant avec RLS : `apps/worker` tourne avec un rôle de service, qui
 * **contourne RLS** — un employé numérique travaille sans utilisateur connecté, donc sans jeton.
 * Sur ce chemin, le seul rempart est celui-ci.
 */
export class TenantScopedRepository<Row> {
  private readonly table: string;

  constructor(
    private readonly sql: SqlClient,
    table: string,
    private readonly scope: TenantScope,
  ) {
    this.table = quoteIdentifier(table);
  }

  async findById(id: string): Promise<Row | null> {
    const rows = await this.sql.query<Row>(
      `select * from ${this.table} where "tenant_id" = $1 and "id" = $2 limit 1`,
      [this.scope.tenantId, id],
    );
    return rows[0] ?? null;
  }

  async list(filter: Filter = {}, options: ListOptions = {}): Promise<Row[]> {
    const params: unknown[] = [this.scope.tenantId];
    const conditions = ['"tenant_id" = $1'];

    for (const [column, value] of Object.entries(filter)) {
      params.push(value);
      conditions.push(`${quoteIdentifier(column)} = $${params.length}`);
    }

    let text = `select * from ${this.table} where ${conditions.join(" and ")}`;

    if (options.orderBy !== undefined) {
      const direction = options.direction === "desc" ? "desc" : "asc";
      text += ` order by ${quoteIdentifier(options.orderBy)} ${direction}`;
    }

    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit <= 0) {
        throw new DataAccessError(`Limite invalide : ${options.limit}.`);
      }
      params.push(options.limit);
      text += ` limit $${params.length}`;
    }

    return this.sql.query<Row>(text, params);
  }

  /**
   * Insère une ligne en forçant l'entreprise.
   *
   * Un `tenant_id` fourni par l'appelant est **refusé**, même s'il est correct : l'accepter
   * ouvrirait un chemin pour écrire chez un autre client, et cette possibilité ne doit pas
   * exister. La portée fait foi, toujours.
   */
  async insert(values: Readonly<Record<string, unknown>>): Promise<Row> {
    if ("tenant_id" in values) {
      throw new DataAccessError(
        "tenant_id ne se passe pas en argument : la portée du repository fait foi.",
      );
    }

    const columns = ['"tenant_id"'];
    const params: unknown[] = [this.scope.tenantId];

    for (const [column, value] of Object.entries(values)) {
      columns.push(quoteIdentifier(column));
      params.push(value);
    }

    const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await this.sql.query<Row>(
      `insert into ${this.table} (${columns.join(", ")}) values (${placeholders}) returning *`,
      params,
    );

    const inserted = rows[0];
    if (inserted === undefined) {
      throw new DataAccessError(`Insertion sans ligne retournée dans ${this.table}.`);
    }
    return inserted;
  }

  async update(id: string, values: Readonly<Record<string, unknown>>): Promise<Row | null> {
    if ("tenant_id" in values) {
      throw new DataAccessError("tenant_id n'est pas modifiable : une ligne ne change pas d'entreprise.");
    }

    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new DataAccessError("Mise à jour sans aucune colonne.");
    }

    const params: unknown[] = [this.scope.tenantId, id];
    const assignments = entries.map(([column, value]) => {
      params.push(value);
      return `${quoteIdentifier(column)} = $${params.length}`;
    });

    const rows = await this.sql.query<Row>(
      `update ${this.table} set ${assignments.join(", ")} ` +
        `where "tenant_id" = $1 and "id" = $2 returning *`,
      params,
    );
    return rows[0] ?? null;
  }
}

/**
 * Repository d'une table **globale** : formules, capacités, ADN, profils sectoriels.
 *
 * Ces tables ne portent aucune donnée client, donc aucune portée. La distinction est portée par
 * le type et non par une convention de nommage : impossible d'interroger une table client par
 * ce chemin, ni une table globale par l'autre.
 *
 * Lecture seule : ces données sont semées par migration ou publiées en nouvelle version — jamais
 * écrites à l'exécution (`docs/04-contextes-memoire.md`).
 */
export class GlobalReadRepository<Row> {
  private readonly table: string;

  constructor(
    private readonly sql: SqlClient,
    table: string,
  ) {
    this.table = quoteIdentifier(table);
  }

  async findById(id: string): Promise<Row | null> {
    const rows = await this.sql.query<Row>(
      `select * from ${this.table} where "id" = $1 limit 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async list(filter: Filter = {}): Promise<Row[]> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    for (const [column, value] of Object.entries(filter)) {
      params.push(value);
      conditions.push(`${quoteIdentifier(column)} = $${params.length}`);
    }

    const where = conditions.length > 0 ? ` where ${conditions.join(" and ")}` : "";
    return this.sql.query<Row>(`select * from ${this.table}${where}`, params);
  }
}
