/**
 * NOYAU-20 — reconstruire une trace depuis le journal.
 *
 * Le journal est la **source de vérité** : rien n'est conservé en mémoire entre deux pas, et
 * l'état complet d'un run se reconstruit depuis la base (`docs/05-runtime-employe.md`). Ce
 * module est cette reconstruction — c'est elle qui rendra possible, au lot 3, la reprise d'un run
 * interrompu au pas suivant plutôt qu'au début.
 *
 * Il sert aussi le client : ce qu'il verra un jour dans « ce que votre employé a fait » est une
 * projection de ces événements, jamais un texte rédigé pour l'occasion.
 */

export interface JournalEntry {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
}

export interface Trace {
  readonly steps: readonly JournalEntry[];
  /** Clés d'idempotence déjà consommées : ce qui a été fait ne se refait pas. */
  readonly completedEffects: ReadonlySet<string>;
  /** Dernier événement, ou `null` si le run n'a rien produit. */
  readonly last: JournalEntry | null;
  /** Le run attend-il un accord humain ? Déduit du journal, jamais d'un champ d'état séparé. */
  readonly awaitingApproval: boolean;
}

/** Types d'événements qui portent une décision de politique, dans l'ordre où ils la referment. */
const SUSPEND = "politique_suspend";
const RESUME = "accord_accorde";

export function reconstructTrace(entries: readonly JournalEntry[]): Trace {
  // L'ordre du journal fait foi. On trie explicitement plutôt que de faire confiance à la requête :
  // une reprise après panne qui rejouerait les pas dans le désordre est pire qu'une reprise ratée.
  const steps = entries
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

  const completedEffects = new Set<string>();
  let awaitingApproval = false;

  for (const entry of steps) {
    if (entry.idempotencyKey !== null) completedEffects.add(entry.idempotencyKey);
    if (entry.kind === SUSPEND) awaitingApproval = true;
    if (entry.kind === RESUME) awaitingApproval = false;
  }

  return {
    steps,
    completedEffects,
    last: steps.length === 0 ? null : (steps[steps.length - 1] as JournalEntry),
    awaitingApproval,
  };
}

/**
 * Cette action a-t-elle déjà produit son effet ?
 *
 * Question posée **avant** d'agir, à la trace reconstruite. La base refusera de toute façon le
 * doublon ; demander ici évite d'appeler un service extérieur pour rien — et surtout d'appeler un
 * service qui, lui, n'a aucune idempotence de son côté.
 */
export function alreadyDone(trace: Trace, idempotencyKey: string): boolean {
  return trace.completedEffects.has(idempotencyKey);
}
