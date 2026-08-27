/**
 * L'adaptateur Resend — le seul fichier du dépôt qui sait que Resend existe (`docs/adr/0018`).
 *
 * Écrit sur `fetch`, sans bibliothèque : l'API est un `POST` avec un objet JSON, et une
 * dépendance de plus se paie en surface de mise à jour pour un gain nul. Le jour où un second
 * service arrive, il s'écrit à côté de celui-ci, et rien d'autre ne bouge.
 *
 * ⚠️ La région d'expédition (Irlande) se règle **sur le domaine**, dans la console du service —
 * pas ici. Le compromis de localisation des journaux est écrit dans l'ADR, avec les trois
 * obligations qu'il ajoute avant le premier envoi réel.
 */

import {
  EmailProviderUnavailable,
  EmailRejected,
  type EmailProvider,
  type OutgoingEmail,
  type SentEmail,
} from "./provider.js";

export interface ResendOptions {
  /** Vient d'une variable d'environnement. Jamais du dépôt (`AGENTS.md`, invariant 7). */
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  /** Injectable : aucun test ne sort sur le réseau. */
  readonly fetchImpl?: typeof fetch;
}

function formatAddress(address: { address: string; name?: string }): string {
  return address.name === undefined ? address.address : `${address.name} <${address.address}>`;
}

export class ResendEmailProvider implements EmailProvider {
  readonly key = "resend";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ResendOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(email: OutgoingEmail): Promise<SentEmail> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
          // La déduplication tient des deux côtés : si notre appel est rejoué après une panne
          // réseau, le service reconnaît la clé et ne renvoie pas le message.
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: formatAddress(email.from),
          to: [formatAddress(email.to)],
          ...(email.replyTo === undefined ? {} : { reply_to: formatAddress(email.replyTo) }),
          subject: email.subject,
          text: email.text,
          ...(email.html === undefined ? {} : { html: email.html }),
          ...(email.headers === undefined ? {} : { headers: email.headers }),
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new EmailProviderUnavailable(this.key, `Envoi impossible : ${String(cause)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw await this.translate(response);

    const body = (await response.json()) as { id?: string };
    if (typeof body.id !== "string") {
      // Sans identifiant, impossible de rapprocher un rebond plus tard : on refuse de considérer
      // l'envoi comme fait plutôt que de perdre le fil.
      throw new EmailRejected(this.key, "Réponse sans identifiant de message.");
    }
    return { providerMessageId: body.id };
  }

  private async translate(response: Response): Promise<Error> {
    const detail = await response
      .text()
      .then((text) => text.slice(0, 200))
      .catch(() => "");

    // 429 et 5xx : passager. Tout le reste est définitif — une adresse invalide ou un domaine
    // non vérifié ne se répare pas en réessayant, et insister abîmerait la réputation du client.
    if (response.status === 429 || response.status >= 500) {
      return new EmailProviderUnavailable(this.key, `Service indisponible (${response.status}). ${detail}`);
    }
    return new EmailRejected(this.key, `Envoi refusé (${response.status}). ${detail}`);
  }
}
