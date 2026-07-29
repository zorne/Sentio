/**
 * NOYAU-21 — la clé d'idempotence.
 *
 * ⚠️ L'un des deux seuls points de l'architecture qui ne se rattrapent pas après coup (l'autre
 * étant l'isolation par entreprise). Sans elle, la première panne réelle se traduit par un
 * prospect contacté deux fois — c'est-à-dire par un client qui perd confiance en son employé
 * (`docs/05-runtime-employe.md`).
 *
 * La clé est **déterministe** : les mêmes conditions produisent la même clé, donc un rejeu se
 * heurte à la contrainte d'unicité de `execution_event`. C'est bien la base qui refuse le doublon,
 * jamais le code appelant — un garde en mémoire ne survivrait pas au redémarrage qui provoque
 * précisément le rejeu.
 */

import { createHash } from "node:crypto";

export interface ActionFingerprint {
  readonly tenantId: string;
  readonly taskId: string;
  /** Numéro du pas dans le run : deux pas différents sont deux actions différentes. */
  readonly step: number;
  readonly capabilityKey: string;
  /**
   * Ce qui identifie l'effet lui-même — destinataire, référence, contenu. Deux envois au même
   * prospect dans le même pas sont le **même** envoi ; deux destinataires différents sont deux
   * actions.
   */
  readonly effect: unknown;
}

/**
 * Construit la clé. Le hachage sert à borner la longueur et à ne pas recopier de donnée
 * personnelle dans un champ qui, lui, survit à l'anonymisation du journal.
 */
export function idempotencyKeyFor(fingerprint: ActionFingerprint): string {
  const canonical = JSON.stringify([
    fingerprint.tenantId,
    fingerprint.taskId,
    fingerprint.step,
    fingerprint.capabilityKey,
    stableStringify(fingerprint.effect),
  ]);
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 32);
  return `${fingerprint.capabilityKey}:${digest}`;
}

/**
 * Sérialisation stable : sans elle, `{a:1,b:2}` et `{b:2,a:1}` produiraient deux clés pour la
 * même action, et le rejeu passerait. C'est le genre de détail qui ne se voit qu'en production.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** Levée quand une action à effet extérieur est présentée sans clé. */
export class MissingIdempotencyKey extends Error {
  constructor(capabilityKey: string) {
    super(
      `L'action « ${capabilityKey} » a un effet extérieur et se présente sans clé d'idempotence. ` +
        `Refusé : un rejeu enverrait deux fois le même message.`,
    );
    this.name = "MissingIdempotencyKey";
  }
}

/**
 * Garde à poser devant toute exécution de capacité à effet extérieur.
 *
 * Il ne remplace pas la contrainte d'unicité en base : il attrape l'oubli **avant** l'appel, là
 * où l'erreur est encore lisible.
 */
export function assertIdempotent(effectClass: string, key: string | null | undefined, capabilityKey: string): void {
  if (effectClass !== "external_irreversible") return;
  if (key === null || key === undefined || key.trim() === "") {
    throw new MissingIdempotencyKey(capabilityKey);
  }
}
