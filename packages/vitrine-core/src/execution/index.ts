// ════════════════════════════════════════════════════════════════════
// Execution Store — le journal append-only (archi §3f, principe n°1).
//
// Chaque étape d'un run est un événement immuable. Source de vérité
// pour : audit, temps réel (le front s'y abonne), facturation, et
// l'apprentissage futur (Phase 5 lit ce journal, rien d'autre).
// Table cible : execution_event (migration 0001). On n'update jamais.
// ════════════════════════════════════════════════════════════════════

export type EventKind =
  | "model_decision"  // le modèle a répondu / demandé un outil
  | "tool_call"       // un outil est invoqué (input journalisé)
  | "tool_result"     // résultat d'outil (réinjecté au modèle)
  | "human_wait"      // run suspendu, validation humaine requise
  | "human_decision"  // l'humain a approuvé/refusé
  | "error"           // erreur d'étape (le run peut continuer ou non)
  | "final";          // réponse finale, run terminé

export interface ExecutionEvent {
  tenantId: string;
  taskId: string;
  /** Ordre strict dans le run. Unique par (taskId, seq) — garanti en DB. */
  seq: number;
  kind: EventKind;
  payload: Record<string, unknown>;
  /** Tokens, provider, latence — pour coût & observabilité. */
  usage?: Record<string, unknown>;
}

export interface StoredExecutionEvent extends ExecutionEvent {
  id: number;
  createdAt: string;
}

/** Contrat de persistance. Implémentation Supabase dans packages/db.
 *  Append-only par contrat : pas de update/delete ici, à dessein. */
export interface ExecutionStore {
  append(event: ExecutionEvent): Promise<StoredExecutionEvent>;
  /** Relecture ordonnée d'un run — sert l'audit ET le streaming temps réel. */
  read(taskId: string, fromSeq?: number): Promise<StoredExecutionEvent[]>;
}

/**
 * Journal d'un run en cours : encapsule le compteur seq pour que le
 * runtime ne gère jamais la numérotation à la main (source d'erreurs).
 */
export class RunJournal {
  private seq = 0;

  constructor(
    private readonly store: ExecutionStore,
    private readonly tenantId: string,
    private readonly taskId: string
  ) {}

  async record(
    kind: EventKind,
    payload: Record<string, unknown>,
    usage?: Record<string, unknown>
  ): Promise<StoredExecutionEvent> {
    this.seq += 1;
    return this.store.append({
      tenantId: this.tenantId,
      taskId: this.taskId,
      seq: this.seq,
      kind,
      payload,
      ...(usage !== undefined ? { usage } : {}),
    });
  }

  /** Relit l'historique complet du run — sert à reconstruire la trace
   *  d'outils et l'action en attente lors d'une reprise (voir runtime). */
  async read(): Promise<StoredExecutionEvent[]> {
    return this.store.read(this.taskId);
  }

  /** Reprise après suspension (waiting_human) ou crash : on repart du
   *  dernier seq persisté — les runs sont reprenables par construction. */
  static async resume(
    store: ExecutionStore,
    tenantId: string,
    taskId: string
  ): Promise<RunJournal> {
    const events = await store.read(taskId);
    const journal = new RunJournal(store, tenantId, taskId);
    journal.seq = events.length ? Math.max(...events.map((e) => e.seq)) : 0;
    return journal;
  }
}
