// ════════════════════════════════════════════════════════════════════
// Provider Groq — deuxième fournisseur, branché en fallback derrière
// Gemini (ADR-016). Compte séparé donc QUOTA INDÉPENDANT (~14 400 req/j
// vs ~200 chez Gemini free) : c'est ce qui rend l'ensemble jamais
// vraiment à court en usage normal.
//
// API compatible OpenAI (chat/completions + tool_calls). Aucun SDK, un
// simple fetch — même principe que le provider Gemini.
//
// ATTENTION (ADR-004) : le tier gratuit Groq peut utiliser les données
// pour améliorer ses services. Marqué `data_policy: 'free'` dans la
// credential côté BYOK ; le gateway le refusera automatiquement pour
// des dataClass='real'. Ici en Phase 1 démo : dataClass='test' → OK.
// ════════════════════════════════════════════════════════════════════

import type {
  GenerateRequest,
  GenerateResult,
  ModelProvider,
  TenantCredential,
} from "../index.js";
import { GatewayError } from "../index.js";

const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Chaîne de modèles, dans l'ordre d'essai : le plus capable d'abord.
 *
 * ⚠️ CETTE LISTE A DÉJÀ TUÉ LE DIAGNOSTIC UNE FOIS, ET SANS PRÉVENIR.
 *
 * Elle nommait `llama-3.3-70b-versatile` et `llama-3.1-8b-instant`. Groq les a retirés, et
 * l'appel a commencé à répondre « le modèle n'existe pas ». Côté visiteur : « nous n'avons pas
 * pu vous répondre », à chaque question, pour toujours. Le produit n'était pas en panne, il
 * était devenu muet, ce qui ne se voit dans aucune alerte.
 *
 * Deux leçons, et la seconde compte plus que la première :
 *
 *   1. **un fournisseur retire ses modèles sans prévenir.** Ce n'est pas un incident, c'est le
 *      fonctionnement normal du marché : ce qui marche aujourd'hui sera retiré un jour ;
 *   2. **le nom d'un modèle n'a donc rien à faire en dur.** `SENTIO_GROQ_MODELES` permet de le
 *      changer sans redéployer, c'est-à-dire en quelques minutes plutôt qu'en une soirée.
 *
 * ⚠️ ET LE MODÈLE DOIT SAVOIR APPELER UN OUTIL. Le diagnostic n'extrait pas un profil en lisant
 * du texte libre : il passe par un appel d'outil (`EXTRACTION_TOOL`). Un modèle qui ne les
 * gère pas répondrait poliment sans jamais rien conclure, ce qui est pire qu'une erreur.
 */
const DEFAULT_MODEL_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

/**
 * La chaîne effectivement essayée.
 *
 * ⚠️ Aucune validation du contenu : on ne connaît pas la liste des modèles de Groq, et refuser
 * un nom qu'on ne reconnaît pas empêcherait précisément la correction d'urgence pour laquelle
 * cette variable existe.
 */
function chaineDeModeles(): readonly string[] {
  const brut = process.env["SENTIO_GROQ_MODELES"];
  if (brut === undefined) return DEFAULT_MODEL_CHAIN;
  const noms = brut.split(",").map((n) => n.trim()).filter((n) => n !== "");
  return noms.length > 0 ? noms : DEFAULT_MODEL_CHAIN;
}

const MAX_LOOPS = 2;
const DEFAULT_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 10_000;

interface GroqTool {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

function isRetryableError(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function parseRetryDelayMs(detail: string): number {
  // Groq utilise "retry-after" en secondes ou messages "please retry in Xs"
  const match = detail.match(/(?:retry[- ]after|retry in)[:\s]+([\d.]+)/i);
  const seconds = match?.[1];
  const suggested = seconds ? Math.ceil(parseFloat(seconds) * 1000) : DEFAULT_BACKOFF_MS;
  return Math.min(suggested, MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GroqProvider implements ModelProvider {
  readonly name = "groq" as const;

  constructor(private readonly modelChain: readonly string[] = chaineDeModeles()) {}

  async generate(req: GenerateRequest, cred: TenantCredential): Promise<GenerateResult> {
    let lastError: Error | null = null;

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      for (const model of this.modelChain) {
        try {
          return await this.callModel(model, req, cred);
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          const statusMatch = e.message.match(/^Groq (\d+):(.*)$/s);
          if (statusMatch && isRetryableError(Number(statusMatch[1]))) {
            lastError = e;
            continue;
          }
          throw e;
        }
      }
      if (loop < MAX_LOOPS - 1 && lastError) {
        await sleep(parseRetryDelayMs(lastError.message));
      }
    }

    throw new GatewayError(
      `Tous les modèles Groq (${this.modelChain.join(", ")}) sont à court de quota ` +
        `après ${MAX_LOOPS} tentatives. Dernière erreur: ${lastError?.message ?? "inconnue"}`
    );
  }

  /**
   * Flux SSE. Ne tente qu'un seul modèle : en streaming, la latence du
   * premier octet est ce qui compte, et enchaîner des replis annulerait
   * ce bénéfice. Un échec remonte au gateway, qui basculera de provider.
   */
  async *generateStream(req: GenerateRequest, cred: TenantCredential): AsyncIterable<string> {
    const model = this.modelChain[0]!;
    const controller = new AbortController();
    // Filet de sécurité : une connexion qui reste ouverte sans rien
    // envoyer immobiliserait la requête côté serveur.
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const res = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cred.apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: req.maxTokens ?? 700,
          temperature: 0.3,
          messages: [
            { role: "system", content: req.system },
            ...req.messages.flatMap((m) =>
              m.kind === "text"
                ? [{ role: m.role === "model" ? "assistant" : "user", content: m.content }]
                : []
            ),
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new GatewayError(`Groq ${res.status}: ${detail.slice(0, 300)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Le découpage réseau ne respecte pas les frontières de lignes :
        // on ne traite que les lignes complètes et on garde le reste.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const piece = json.choices?.[0]?.delta?.content;
            if (piece) yield piece;
          } catch {
            // Fragment JSON invalide : on l'ignore plutôt que d'interrompre
            // un flux par ailleurs valide.
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callModel(
    model: string,
    req: GenerateRequest,
    cred: TenantCredential
  ): Promise<GenerateResult> {
    // Conversion du format interne ConversationTurn vers le format
    // OpenAI-compatible attendu par Groq. On génère un id stable pour
    // chaque paire tool_call/tool_response afin que Groq les corrèle.
    const messages: GroqMessage[] = [{ role: "system", content: req.system }];
    let toolCallCounter = 0;
    let lastToolCallId: string | null = null;

    for (const m of req.messages) {
      if (m.kind === "text") {
        messages.push({ role: m.role === "model" ? "assistant" : "user", content: m.content });
      } else if (m.kind === "tool_call") {
        toolCallCounter += 1;
        lastToolCallId = `call_${toolCallCounter}`;
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: lastToolCallId,
              type: "function",
              function: { name: m.toolKey, arguments: JSON.stringify(m.input ?? {}) },
            },
          ],
        });
      } else {
        // tool_result — l'id DOIT correspondre au tool_call qui précède
        messages.push({
          role: "tool",
          tool_call_id: lastToolCallId ?? `call_${toolCallCounter}`,
          name: m.toolKey,
          content: typeof m.result === "string" ? m.result : JSON.stringify(m.result),
        });
      }
    }

    const body: Record<string, unknown> = {
      model,
      // ⚠️ Les modèles « gpt-oss » RAISONNENT avant d'écrire, et ce raisonnement se paie sur le
      // même budget de jetons que la réponse. Mesuré le 2026-08-28 : 111 jetons de raisonnement
      // par défaut contre 8 en effort bas, sur la même question. Sur un premier contact, ce
      // raisonnement n'améliore pas une question de deux lignes — il la mange, et il la ralentit.
      //
      // ⚠️ Envoyé UNIQUEMENT aux modèles qui le comprennent : ailleurs, ce champ fait un 400.
      ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages,
      max_tokens: req.maxTokens ?? 4096,
    };
    if (req.tools?.length) {
      body.tools = (req.tools as Array<{ name: string; description: string; parameters: Record<string, unknown> }>).map<GroqTool>(
        (t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })
      );
    }

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Clé BYOK du tenant — jamais globale (ADR-005).
        authorization: `Bearer ${cred.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Format contractuel "Groq {status}:..." parsé par isRetryableError.
      const detail = await res.text().catch(() => "");
      throw new GatewayError(`Groq ${res.status}: ${detail.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string | null;
          tool_calls?: Array<{ function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const msg = data.choices?.[0]?.message;
    const rawToolCalls = msg?.tool_calls ?? [];

    // ⚠️ UNE PHRASE COUPÉE NE DOIT JAMAIS ÊTRE RENDUE COMME UNE PHRASE ENTIÈRE.
    //
    // `finish_reason` n'était pas lu. Un modèle arrêté par le plafond de jetons rendait donc son
    // début de phrase, et l'écran l'affichait tel quel : un visiteur a vu Lady lui demander
    // « … et vous ne relancez aujourd'hui que la moitié, faute de ». Ce n'est pas une panne
    // visible — c'est pire, le produit a l'air de délirer, et rien dans les journaux ne le dit.
    //
    // Vu pour de vrai le 2026-08-28, après le passage à un modèle à RAISONNEMENT : celui-ci
    // dépense des jetons à réfléchir avant d'écrire, et le budget avait été taillé pour un modèle
    // qui n'en dépense aucun.
    const texte = msg?.content ?? "";
    const coupe = data.choices?.[0]?.finish_reason === "length";

    return {
      text: coupe ? jusqu_a_la_derniere_phrase_entiere(texte) : texte,
      toolCalls: rawToolCalls.map((tc) => {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          // Groq peut ponctuellement renvoyer des arguments non-JSON ;
          // on remonte tel quel plutôt que d'échouer silencieusement.
          input = { _raw: tc.function.arguments };
        }
        return { name: tc.function.name, input };
      }),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        provider: this.name,
        model,
      },
    };
  }
}

/**
 * Ce qui reste d'un texte tronqué quand on retire la phrase inachevée.
 *
 * ⚠️ Rendre une chaîne VIDE plutôt qu'un fragment est délibéré. L'appelant sait traiter une
 * absence de réponse — il a un repli et un message honnête. Il ne sait pas traiter une phrase qui
 * s'arrête au milieu : il l'affiche, et c'est le dirigeant qui découvre le défaut.
 */
function jusqu_a_la_derniere_phrase_entiere(texte: string): string {
  // Le point d'interrogation compte autant que le point : le diagnostic POSE des questions, et
  // couper après « ? » est précisément le cas courant ici.
  const fin = Math.max(texte.lastIndexOf("."), texte.lastIndexOf("?"), texte.lastIndexOf("!"));
  return fin === -1 ? "" : texte.slice(0, fin + 1).trim();
}
