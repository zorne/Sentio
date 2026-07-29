import { describe, expect, it } from "vitest";

import { rowToDomain, toCamelCase, toSnakeCase } from "./naming.js";

describe("toSnakeCase", () => {
  it("traduit les noms du domaine vers les colonnes réelles", () => {
    expect(toSnakeCase("tenantId")).toBe("tenant_id");
    expect(toSnakeCase("employeeDefinitionId")).toBe("employee_definition_id");
    expect(toSnakeCase("sourceTaskId")).toBe("source_task_id");
  });

  it("laisse passer un nom déjà en casse de base", () => {
    expect(toSnakeCase("kind")).toBe("kind");
    expect(toSnakeCase("created_at")).toBe("created_at");
  });
});

describe("toCamelCase", () => {
  it("traduit les colonnes vers les noms du domaine", () => {
    expect(toCamelCase("tenant_id")).toBe("tenantId");
    expect(toCamelCase("employee_definition_id")).toBe("employeeDefinitionId");
    expect(toCamelCase("idempotency_key")).toBe("idempotencyKey");
  });

  it("laisse passer un nom sans séparateur", () => {
    expect(toCamelCase("payload")).toBe("payload");
  });
});

describe("aller-retour", () => {
  it("revient au point de départ sur les noms réellement utilisés", () => {
    // Ce sont les colonnes du schéma, pas des cas inventés : c'est ce qui compte.
    for (const column of [
      "tenant_id",
      "employee_definition_id",
      "identity_id",
      "recruited_at",
      "idempotency_key",
      "source_task_id",
      "usage_count",
      "strategy_change_id",
      "current_period_end",
      "quota_limit",
      "job_priority",
      "target_value",
    ]) {
      expect(toSnakeCase(toCamelCase(column))).toBe(column);
    }
  });
});

describe("rowToDomain", () => {
  it("convertit les clés d'une ligne", () => {
    const domain = rowToDomain<{ tenantId: string; recruitedAt: string }>({
      tenant_id: "abc",
      recruited_at: "2026-07-29",
    });

    expect(domain).toEqual({ tenantId: "abc", recruitedAt: "2026-07-29" });
    expect(domain).not.toHaveProperty("tenant_id");
  });

  it("ne touche pas aux valeurs", () => {
    // Convertir aussi les valeurs reviendrait à interpréter des données dont ce module ne sait
    // rien — un objet JSON du client verrait ses propres clés réécrites.
    const payload = { objet_metier: { cle_client: 1 } };
    const domain = rowToDomain<{ payload: unknown }>({ payload });

    expect(domain.payload).toBe(payload);
    expect(domain.payload).toEqual({ objet_metier: { cle_client: 1 } });
  });

  it("préserve null et les dates", () => {
    const date = new Date("2026-07-29T00:00:00Z");
    const domain = rowToDomain<{ takenAt: Date | null; portraitUrl: string | null }>({
      taken_at: date,
      portrait_url: null,
    });

    expect(domain.takenAt).toBe(date);
    expect(domain.portraitUrl).toBeNull();
  });
});
