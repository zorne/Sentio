/**
 * NOYAU-18 — quel moteur sert quelle capacité, pour la formule de CETTE entreprise.
 *
 * La résolution elle-même vit dans le noyau (`CapabilityRegistry.resolve`) ; ce qui vit ici, c'est
 * la lecture des liaisons en base. La séparation n'est pas cosmétique : c'est elle qui permet de
 * remplacer le moteur derrière une capacité **en modifiant une ligne de `capability_binding`**,
 * sans toucher à un seul employé existant (exigence §21 de la vision, `adr/0006`).
 *
 * ⚠️ Aucune condition sur le nom de la formule ici, ni ailleurs. Réserver une capacité à Growth
 * est une ligne de données, jamais un `if` (`docs/03-modele-de-donnees.md`).
 *
 * Réalise : EXEC-12
 */

import { CapabilityUnavailable, type CapabilityEngine, type CapabilityRegistry } from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import type { CapabilityBinding, PlanId, TenantId } from "@sentio/domain";

export class PostgresMoteurs {
  constructor(
    private readonly sql: SqlClient,
    private readonly registry: CapabilityRegistry,
  ) {}

  /**
   * Le moteur à appeler pour cette capacité, dans cette entreprise.
   *
   * ⚠️ Sans abonnement actif, on échoue **franchement** au lieu de retomber sur une formule par
   * défaut. Un employé qui agirait avec les moteurs d'une formule que son client ne paie pas est
   * exactement ce que `capability_binding` existe pour empêcher.
   */
  async pour(tenantId: TenantId, capabilityKey: string): Promise<CapabilityEngine> {
    const [abonnement] = await this.sql.query<{ plan_id: string }>(
      `select plan_id from subscription
        where tenant_id = $1 and status = 'active'
          and now() >= current_period_start and now() < current_period_end
        limit 1`,
      [tenantId],
    );
    if (abonnement === undefined) {
      throw new CapabilityUnavailable(
        `Aucun abonnement actif : « ${capabilityKey} » n'a aucun moteur pour cette entreprise.`,
      );
    }

    const lignes = await this.sql.query<{
      id: string;
      capability_id: string;
      plan_id: string;
      engine_key: string;
      priority: number;
      capability_key: string;
    }>(
      `select b.id, b.capability_id, b.plan_id, b.engine_key, b.priority, c.key as capability_key
         from capability_binding b
         join capability c on c.id = b.capability_id
        where b.plan_id = $1 and c.key = $2
        order by b.priority desc`,
      [abonnement.plan_id, capabilityKey],
    );

    const cles = new Map(lignes.map((ligne) => [ligne.id, ligne.capability_key]));
    const bindings: CapabilityBinding[] = lignes.map((ligne) => ({
      id: ligne.id as CapabilityBinding["id"],
      capabilityId: ligne.capability_id as CapabilityBinding["capabilityId"],
      planId: ligne.plan_id as PlanId,
      engineKey: ligne.engine_key,
      priority: Number(ligne.priority),
    }));

    return this.registry.resolve({
      capabilityKey,
      planId: abonnement.plan_id as PlanId,
      bindings,
      capabilityKeyOf: (binding) => cles.get(binding.id) ?? "",
    });
  }
}
