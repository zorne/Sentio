import { describe, expect, it } from "vitest";

import { DataAccessError, type SqlClient } from "./client.js";
import { ExecutionJournal } from "./journal.js";
import { GlobalReadRepository, TenantScopedRepository } from "./repository.js";
import { TenantScope } from "./tenant-scope.js";

const TENANT_A = "aaaaaaaa-0000-0000-0000-000000000001";
const TENANT_B = "bbbbbbbb-0000-0000-0000-000000000002";

/** Client factice : enregistre ce qui aurait été exécuté, sans base. */
class RecordingClient implements SqlClient {
  readonly calls: { text: string; params: readonly unknown[] }[] = [];

  constructor(private readonly rows: unknown[] = []) {}

  async query<Row>(text: string, params: readonly unknown[]): Promise<Row[]> {
    this.calls.push({ text, params });
    return this.rows as Row[];
  }

  get lastCall() {
    const call = this.calls.at(-1);
    if (call === undefined) throw new Error("aucune requête exécutée");
    return call;
  }
}

describe("TenantScope", () => {
  it("refuse une portée vide", () => {
    expect(() => TenantScope.of("")).toThrow(DataAccessError);
  });

  it("refuse une portée malformée", () => {
    // Le danger n'est pas l'injection — les valeurs sont paramétrées — mais le silence :
    // une portée invalide produirait une requête qui ne remonte rien.
    expect(() => TenantScope.of("tenant-a")).toThrow(/invalide/);
  });

  it("accepte un identifiant d'entreprise", () => {
    expect(TenantScope.of(TENANT_A).tenantId).toBe(TENANT_A);
  });
});

describe("TenantScopedRepository — la portée d'entreprise est toujours appliquée", () => {
  const scope = TenantScope.of(TENANT_A);

  it("filtre par entreprise sur une lecture par identifiant", async () => {
    const sql = new RecordingClient();
    await new TenantScopedRepository(sql, "task", scope).findById("t-1");

    expect(sql.lastCall.text).toContain('"tenant_id" = $1');
    expect(sql.lastCall.params[0]).toBe(TENANT_A);
  });

  it("filtre par entreprise sur une liste, même sans filtre demandé", async () => {
    const sql = new RecordingClient();
    await new TenantScopedRepository(sql, "notification", scope).list();

    expect(sql.lastCall.text).toContain('"tenant_id" = $1');
    expect(sql.lastCall.params).toEqual([TENANT_A]);
  });

  it("conserve la portée quand d'autres filtres s'ajoutent", async () => {
    const sql = new RecordingClient();
    await new TenantScopedRepository(sql, "task", scope).list({ state: "pending" });

    expect(sql.lastCall.text).toContain('"tenant_id" = $1');
    expect(sql.lastCall.text).toContain('"state" = $2');
    expect(sql.lastCall.params).toEqual([TENANT_A, "pending"]);
  });

  it("force l'entreprise à l'insertion", async () => {
    const sql = new RecordingClient([{ id: "o-1" }]);
    await new TenantScopedRepository(sql, "objective", scope).insert({ metric: "ca" });

    expect(sql.lastCall.params[0]).toBe(TENANT_A);
  });

  it("refuse un tenant_id fourni par l'appelant, même correct", async () => {
    // L'accepter ouvrirait un chemin pour écrire chez un autre client. Cette possibilité ne
    // doit pas exister, pas même sous une forme « correcte ».
    const sql = new RecordingClient([{}]);
    const repo = new TenantScopedRepository(sql, "objective", scope);

    await expect(repo.insert({ tenant_id: TENANT_A, metric: "ca" })).rejects.toThrow(
      /portée du repository fait foi/,
    );
    await expect(repo.insert({ tenant_id: TENANT_B, metric: "ca" })).rejects.toThrow(
      DataAccessError,
    );
    expect(sql.calls).toHaveLength(0);
  });

  it("interdit de déplacer une ligne vers une autre entreprise", async () => {
    const sql = new RecordingClient([{}]);
    const repo = new TenantScopedRepository(sql, "objective", scope);

    await expect(repo.update("o-1", { tenant_id: TENANT_B })).rejects.toThrow(
      /ne change pas d'entreprise/,
    );
    // Le garde couvre les deux casses : refuser `tenant_id` en laissant passer `tenantId`
    // n'aurait protégé qu'une écriture sur deux.
    await expect(repo.update("o-1", { tenantId: TENANT_B })).rejects.toThrow(DataAccessError);
    expect(sql.calls).toHaveLength(0);
  });

  it("borne la mise à jour à l'entreprise et à la ligne", async () => {
    const sql = new RecordingClient([{ id: "o-1" }]);
    await new TenantScopedRepository(sql, "objective", scope).update("o-1", { horizon: "2027" });

    expect(sql.lastCall.text).toContain('"tenant_id" = $1');
    expect(sql.lastCall.text).toContain('"id" = $2');
    expect(sql.lastCall.params.slice(0, 2)).toEqual([TENANT_A, "o-1"]);
  });

  it("deux portées ne produisent jamais la même requête", async () => {
    const sql = new RecordingClient();
    await new TenantScopedRepository(sql, "task", TenantScope.of(TENANT_A)).list();
    await new TenantScopedRepository(sql, "task", TenantScope.of(TENANT_B)).list();

    expect(sql.calls[0]?.params).toEqual([TENANT_A]);
    expect(sql.calls[1]?.params).toEqual([TENANT_B]);
  });
});

describe("Identifiants SQL", () => {
  const scope = TenantScope.of(TENANT_A);

  it("refuse un nom de table hostile", () => {
    expect(() => new TenantScopedRepository(new RecordingClient(), 'task"; drop table task; --', scope))
      .toThrow(DataAccessError);
  });

  it("refuse un nom de colonne hostile dans un filtre", async () => {
    const repo = new TenantScopedRepository(new RecordingClient(), "task", scope);
    await expect(repo.list({ 'state" or "1' : "x" })).rejects.toThrow(DataAccessError);
  });

  it("refuse une limite absurde", async () => {
    const repo = new TenantScopedRepository(new RecordingClient(), "task", scope);
    await expect(repo.list({}, { limit: -1 })).rejects.toThrow(/Limite invalide/);
    await expect(repo.list({}, { limit: 1.5 })).rejects.toThrow(/Limite invalide/);
  });

  it("n'accepte que asc ou desc comme sens de tri", async () => {
    const sql = new RecordingClient();
    const repo = new TenantScopedRepository(sql, "notification", scope);

    await repo.list({}, { orderBy: "created_at", direction: "desc" });
    expect(sql.lastCall.text).toContain("desc");

    await repo.list({}, { orderBy: "created_at" });
    expect(sql.lastCall.text).toContain("asc");
  });
});

describe("GlobalReadRepository", () => {
  it("n'ajoute aucune condition d'entreprise sur une table globale", async () => {
    const sql = new RecordingClient();
    await new GlobalReadRepository(sql, "plan").list();

    expect(sql.lastCall.text).not.toContain("tenant_id");
  });

  it("n'expose ni insertion ni mise à jour", () => {
    const repo = new GlobalReadRepository(new RecordingClient(), "employee_definition");

    // L'ADN se publie en nouvelle version, il ne s'écrit pas à l'exécution. L'absence de ces
    // méthodes est le verrou d'écriture, pas un oubli.
    expect("insert" in repo).toBe(false);
    expect("update" in repo).toBe(false);
  });
});

describe("ExecutionJournal", () => {
  const scope = TenantScope.of(TENANT_A);

  it("n'expose aucune mise à jour ni suppression", () => {
    const journal = new ExecutionJournal(new RecordingClient(), scope);

    expect("update" in journal).toBe(false);
    expect("delete" in journal).toBe(false);
  });

  it("porte l'entreprise et la clé d'idempotence sur un ajout", async () => {
    const sql = new RecordingClient([{ id: "e-1" }]);
    await new ExecutionJournal(sql, scope).append({
      taskId: "t-1",
      employeeId: "emp-1",
      kind: "message_envoye",
      idempotencyKey: "envoi-42",
    });

    expect(sql.lastCall.params[0]).toBe(TENANT_A);
    expect(sql.lastCall.params).toContain("envoi-42");
  });

  it("accepte une absence de clé, mais seulement explicite", async () => {
    const sql = new RecordingClient([{ id: "e-2" }]);
    await new ExecutionJournal(sql, scope).append({
      taskId: null,
      employeeId: null,
      kind: "raisonnement",
      idempotencyKey: null,
    });

    expect(sql.lastCall.params).toContain(null);
  });

  it("refuse un événement sans nature", async () => {
    const journal = new ExecutionJournal(new RecordingClient(), scope);
    await expect(journal.append({ taskId: null, employeeId: null, kind: "  ", idempotencyKey: null }))
      .rejects.toThrow(DataAccessError);
  });

  it("borne la lecture d'une tâche à l'entreprise", async () => {
    const sql = new RecordingClient();
    await new ExecutionJournal(sql, scope).forTask("t-1");

    expect(sql.lastCall.text).toContain('"tenant_id" = $1');
    expect(sql.lastCall.params).toEqual([TENANT_A, "t-1"]);
  });
});
