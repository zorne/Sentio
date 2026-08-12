// ════════════════════════════════════════════════════════════════════
// ACQUIS-18 — l'enveloppe d'inférence, appliquée sur le chemin public.
//
// Le quota du fournisseur est UNIQUE ET PARTAGÉ par tous les usages de
// Sentio (`docs/11-exploitation.md`). Il est découpé en trois enveloppes
// — employés vendus, diagnostic public, interne — sans quoi une journée
// de trafic sur la vitrine empêche les clients payants d'être servis. Et
// c'est exactement le jour où la vitrine marche que ça arrive.
//
// Le découpage existait en trois endroits — la table `provider_quota`,
// les parts d'`@sentio/config`, la garde du Gateway du noyau — mais
// aucun ne portait sur le chemin du diagnostic public, qui est
// précisément celui que ce découpage protège. Ce module comble ça, sans
// redéfinir ni les parts ni la forme de la table : il branche les deux.
//
// ⚠️ À ne pas confondre avec `apps/vitrine/src/lib/diagnostic-rate-limit.ts`
// (ACQUIS-17). Celui-là borne ce qu'UN visiteur consomme ; celui-ci borne
// ce que TOUS les visiteurs consomment ensemble. Un plafond par visiteur
// ne borne rien face à mille visiteurs, un plafond global ne protège pas
// des mille requêtes d'un seul : les deux sont nécessaires.
//
// Réalise : ACQUIS-18
// ════════════════════════════════════════════════════════════════════

import { inferenceEnvelopeBudget, type InferenceEnvelope } from "@sentio/config";

/**
 * Ce que le visiteur lit quand l'enveloppe est épuisée. **Texte visible par un client**, donc
 * soumis au lexique (`docs/17-lexique.md`) : ni « modèle », ni « token », ni « quota ». Un test
 * le repasse au vérificateur du lexique — sinon la règle ne tiendrait que par la vigilance.
 */
export const ENVELOPE_EXHAUSTED_MESSAGE =
  "Le diagnostic est momentanément saturé. Réessayez un peu plus tard.";

/**
 * L'enveloppe est pleine : la requête n'est pas envoyée.
 *
 * C'est un **coupe-circuit**, pas une panne : rien n'a échoué, une règle a fermé la porte. Le
 * message porté ici est celui qu'on montre au visiteur ; le détail chiffré reste dans `detail`,
 * pour le journal serveur.
 */
export class EnvelopeExhausted extends Error {
  constructor(
    readonly envelope: InferenceEnvelope,
    readonly consumed: number,
    readonly budget: number,
  ) {
    super(ENVELOPE_EXHAUSTED_MESSAGE);
    this.name = "EnvelopeExhausted";
  }

  /** Le détail technique — jamais montré au visiteur, toujours écrit au journal. */
  get detail(): string {
    return `Enveloppe ${this.envelope} épuisée (${this.consumed}/${this.budget}).`;
  }
}

/**
 * Le compteur d'enveloppe, vu du Gateway. Un port : le Gateway ne sait pas qu'il y a une base
 * derrière, ce qui permet de tester la garde sans Postgres — et de la brancher ailleurs le jour
 * où la vitrine lira le cœur (`docs/27-convergence.md`, phase 3).
 */
export interface InferenceEnvelopeLedger {
  /** Ce que l'enveloppe a consommé dans la fenêtre en cours. */
  consumed(envelope: InferenceEnvelope): Promise<number>;
  /** Ajoute une consommation constatée. Toujours après l'appel, jamais avant : on compte ce qui
   *  a réellement été dépensé, pas ce qu'on espérait dépenser. */
  record(envelope: InferenceEnvelope, providerKey: string, tokens: number): Promise<void>;
}

/**
 * La garde elle-même : une enveloppe, un compteur, et les deux gestes que le Gateway pose autour
 * d'un appel. Elle ne décide pas de la taille du budget — `@sentio/config` le fait, une seule
 * fois, pour tout le dépôt.
 */
export class EnvelopeGuard {
  constructor(
    readonly envelope: InferenceEnvelope,
    private readonly ledger: InferenceEnvelopeLedger,
  ) {}

  /** Le budget de cette enveloppe, en tokens, sur la fenêtre comptée. */
  get budget(): number {
    return inferenceEnvelopeBudget(this.envelope);
  }

  /** Lève `EnvelopeExhausted` si l'enveloppe n'a plus de place. Appelée AVANT tout appel de
   *  fournisseur : une requête refusée ne doit pas d'abord être payée. */
  async assertHasRoom(): Promise<void> {
    const consumed = await this.ledger.consumed(this.envelope);
    const budget = this.budget;
    if (consumed >= budget) throw new EnvelopeExhausted(this.envelope, consumed, budget);
  }

  async record(providerKey: string, tokens: number): Promise<void> {
    await this.ledger.record(this.envelope, providerKey, tokens);
  }
}

/** Le minimum de `pg.Pool` dont ce module a besoin — pas le pilote entier, pour que les tests
 *  puissent le doubler sans installer une base. */
export interface Queryable {
  query<R>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

/**
 * Le compteur branché sur Postgres, table `provider_quota`.
 *
 * **La fenêtre est le mois calendaire**, parce que le budget qu'on lui compare est mensuel
 * (`INFERENCE_PROVIDER_LIMITS.tokensPerMonth`). Compter sur une journée et comparer à un budget
 * mensuel donnerait une garde trente fois trop lâche — c'est-à-dire une garde qui ne se
 * déclenche jamais, donc pas une garde.
 */
export class PostgresEnvelopeLedger implements InferenceEnvelopeLedger {
  constructor(private readonly db: Queryable) {}

  async consumed(envelope: InferenceEnvelope): Promise<number> {
    const { rows } = await this.db.query<{ consumed: string }>(
      `select coalesce(sum(consumed), 0) as consumed
         from provider_quota
        where envelope = $1 and now() >= window_start and now() < window_end`,
      [envelope],
    );
    return Number(rows[0]?.consumed ?? 0);
  }

  async record(envelope: InferenceEnvelope, providerKey: string, tokens: number): Promise<void> {
    // Un seul ordre, atomique : deux visiteurs servis en même temps ne peuvent pas se perdre
    // l'un l'autre. `quota_limit` porte la borne réellement appliquée — écrire 0 ferait de cette
    // colonne un mensonge, et un jour une surveillance lirait ce 0 en croyant lire un plafond.
    await this.db.query(
      `insert into provider_quota (provider_key, envelope, window_start, window_end, consumed, quota_limit)
       values ($1, $2, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', $3, $4)
       on conflict (provider_key, envelope, window_start)
       do update set consumed = provider_quota.consumed + excluded.consumed`,
      [providerKey, envelope, tokens, inferenceEnvelopeBudget(envelope)],
    );
  }
}
