/**
 * `GET|POST /desinscription?t=<jeton>` — le lien d'opposition qui manquait à `send-message.ts`.
 *
 * Le plan l'annonçait ainsi : « le lien d'opposition doit atterrir quelque part » (phase 3,
 * `docs/20-plan-action.md`). C'est ici. Deux méthodes, un seul effet :
 *
 *   · GET  — le prospect suit le lien lisible dans le pied du message (composeMessage) ;
 *   · POST — le client de messagerie appelle l'URL du `List-Unsubscribe` en un clic, sans
 *     ouvrir de page (RFC 8058, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`).
 *
 * Aucun drapeau ne ferme cette fonction. `diagnostic` s'ouvre par décision explicite parce
 * qu'elle expose une **nouvelle** surface qui manipule de la donnée réelle ; celle-ci est
 * l'inverse — un filet de sécurité qui doit répondre dès qu'il existe, jamais après une bascule
 * qu'on aurait pu oublier d'actionner (`AGENTS.md`, invariant 6 : l'irréversible n'est jamais
 * automatique, mais s'y opposer, lui, ne doit jamais attendre).
 *
 * Ce que ce fichier NE fait pas : décider ce qu'une désinscription produit. Ça, c'est
 * `desinscrire()` dans `packages/domain/src/optout.ts` — testé sans Deno, sans réseau, sans
 * jeton. Ici, on vérifie le transport, on authentifie la demande, on appelle le domaine, on
 * persiste, on répond.
 */

import { desinscrire, AdresseManquante } from "@sentio/domain";
import type { LeadId, TenantId } from "@sentio/domain";
import { verifyOptOutToken } from "../_shared/optout-token.ts";
import { correlationId, log } from "../_shared/http.ts";

const ROUTE = "desinscription";

const MESSAGES = {
  methodeRefusee: "Cette adresse n'accepte que la désinscription.",
  lienInvalide: "Ce lien de désinscription n'est plus valable.",
  confirmee:
    "C'est fait. Vous ne recevrez plus aucun message de prospection de cet expéditeur.",
  panne: "Votre demande n'a pas pu être enregistrée. Réessayez dans un instant.",
} as const;

export interface LeadEmailLookup {
  find(tenantId: string, leadId: string): Promise<{ email: string } | null>;
}

export interface SuppressionWriter {
  /** Idempotent : suivre deux fois le même lien ne doit produire ni erreur ni second effet. */
  insert(intent: {
    tenantId: string;
    pattern: string;
    kind: "desinscription";
    reason: string;
  }): Promise<void>;
}

export interface Dependencies {
  readonly leads: LeadEmailLookup;
  readonly suppressions: SuppressionWriter;
  /** Lu à chaque appel plutôt que capturé une fois : un test peut le faire varier. */
  readonly secret: () => string | undefined;
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function page(title: string, message: string): string {
  // Page minimale, sans dépendance externe : c'est un accusé de réception, pas une vitrine.
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title} — Sentio</title>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;color:#111">` +
    `<h1 style="font-size:1.25rem">${title}</h1><p>${message}</p></body></html>`;
}

/** Réponse vide : c'est ce qu'un client de messagerie attend d'un POST en un clic (RFC 8058),
 *  qui n'affiche jamais le corps de la réponse à son utilisateur. */
function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

export function createHandler(deps: Dependencies) {
  async function handle(request: Request): Promise<Response> {
    const correlation = correlationId(request);
    const isOneClick = request.method === "POST";

    if (request.method !== "GET" && request.method !== "POST") {
      log({ route: ROUTE, correlationId: correlation, status: 405, reason: "methode" });
      return htmlResponse(405, page("Méthode refusée", MESSAGES.methodeRefusee));
    }

    const secret = deps.secret();
    const token = new URL(request.url).searchParams.get("t") ?? "";
    const identified = secret !== undefined && token !== "" ? await verifyOptOutToken(token, secret) : null;

    if (identified === null) {
      log({ route: ROUTE, correlationId: correlation, status: 400, reason: "jeton_invalide" });
      return isOneClick
        ? emptyResponse(400)
        : htmlResponse(400, page("Lien invalide", MESSAGES.lienInvalide));
    }

    const lead = await deps.leads.find(identified.tenantId, identified.leadId);
    if (lead === null) {
      // Rien à désinscrire — le prospect a peut-être déjà été retiré. Ce n'est pas un échec du
      // point de vue de qui a cliqué : la seule promesse tenue, « vous ne recevrez plus rien »,
      // est déjà vraie. On le journalise pour repérer un jeton qui pointerait dans le vide, sans
      // le faire porter au visiteur.
      log({ route: ROUTE, correlationId: correlation, status: 200, reason: "prospect_introuvable" });
      return isOneClick
        ? emptyResponse(200)
        : htmlResponse(200, page("Désinscription prise en compte", MESSAGES.confirmee));
    }

    try {
      const intent = desinscrire({
        tenantId: identified.tenantId as TenantId,
        leadId: identified.leadId as LeadId,
        email: lead.email,
      });
      await deps.suppressions.insert(intent);
    } catch (error) {
      if (error instanceof AdresseManquante) {
        log({ route: ROUTE, correlationId: correlation, status: 200, reason: "adresse_manquante" });
        return isOneClick
          ? emptyResponse(200)
          : htmlResponse(200, page("Désinscription prise en compte", MESSAGES.confirmee));
      }
      throw error;
    }

    log({ route: ROUTE, correlationId: correlation, status: 200, outcome: "desinscrit" });
    return isOneClick
      ? emptyResponse(200)
      : htmlResponse(200, page("Désinscription confirmée", MESSAGES.confirmee));
  }

  /** L'enveloppe qui ne laisse jamais fuir une panne — même principe que `diagnostic/handler.ts`. */
  async function respond(request: Request): Promise<Response> {
    const correlation = correlationId(request);
    try {
      return await handle(request);
    } catch (error) {
      log({
        route: ROUTE,
        correlationId: correlation,
        status: 500,
        reason: error instanceof Error ? error.name : "inconnu",
      });
      console.error(JSON.stringify({ route: ROUTE, correlationId: correlation, error: String(error) }));
      return request.method === "POST"
        ? emptyResponse(500)
        : htmlResponse(500, page("Panne", MESSAGES.panne));
    }
  }

  return { handle, respond };
}
