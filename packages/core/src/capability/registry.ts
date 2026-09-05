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

/**
 * De quelle mission une action fait partie.
 *
 * ⚠️ Ce contexte n'est **jamais** rempli par le modèle : il vient de la base, au moment d'agir
 * (`packages/runtime/src/attelage.ts`). Certains moteurs en ont besoin — consigner une note
 * demande de savoir quel employé l'a écrite — et le leur faire lire dans l'entrée du modèle
 * reviendrait à laisser une réponse de modèle désigner sur qui agir.
 */
export interface ContexteDExecution {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly taskId: string;
}

/**
 * Un moteur : l'implémentation remplaçable d'un contrat.
 *
 * Le second argument est déclaré ici parce que les moteurs le reçoivent réellement. Le taire
 * obligerait chaque montage à une conversion de type — c'est-à-dire à affirmer au compilateur
 * quelque chose que le port refusait de dire.
 */
export interface CapabilityEngine<Input = unknown, Output = unknown> {
  readonly engineKey: string;
  readonly capabilityKey: string;
  execute(input: Input, contexte: ContexteDExecution): Promise<Output>;
}

export class CapabilityRegistry {
  private readonly contracts = new Map<string, CapabilityContract>();
  private readonly engines = new Map<string, CapabilityEngine>();

  registerContract(contract: CapabilityContract): void {
    this.contracts.set(contract.key, contract);
  }

  /**
   * ⚠️ La clé d'un moteur est **(capacité, moteur)**, jamais le nom du moteur seul.
   *
   * `capability_binding` nomme le moteur « base » pour les cinq capacités de l'ADN Commercial :
   * c'est le nom d'une implémentation *pour une capacité*, pas un identifiant global. Ranger les
   * moteurs par ce seul nom faisait s'écraser le second sur le premier — et « qualifier un
   * prospect » exécutait « mettre à jour une fiche ». Silencieusement, avec les bons journaux.
   *
   * Trouvé le jour où deux moteurs ont été montés ensemble pour la première fois (EXEC-19). Un
   * doublon exact est donc refusé plutôt qu'écrasé : une redéfinition en silence est ce qui
   * rendait la panne invisible.
   */
  registerEngine(engine: CapabilityEngine): void {
    if (!this.contracts.has(engine.capabilityKey)) {
      throw new CapabilityUnavailable(
        `Moteur « ${engine.engineKey} » enregistré pour une capacité inconnue ` +
          `(« ${engine.capabilityKey} »). Le contrat vient toujours avant le moteur.`,
      );
    }
    const cle = CapabilityRegistry.cleDuMoteur(engine.capabilityKey, engine.engineKey);
    if (this.engines.has(cle)) {
      throw new CapabilityUnavailable(
        `Deux moteurs « ${engine.engineKey} » pour « ${engine.capabilityKey} ». Le second ` +
          "remplacerait le premier sans que rien ne le signale.",
      );
    }
    this.engines.set(cle, engine);
  }

  /**
   * Un moteur — n'importe lequel — sert-il cette capacité sur CET hôte ?
   *
   * ⚠️ **LE REGISTRE EST LE FAIT ; `capability.disponible` EST UNE DÉCLARATION.** La colonne dit
   * ce que la composition par défaut monte, et son propre commentaire précise à quoi elle sert :
   * « ni l'espace client ni le diagnostic ne doivent la présenter comme acquise ». C'est une
   * information d'AFFICHAGE.
   *
   * Le runtime, lui, doit savoir ce qui est monté **ici** : un hôte peut fournir ses propres
   * moteurs (`moteursMetier`, le point d'accroche prévu pour l'expédition réelle), et se fier à
   * la colonne écarterait des capacités que cet hôte sert réellement.
   *
   * Sert à ne pas proposer au modèle ce qu'aucun moteur ne pourrait exécuter — une économie
   * d'appel payant, jamais une frontière : `resolve` refuse toujours, pour ce qui n'est pas passé
   * par là.
   */
  sertLaCapacite(capabilityKey: string): boolean {
    const prefixe = `${capabilityKey}::`;
    for (const cle of this.engines.keys()) {
      if (cle.startsWith(prefixe)) return true;
    }
    return false;
  }

  private static cleDuMoteur(capabilityKey: string, engineKey: string): string {
    return `${capabilityKey}::${engineKey}`;
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
      const engine = this.engines.get(
        CapabilityRegistry.cleDuMoteur(contract.key, binding.engineKey),
      );
      if (engine !== undefined) return engine;
    }

    throw new CapabilityUnavailable(
      `Aucun moteur disponible pour « ${contract.key} » sur cette formule. ` +
        `Liaisons examinées : ${candidates.map((c) => c.engineKey).join(", ") || "aucune"}.`,
    );
  }
}
