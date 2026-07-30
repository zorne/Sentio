/**
 * NOYAU-17 et 18 — le registre de capacités.
 *
 * **Une capacité est un contrat ; un moteur est une implémentation** (`docs/adr/0006`). Le métier
 * dit « envoyer un message », il ne dit jamais « appeler tel service ». Changer de prestataire
 * d'envoi doit être une ligne en base — `capability_binding` — pas une modification de l'ADN ni
 * du runtime.
 *
 * Le registre est aussi ce qui rend une capacité **premium** possible sans condition en dur :
 * la liaison porte la formule, donc un moteur meilleur se réserve à Growth en écrivant une ligne
 * (`docs/06-scalabilite.md`).
 *
 * Réalise : NOYAU-17, NOYAU-18
 */

import type { CapabilityBinding, PlanId } from "@sentio/domain";

import { CapabilityUnavailable } from "../errors.js";
import type { EffectClass } from "../policy/engine.js";

/**
 * Le contrat d'une capacité. Il déclare sa **classe d'effet** : c'est le contrat qui la porte,
 * jamais le moteur, sinon un moteur pourrait se déclarer inoffensif et échapper au Policy Engine.
 */
export interface CapabilityContract {
  readonly key: string;
  readonly effectClass: EffectClass;
  /** Description destinée à l'employé, en français, soumise au lexique. */
  readonly description: string;
}

/** Un moteur : l'implémentation remplaçable d'un contrat. */
export interface CapabilityEngine<Input = unknown, Output = unknown> {
  readonly engineKey: string;
  readonly capabilityKey: string;
  execute(input: Input): Promise<Output>;
}

export class CapabilityRegistry {
  private readonly contracts = new Map<string, CapabilityContract>();
  private readonly engines = new Map<string, CapabilityEngine>();

  registerContract(contract: CapabilityContract): void {
    this.contracts.set(contract.key, contract);
  }

  registerEngine(engine: CapabilityEngine): void {
    if (!this.contracts.has(engine.capabilityKey)) {
      throw new CapabilityUnavailable(
        `Moteur « ${engine.engineKey} » enregistré pour une capacité inconnue ` +
          `(« ${engine.capabilityKey} »). Le contrat vient toujours avant le moteur.`,
      );
    }
    this.engines.set(engine.engineKey, engine);
  }

  contract(capabilityKey: string): CapabilityContract {
    const contract = this.contracts.get(capabilityKey);
    if (contract === undefined) {
      throw new CapabilityUnavailable(`Capacité inconnue : « ${capabilityKey} ».`);
    }
    return contract;
  }

  /**
   * NOYAU-18 — résolution `capability_binding` → moteur, pour la formule de l'entreprise.
   *
   * Priorité la plus haute d'abord. Une liaison qui désigne un moteur non enregistré est **sautée**
   * plutôt que fatale : c'est le cas normal d'un moteur livré plus tard que sa ligne de
   * configuration. Mais si aucune ne répond, on échoue franchement — un employé qui ne peut pas
   * agir doit le dire, pas travailler à moitié.
   */
  resolve(input: {
    capabilityKey: string;
    planId: PlanId;
    bindings: readonly CapabilityBinding[];
    /** Traduit l'identifiant de capacité de la liaison vers la clé du contrat. */
    capabilityKeyOf: (binding: CapabilityBinding) => string;
  }): CapabilityEngine {
    const contract = this.contract(input.capabilityKey);

    const candidates = input.bindings
      .filter(
        (binding) =>
          binding.planId === input.planId &&
          input.capabilityKeyOf(binding) === contract.key,
      )
      .sort((a, b) => b.priority - a.priority);

    for (const binding of candidates) {
      const engine = this.engines.get(binding.engineKey);
      if (engine !== undefined) return engine;
    }

    throw new CapabilityUnavailable(
      `Aucun moteur disponible pour « ${contract.key} » sur cette formule. ` +
        `Liaisons examinées : ${candidates.map((c) => c.engineKey).join(", ") || "aucune"}.`,
    );
  }
}
