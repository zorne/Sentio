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
/**
 * Le contexte du pas a été assemblé. **Premier maillon de la chaîne explicative** : sans lui, on
 * sait ce que l'employé a fait, jamais avec quoi il l'a décidé.
 *
 * Ne porte que la FORME du contexte — quelles couches ont parlé, combien de faits, lesquels ont
 * été écartés et pourquoi. Jamais le contexte lui-même : recopier le prompt dans le journal
 * dupliquerait des données personnelles dans une table conçue pour survivre à l'action, et ferait
 * grossir sans fin une table déjà bornée à 30 jours.
 */
export const CONTEXTE_ASSEMBLE = "contexte_assemble";
/** Le modèle a choisi une action. Aucun effet extérieur : pas de clé d'idempotence. */
export const ACTION_DECIDEE = "action_decidee";
/**
 * L'action est **engagée** : écrit AVANT le moindre effet, et porte la clé d'idempotence.
 *
 * C'est la pièce qui rend une interruption survivable. La clé vit ici, et sur cette ligne seule
 * — la contrainte `unique (tenant_id, idempotency_key)` fait donc que deux workers ne peuvent
 * pas engager le même effet, quoi qu'ils décident chacun de leur côté. Écrire cette ligne
 * d'abord garantit aussi qu'**il ne peut pas exister d'effet sans trace** : au pire une trace
 * sans effet, ce qui se rattrape ; jamais l'inverse, qui ne se rattrape pas.
 */
export const ACTION_ENGAGEE = "action_engagee";
/**
 * L'action a produit son effet, et voici son résultat.
 *
 * Ne porte **pas** la clé d'idempotence — elle est déjà sur `action_engagee`, et l'unicité
 * refuserait la seconde ligne. La clé est reprise dans la charge utile pour rattacher le
 * résultat à son engagement.
 */
export const ACTION_EXECUTEE = "action_executee";
/** L'action a échoué. Transitoire ou définitif : la charge le dit, et c'est ce qui décide si le
 *  pas suivant a le droit de réessayer. */
export const ACTION_ECHOUEE = "action_echouee";
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
  CONTEXTE_ASSEMBLE,
  ACTION_DECIDEE,
  ACTION_ENGAGEE,
  ACTION_EXECUTEE,
  ACTION_ECHOUEE,
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
