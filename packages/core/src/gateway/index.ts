// ════════════════════════════════════════════════════════════════════
// Model Gateway — frontière anti-corruption devant les fournisseurs IA.
// Incarne ADR-004 (fournisseur = config, jamais en dur) et ADR-005 (BYOK).
//
// Aucun agent n'appelle jamais un provider directement. Tout passe ici.
// Ce fichier définit les CONTRATS ; les providers concrets sont ajoutés
// dans ./providers/* sans jamais modifier ce fichier ni les agents.
// ════════════════════════════════════════════════════════════════════

/** Sensibilité des données envoyées au modèle. Décidée par l'appelant. */
export type DataClass = "test" | "real";

/** Ce qu'un provider s'autorise à faire des données reçues. Vient de la DB. */
export type DataPolicy = "free" /* peut entraîner */ | "no_train" /* contractuel */;

export type ProviderName = "gemini" | "anthropic" | "openai" | "groq";

/** Identifiant IA d'un tenant (BYOK), résolu depuis tenant_ai_credential. */
export interface TenantCredential {
  provider: ProviderName;
  dataPolicy: DataPolicy;
  /** Clé déjà déchiffrée en mémoire, jamais journalisée. */
  apiKey: string;
}

export interface GenerateRequest {
  tenantId: string;
  /** Obligatoire : force l'appelant à déclarer la nature des données. */
  dataClass: DataClass;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Outils exposés au modèle (schémas). Le gateway ne les exécute pas. */
  tools?: unknown[];
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  toolCalls: Array<{ name: string; input: unknown }>;
  usage: { inputTokens: number; outputTokens: number; provider: ProviderName };
}

/** Un provider concret (Gemini, Anthropic, …) implémente ça. */
export interface ModelProvider {
  readonly name: ProviderName;
  generate(req: GenerateRequest, cred: TenantCredential): Promise<GenerateResult>;
}

/** Résout la clé BYOK d'un tenant (déchiffre depuis tenant_ai_credential). */
export interface CredentialResolver {
  resolve(tenantId: string): Promise<TenantCredential | null>;
}

export class GatewayError extends Error {}

/**
 * LA RÈGLE D'OR (ADR-004/005) : des données réelles ne partent JAMAIS
 * vers un provider qui peut entraîner dessus. Défense par design, pas
 * une vérification qu'on oublie de faire ailleurs.
 */
function assertDataPolicy(dataClass: DataClass, policy: DataPolicy): void {
  if (dataClass === "real" && policy === "free") {
    throw new GatewayError(
      "Refus: données réelles vers un tier gratuit (peut entraîner sur les données). " +
        "Configurez une clé 'no_train' pour ce tenant avant de traiter des données clients."
    );
  }
}

export class ModelGateway {
  private readonly providers = new Map<ProviderName, ModelProvider>();

  constructor(private readonly credentials: CredentialResolver) {}

  /** Branche un provider. Ajouter un fournisseur = un register(), zéro autre changement. */
  register(provider: ModelProvider): this {
    this.providers.set(provider.name, provider);
    return this;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const cred = await this.credentials.resolve(req.tenantId);
    if (!cred) {
      throw new GatewayError(
        `Aucune clé IA (BYOK) configurée pour le tenant ${req.tenantId}. ` +
          "L'inférence est facturée sur le compte du client (ADR-005)."
      );
    }
    assertDataPolicy(req.dataClass, cred.dataPolicy);

    const provider = this.providers.get(cred.provider);
    if (!provider) throw new GatewayError(`Provider non branché: ${cred.provider}`);

    return provider.generate(req, cred);
  }
}
