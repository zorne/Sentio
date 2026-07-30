/**
 * NOYAU-04 à 08 — le Model Gateway : point de passage unique de tout appel de modèle.
 *
 * **Aucun appel ne se fait ailleurs** (`docs/05-runtime-employe.md`). Cette classe porte quatre
 * responsabilités qui, séparées, finiraient par diverger :
 *
 *   1. **Routage par classe de données** — une donnée réelle ne peut pas partir vers un
 *      fournisseur qui n'est pas prouvé « sans entraînement ». Le fournisseur incompatible est
 *      **sauté**, pas tenté puis rejeté.
 *   2. **Chaîne de repli** — sur quota ou panne passagère uniquement, et **jamais** à travers la
 *      frontière de classe de données : si le conforme est épuisé, la tâche est reportée.
 *   3. **Comptage** — par entreprise et par enveloppe. Sans lui, les quotas de formule sont
 *      décoratifs.
 *   4. **Plafonds** — par entreprise et par jour, et surtout **par minute** : le débit est le
 *      facteur limitant réel, donc le Gateway lisse au lieu de grouper.
 *
 * Ce qu'il ne fait pas : décider quoi demander (c'est le runtime), ni ce qui a le droit de
 * s'exécuter (c'est le Policy Engine).
 *
 * Réalise : NOYAU-04, NOYAU-05, NOYAU-06, NOYAU-07, NOYAU-08
 */

import {
  INFERENCE_ENVELOPE_SHARE,
  INFERENCE_PROVIDER_LIMITS,
  USAGE_METRICS,
  type FeatureFlags,
  type InferenceEnvelope,
} from "@sentio/config";
import type { TenantId } from "@sentio/domain";

import { assertWellFormed } from "../conversation/turn.js";
import {
  NonCompliantRouting,
  PermanentProviderError,
  RetryableProviderError,
  TaskDeferred,
} from "../errors.js";
import type { Clock, JournalWriter, UsageLedger } from "../ports.js";
import { systemClock } from "../ports.js";
import type { GatewayResult, ModelProvider, ModelRequest } from "./provider.js";

/**
 * Messages destinés au client. Ils sont **visibles**, donc soumis au lexique
 * (`docs/17-lexique.md`) : ni « IA », ni « modèle », ni « token ». Un test les repasse au
 * vérificateur du lexique — sinon la règle ne tiendrait que par la vigilance.
 */
export const DEFERRAL_MESSAGES = {
  tenantCap:
    "Votre employé a mis cette tâche en attente : la capacité de travail prévue pour aujourd'hui " +
    "est atteinte. Il la reprendra de lui-même.",
  envelopeExhausted:
    "Votre employé a mis cette tâche en attente : le service est momentanément saturé. " +
    "Il la reprendra de lui-même.",
  noProviderLeft:
    "Votre employé a mis cette tâche en attente : il n'a pas pu travailler à l'instant. " +
    "Il réessaiera de lui-même.",
} as const;

export interface ModelGatewayOptions {
  /**
   * **L'ordre fait la chaîne de repli.** Il vient de la configuration, jamais du code
   * (`docs/19-fournisseurs-modeles.md`).
   */
  readonly providers: readonly ModelProvider[];
  readonly ledger: UsageLedger;
  readonly journal: JournalWriter;
  readonly flags: FeatureFlags;
  readonly clock?: Clock;
  readonly providerLimits?: { requestsPerMinute: number; tokensPerMonth: number };
  readonly envelopeShare?: Record<InferenceEnvelope, number>;
}

export class ModelGateway {
  private readonly clock: Clock;
  private readonly limits: { requestsPerMinute: number; tokensPerMonth: number };
  private readonly share: Record<InferenceEnvelope, number>;
  /** Instant du dernier appel, tous fournisseurs confondus : le débit se lisse globalement. */
  private lastCallAt: number | null = null;

  constructor(private readonly options: ModelGatewayOptions) {
    this.clock = options.clock ?? systemClock;
    this.limits = options.providerLimits ?? INFERENCE_PROVIDER_LIMITS;
    this.share = options.envelopeShare ?? INFERENCE_ENVELOPE_SHARE;
  }

  async complete(request: ModelRequest): Promise<GatewayResult> {
    assertWellFormed(request.turns);

    const skipped: { providerKey: string; reason: string }[] = [];
    const eligible = this.route(request, skipped);

    if (eligible.length === 0) {
      // Aucun fournisseur conforme : c'est une règle qui ferme la porte, pas une panne.
      await this.journalize(request, "routage_refuse", { skipped });
      throw new NonCompliantRouting(
        "Aucun fournisseur conforme pour cette classe de données. La requête n'est pas envoyée : " +
          "une donnée réelle ne part jamais chez un fournisseur non prouvé « sans entraînement ».",
      );
    }

    await this.assertTenantWithinCaps(request);
    await this.assertEnvelopeHasRoom(request);
    await this.smoothRate();

    for (const provider of eligible) {
      try {
        const completion = await provider.complete(request);
        await this.record(request, provider, completion.tokens);
        return { ...completion, providerKey: provider.key, skipped };
      } catch (error) {
        if (error instanceof RetryableProviderError) {
          // Quota épuisé ou panne passagère : on essaie le suivant, DANS LA MÊME classe de données.
          skipped.push({ providerKey: provider.key, reason: error.message });
          continue;
        }
        // Erreur logique : elle remonte telle quelle. La masquer derrière un repli reviendrait à
        // transformer un bug en lenteur intermittente, la panne la plus coûteuse à diagnostiquer.
        throw error instanceof PermanentProviderError
          ? error
          : new PermanentProviderError(provider.key, String(error));
      }
    }

    await this.journalize(request, "tache_reportee", { raison: "aucun_fournisseur", skipped });
    throw new TaskDeferred(
      DEFERRAL_MESSAGES.noProviderLeft,
      `Tous les fournisseurs éligibles ont échoué : ${skipped.map((s) => s.providerKey).join(", ")}.`,
    );
  }

  /**
   * NOYAU-04 — le routage. Il **écarte** avant d'essayer : un fournisseur non conforme ne doit
   * jamais recevoir la requête, pas même pour la refuser.
   */
  private route(
    request: ModelRequest,
    skipped: { providerKey: string; reason: string }[],
  ): ModelProvider[] {
    const eligible: ModelProvider[] = [];

    for (const provider of this.options.providers) {
      if (request.dataClass === "real") {
        if (provider.dataPolicy !== "no_train") {
          skipped.push({
            providerKey: provider.key,
            reason: "politique de données incompatible avec une donnée réelle",
          });
          continue;
        }
        if (!this.options.flags.inferenceOptOutProven) {
          // Le drapeau est le rempart de l'invariant 5 : tant que l'opt-out n'est pas prouvé,
          // le fournisseur est NON CONFORME, quelle que soit sa politique annoncée.
          skipped.push({
            providerKey: provider.key,
            reason: "opt-out d'entraînement non prouvé — fournisseur non conforme",
          });
          continue;
        }
      }
      eligible.push(provider);
    }

    return eligible;
  }

  /** NOYAU-07 — plafonds durs par entreprise. Au-delà : report, jamais dégradation silencieuse. */
  private async assertTenantWithinCaps(request: ModelRequest): Promise<void> {
    if (request.tenantId === null) return;
    const tenantId = request.tenantId as TenantId;
    const on = this.clock.now();

    for (const metric of [
      USAGE_METRICS.inferenceTokensPerDay,
      USAGE_METRICS.inferenceTokensPerPeriod,
    ] as const) {
      const limit = await this.options.ledger.tenantLimit(tenantId, metric);
      if (limit === null) continue;

      const used = await this.options.ledger.tenantUsage(tenantId, metric, on);
      if (used >= limit) {
        await this.journalize(request, "tache_reportee", { raison: "plafond_entreprise", metric });
        throw new TaskDeferred(
          DEFERRAL_MESSAGES.tenantCap,
          `Plafond ${metric} atteint pour l'entreprise (${used}/${limit}).`,
        );
      }
    }
  }

  /**
   * NOYAU-08 — les trois enveloppes. Le quota du fournisseur est unique et partagé : sans
   * découpage, une journée de trafic sur la vitrine empêcherait les clients payants d'être
   * servis (`docs/11-exploitation.md`).
   */
  private async assertEnvelopeHasRoom(request: ModelRequest): Promise<void> {
    const envelope = request.envelope as InferenceEnvelope;
    const share = this.share[envelope];
    if (share === undefined) {
      throw new PermanentProviderError("gateway", `Enveloppe d'inférence inconnue : ${request.envelope}.`);
    }

    const budget = this.limits.tokensPerMonth * share;
    const used = await this.options.ledger.envelopeUsage(envelope);
    if (used >= budget) {
      await this.journalize(request, "tache_reportee", { raison: "enveloppe_epuisee", envelope });
      throw new TaskDeferred(
        DEFERRAL_MESSAGES.envelopeExhausted,
        `Enveloppe ${envelope} épuisée (${used}/${budget}).`,
      );
    }
  }

  /**
   * Lissage du débit. Le fournisseur principal autorise quelques requêtes par minute : grouper
   * les appels ferait échouer la deuxième, alors qu'attendre quelques secondes les fait toutes
   * passer. Le Gateway attend donc à la place de l'appelant.
   */
  private async smoothRate(): Promise<void> {
    const minimumInterval = 60_000 / this.limits.requestsPerMinute;
    const now = this.clock.now().getTime();

    if (this.lastCallAt !== null) {
      const waited = now - this.lastCallAt;
      if (waited < minimumInterval) {
        await this.clock.sleep(minimumInterval - waited);
      }
    }
    this.lastCallAt = this.clock.now().getTime();
  }

  /** NOYAU-06 — comptage. Par entreprise **et** par enveloppe : les deux plafonds sont réels. */
  private async record(
    request: ModelRequest,
    provider: ModelProvider,
    tokens: number,
  ): Promise<void> {
    const envelope = request.envelope as InferenceEnvelope;
    await this.options.ledger.recordEnvelopeUsage(envelope, provider.key, tokens);

    if (request.tenantId !== null) {
      const tenantId = request.tenantId as TenantId;
      const on = this.clock.now();
      await this.options.ledger.recordTenantUsage(
        tenantId,
        USAGE_METRICS.inferenceTokensPerDay,
        tokens,
        on,
      );
      await this.options.ledger.recordTenantUsage(
        tenantId,
        USAGE_METRICS.inferenceTokensPerPeriod,
        tokens,
        on,
      );
    }
  }

  private async journalize(request: ModelRequest, kind: string, payload: unknown): Promise<void> {
    if (request.tenantId === null) return; // Hors entreprise : rien à rattacher, rien à journaliser.
    await this.options.journal.append({
      tenantId: request.tenantId as TenantId,
      taskId: null,
      employeeId: null,
      kind,
      payload,
    });
  }
}
