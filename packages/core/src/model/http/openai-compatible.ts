/**
 * NOYAU-02 et 03 — l'adaptateur sortant vers un fournisseur de modèle.
 *
 * Une seule implémentation couvre le fournisseur principal **et** celui de secours : les deux
 * parlent le même dialecte (`/chat/completions`), et ce qui les distingue — l'adresse, le modèle,
 * la politique de données — est de la **configuration**, pas du code. Ajouter un fournisseur
 * européen demain ne demandera pas une classe de plus.
 *
 * ⚠️ Ce fichier est un **adaptateur**, isolé dans son propre dossier : le Gateway ne l'importe
 * jamais. C'est le câblage (`apps/worker`, plus tard `apps/web` pour le diagnostic) qui décide
 * quels fournisseurs existent et dans quel ordre. Le noyau, lui, ne connaît que le port.
 *
 * La traduction des erreurs est la partie qui compte : elle décide si la chaîne de repli se
 * déclenche. Une erreur logique déguisée en panne ferait essayer trois fournisseurs pour rien —
 * et masquerait le bug (`docs/05-runtime-employe.md`).
 *
 * Réalise : NOYAU-02, NOYAU-03
 */

import type { DataPolicy } from "@sentio/domain";

import type { ConversationTurn } from "../../conversation/turn.js";
import { PermanentProviderError, ProviderQuotaExceeded, ProviderUnavailable } from "../../errors.js";
import type { ModelCompletion, ModelProvider, ModelRequest } from "../provider.js";

export interface OpenAICompatibleOptions {
  readonly key: string;
  readonly dataPolicy: DataPolicy;
  readonly baseUrl: string;
  readonly model: string;
  /**
   * La clé vit dans une variable d'environnement de l'hébergeur, jamais dans le dépôt
   * (`AGENTS.md`, invariant 7). Elle est passée ici, jamais lue ici.
   */
  readonly apiKey: string;
  readonly timeoutMs?: number;
  /** Injectable pour les tests : aucun test ne doit sortir sur le réseau. */
  readonly fetchImpl?: typeof fetch;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

/** Traduit nos tours vers le format du fournisseur. Le protocole du produit reste le nôtre. */
export function toChatMessages(turns: readonly ConversationTurn[]): ChatMessage[] {
  return turns.map((turn): ChatMessage => {
    switch (turn.type) {
      case "text":
        // Un tour de texte ne peut venir que de la consigne, du client ou de l'employé : le
        // format du produit ne connaît pas de texte libre côté capacité.
        return { role: turn.role, content: turn.text };
      case "capability_call":
        return {
          role: "assistant",
          content: JSON.stringify({ capacite: turn.capabilityKey, entree: turn.input }),
        };
      case "capability_result":
        return {
          role: "tool",
          tool_call_id: turn.callId,
          content: JSON.stringify({ resultat: turn.output, echec: turn.failed }),
        };
    }
  });
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly key: string;
  readonly dataPolicy: DataPolicy;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.key = options.key;
    this.dataPolicy = options.dataPolicy;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30_000);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: toChatMessages(request.turns),
          ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      // Réseau coupé, délai dépassé : passager par nature, le repli a un sens.
      throw new ProviderUnavailable(this.key, `Appel impossible : ${String(cause)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw this.translate(response.status, await safeText(response));

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      // Réponse inexploitable : rejouer chez un autre fournisseur donnerait la même chose.
      throw new PermanentProviderError(this.key, "Réponse sans contenu exploitable.");
    }

    return {
      turn: { role: "assistant", type: "text", text: content },
      // À défaut de comptage rendu par le fournisseur, on ne compte pas zéro : un comptage faux
      // rendrait les plafonds décoratifs. On estime grossièrement à partir de la longueur.
      tokens: body.usage?.total_tokens ?? estimateTokens(content),
    };
  }

  private translate(status: number, detail: string): Error {
    if (status === 429) {
      return new ProviderQuotaExceeded(this.key, `Débit ou quota dépassé (429). ${detail}`);
    }
    if (status >= 500) {
      return new ProviderUnavailable(this.key, `Panne du fournisseur (${status}). ${detail}`);
    }
    if (status === 401 || status === 403) {
      // Une clé invalide n'est pas une panne : la masquer par un repli ferait tourner le produit
      // sur le fournisseur de secours sans que personne ne s'en aperçoive.
      return new PermanentProviderError(this.key, `Authentification refusée (${status}). ${detail}`);
    }
    return new PermanentProviderError(this.key, `Requête refusée (${status}). ${detail}`);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "";
  }
}

/** Estimation volontairement grossière — elle sert à ne pas compter zéro, pas à facturer. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
