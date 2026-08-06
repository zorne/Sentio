/**
 * Le vocabulaire du journal — la liste close des natures d'événement.
 *
 * Close, et c'est le point : `execution_event.kind` est un `text` libre en base, parce que la
 * table doit survivre à l'ajout d'un métier sans migration. Mais la **reconstruction**, elle, ne
 * peut pas se permettre d'ignorer poliment une nature qu'elle ne connaît pas — un événement muet
 * est exactement ce qui produirait un état faux en silence. D'où cette liste : ce qui n'y figure
 * pas fait échouer la reconstruction, au lieu d'être sauté.
 *
 * Réalise : EXEC-02
 */

/** Le run commence. Premier événement de toute tâche, sans exception. */
export const RUN_DEMARRE = "run_demarre";
/** Le modèle a choisi une action. Aucun effet extérieur : pas de clé d'idempotence. */
export const ACTION_DECIDEE = "action_decidee";
/** L'action a produit son effet. Porte TOUJOURS une clé d'idempotence si l'effet est extérieur. */
export const ACTION_EXECUTEE = "action_executee";
/** Le Policy Engine a suspendu l'action : elle attend un accord humain. */
export const POLITIQUE_SUSPEND = "politique_suspend";
/** L'humain a accordé. Le run repart. */
export const ACCORD_ACCORDE = "accord_accorde";
/** L'humain a refusé. Le run s'arrête sans exécuter (`docs/vitrine/DECISIONS.md`, ADR-013). */
export const ACCORD_REFUSE = "accord_refuse";
/** Fin normale. */
export const RUN_TERMINE = "run_termine";
/** Fin anormale, et assumée comme telle : un run échoué est un fait, pas un silence. */
export const RUN_ECHOUE = "run_echoue";

export const NATURES_CONNUES = [
  RUN_DEMARRE,
  ACTION_DECIDEE,
  ACTION_EXECUTEE,
  POLITIQUE_SUSPEND,
  ACCORD_ACCORDE,
  ACCORD_REFUSE,
  RUN_TERMINE,
  RUN_ECHOUE,
] as const;

export type NatureConnue = (typeof NATURES_CONNUES)[number];

const INDEX: ReadonlySet<string> = new Set(NATURES_CONNUES);

export function estNatureConnue(kind: string): kind is NatureConnue {
  return INDEX.has(kind);
}

/** Les natures qui referment un run. Rien ne s'y ajoute après — voir `run-state.ts`. */
export const NATURES_TERMINALES: ReadonlySet<string> = new Set([
  RUN_TERMINE,
  RUN_ECHOUE,
  ACCORD_REFUSE,
]);
