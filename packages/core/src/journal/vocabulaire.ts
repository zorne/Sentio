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
 * La proposition du modèle, telle qu'elle a été lue — avec son fournisseur et son coût.
 *
 * ⚠️ CES QUATRE NATURES MANQUAIENT À LA LISTE, ET C'ÉTAIT UN BUG.
 *
 * `decideNextAction` (EXEC-04) écrit `proposition_recue` / `proposition_illisible`, et le Policy
 * Engine (EXEC-05) écrit `politique_${outcome}` — donc aussi `politique_allow` et
 * `politique_refuse`, pas seulement `politique_suspend`. Aucune des quatre n'était déclarée ici.
 *
 * Conséquence : dès qu'un pas réel s'écrivait, la reconstruction refusait le journal entier pour
 * « nature inconnue », la mission partait en `attention_requise`, et l'employé s'arrêtait au
 * premier pas. Personne ne l'avait vu parce qu'aucun test ne faisait tourner la chaîne complète —
 * chaque pièce était juste, l'assemblage ne l'était pas. Découvert par le premier test de bout en
 * bout (EXEC-12).
 *
 * Elles sont **neutres** pour l'état : elles racontent le raisonnement, elles ne le font pas
 * avancer. Ce sont `action_engagee` et `action_executee` qui marquent un effet.
 */
export const PROPOSITION_RECUE = "proposition_recue";
/** Le modèle a répondu quelque chose d'inexploitable. Aucun repli n'est tenté (EXEC-04). */
export const PROPOSITION_ILLISIBLE = "proposition_illisible";
/** La politique a autorisé l'action. Porte le fondement : sans effet extérieur, ou accord permanent. */
export const POLITIQUE_ALLOW = "politique_allow";
/** La politique a refusé : hors du périmètre de ce métier, ou hors des capacités activées. */
export const POLITIQUE_REFUSE = "politique_refuse";
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
/**
 * Le run est **reporté** : son budget de pas est épuisé pour ce cycle, le travail n'est pas fini.
 *
 * Ce n'est ni une fin, ni un échec — c'est une journée de travail qui se termine. La phase reste
 * `en_cours`, l'état se relit au cycle suivant, et le compteur de pas repart de zéro : c'est cet
 * événement, et lui seul, qui borne un cycle. Le distinguer de `pas_reporte` n'est pas de la
 * ponctuation : l'un rouvre un budget, l'autre non.
 *
 * Réalise : EXEC-08
 */
export const RUN_REPORTE = "run_reporte";
/**
 * Le **pas** est reporté après un échec passager. Le run continue, son budget n'est pas rouvert.
 *
 * Sans cette distinction, un fournisseur qui répond « réessayez » remettrait le compteur à zéro à
 * chaque tentative et l'employé tournerait indéfiniment dans la même journée.
 *
 * Réalise : EXEC-08
 */
export const PAS_REPORTE = "pas_reporte";
/**
 * Le run est **arrêté parce qu'un humain doit intervenir**, et ce n'est pas une demande d'accord.
 *
 * Deux cas, et aucun ne se rattrape tout seul : un effet irréversible engagé dont on ignore
 * l'issue (EXEC-06), et un contexte incomplet — un objectif absent, un ADN introuvable (EXEC-03).
 * Dans les deux, réessayer plus tard ne changerait rien : c'est le client, ou nous, qui devons
 * agir.
 *
 * ⚠️ À ne pas confondre avec `politique_suspend`, qui est une **question posée au client** sur une
 * action précise. Les deux appellent une notification (EXEC-14) ; un seul se répond par « oui ».
 *
 * Réalise : EXEC-08
 */
export const ATTENTION_REQUISE = "attention_requise";
/** Fin normale. */
export const RUN_TERMINE = "run_termine";
/** Fin anormale, et assumée comme telle : un run échoué est un fait, pas un silence. */
export const RUN_ECHOUE = "run_echoue";

export const NATURES_CONNUES = [
  RUN_DEMARRE,
  CONTEXTE_ASSEMBLE,
  ACTION_DECIDEE,
  PROPOSITION_RECUE,
  PROPOSITION_ILLISIBLE,
  POLITIQUE_ALLOW,
  POLITIQUE_REFUSE,
  ACTION_ENGAGEE,
  ACTION_EXECUTEE,
  ACTION_ECHOUEE,
  POLITIQUE_SUSPEND,
  ACCORD_ACCORDE,
  ACCORD_REFUSE,
  RUN_REPORTE,
  PAS_REPORTE,
  ATTENTION_REQUISE,
  RUN_TERMINE,
  RUN_ECHOUE,
] as const;

export type NatureConnue = (typeof NATURES_CONNUES)[number];

const INDEX: ReadonlySet<string> = new Set(NATURES_CONNUES);

export function estNatureConnue(kind: string): kind is NatureConnue {
  return INDEX.has(kind);
}

/**
 * Les natures qui veulent dire : **le run s'est arrêté et un humain doit intervenir**.
 *
 * C'est le seul point d'où part une notification de blocage (EXEC-14). Deux natures, deux
 * questions différentes posées au même client : « autorisez-vous ceci ? » et « il s'est passé
 * quelque chose que je ne peux pas trancher seul ».
 *
 * ⚠️ La vue SQL `intervention_requise` (migration `20260807120001`) porte la **même** liste, parce
 * qu'une vue ne peut pas importer du TypeScript. Deux copies divergentes vaudraient zéro règle :
 * un test d'intégration compare la définition de la vue à cette liste et échoue si l'une bouge
 * sans l'autre.
 *
 * Réalise : EXEC-08
 */
export const NATURES_INTERVENTION_HUMAINE: readonly string[] = [
  ATTENTION_REQUISE,
  POLITIQUE_SUSPEND,
];

/** Les natures qui referment un run. Rien ne s'y ajoute après — voir `run-state.ts`. */
export const NATURES_TERMINALES: ReadonlySet<string> = new Set([
  RUN_TERMINE,
  RUN_ECHOUE,
  ACCORD_REFUSE,
]);
