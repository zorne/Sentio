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
 *
 * Réalise : NOYAU-21
 */

import { createHash } from "node:crypto";

/**
 * L'empreinte d'un EFFET, pas d'un pas de run.
 *
 * ⚠️ **Correction EXEC-06.** L'empreinte incluait `taskId` et `step`. Elle répondait donc à
 * « ce run est-il déjà passé par ici ? » — et pas à la seule question qui protège le prospect :
 * « cet effet a-t-il déjà eu lieu ? ». Deux runs, ou deux tâches, qui décidaient d'écrire au
 * même prospect le même message produisaient deux clés différentes, donc **deux emails**. La
 * contrainte d'unicité en base ne voyait rien à refuser.
 *
 * Ce qui identifie un effet, c'est l'entreprise, la capacité, et ce que l'action va réellement
 * faire — jamais le chemin par lequel on y est arrivé.
 *
 * Une relance légitime n'est pas bloquée par ce choix : elle porte un contenu ou une date
 * différents, donc un effet différent. Ce qui est bloqué, c'est le rejeu à l'identique — qui est
 * précisément ce qu'une panne produit.
 */
export interface ActionFingerprint {
  readonly tenantId: string;
  readonly capabilityKey: string;
  /**
   * Ce qui identifie l'effet lui-même — destinataire, référence, contenu. Deux envois au même
   * prospect avec le même message sont le **même** envoi ; deux destinataires différents sont
   * deux actions.
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
