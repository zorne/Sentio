/**
 * Le transport, et rien d'autre.
 *
 * Ce module contient ce qu'une fonction doit savoir du protocole HTTP — méthode, taille, en-têtes,
 * origine autorisée, identifiant de corrélation, forme de la réponse. **Aucune règle métier n'a le
 * droit d'entrer ici** : une fonction valide, appelle le domaine, répond
 * ([`adr/0021`](../../../docs/adr/0021-execution-serveur-en-ue.md), règle 2). C'est aussi ce qui
 * rend la migration bornée : le jour où les fonctions deviennent des routes serveur, ce fichier
 * est l'un des deux endroits à porter, et le seul de ce dossier à contenir du code écrit à la main.
 *
 * Deux choix de sécurité qui se lisent mal si on ne les explique pas :
 *
 *   • **tout est fermé par défaut.** Aucune origine autorisée si la variable n'est pas posée, aucun
 *     corps accepté sans type déclaré, aucune taille tolérée sans longueur annoncée. Un réglage
 *     oublié doit refuser, jamais ouvrir.
 *   • **le journal ne reçoit aucune donnée personnelle** (priorité 1). On y écrit un identifiant de
 *     corrélation, un état, des *noms* de champs fautifs — jamais leur contenu.
 */

/**
 * Un profil de diagnostic tient en quelques centaines d'octets. Cette borne n'est pas un confort :
 * elle empêche qu'une fonction publique serve à faire transiter autre chose.
 */
export const MAX_REQUEST_BYTES = 8 * 1024;

/** Ce qu'on écrit dans le journal — et la liste est volontairement courte. */
export interface LogRecord {
  readonly route: string;
  readonly correlationId: string;
  readonly status: number;
  /** L'issue métier, quand il y en a une : `recommande`, `incomplet`, `hors_perimetre`. */
  readonly outcome?: string;
  /** Les **noms** des champs refusés. Jamais leurs valeurs. */
  readonly rejectedFields?: readonly string[];
  readonly reason?: string;
}

export function log(record: LogRecord): void {
  console.log(JSON.stringify(record));
}

/**
 * L'identifiant de corrélation : celui du client s'il en fournit un d'allure raisonnable, sinon un
 * nouveau. Il est rendu dans la réponse, pour qu'un incident raconté par un visiteur puisse être
 * retrouvé dans le journal (priorité 5).
 */
export function correlationId(request: Request): string {
  const provided = request.headers.get("x-correlation-id");
  if (provided !== null && /^[A-Za-z0-9-]{8,64}$/.test(provided)) return provided;
  return crypto.randomUUID();
}

/**
 * Les origines autorisées à appeler la fonction depuis un navigateur, lues dans
 * `SENTIO_ALLOWED_ORIGINS` (séparées par des virgules).
 *
 * La vitrine est servie ailleurs que les fonctions : sans cette liste, aucune page ne peut appeler
 * quoi que ce soit. C'est voulu — une liste absente ferme, elle n'ouvre pas.
 */
function allowedOrigins(): readonly string[] {
  const raw = Deno.env.get("SENTIO_ALLOWED_ORIGINS") ?? "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin === null || !allowedOrigins().includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-correlation-id",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

/**
 * La réponse. Toujours du JSON, jamais mise en cache, jamais devinée par le navigateur.
 *
 * `no-store` n'est pas de la prudence : une réponse de diagnostic décrit l'entreprise d'un
 * visiteur, et rien de tel ne doit rester dans un cache intermédiaire.
 */
export function jsonResponse(
  request: Request,
  status: number,
  payload: unknown,
  correlation: string,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-correlation-id": correlation,
      ...corsHeaders(request),
    },
  });
}

/** La réponse à une requête préalable de navigateur. Vide, et sans corps. */
export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export type BodyRead =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: number; readonly message: string; readonly reason: string };

/**
 * Lit un corps JSON borné.
 *
 * L'ordre des vérifications compte : on refuse **avant** de lire. Annoncer une longueur est
 * obligatoire, parce qu'un corps sans longueur annoncée ne peut pas être refusé à l'avance.
 */
export async function readJsonBody(request: Request): Promise<BodyRead> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return {
      ok: false,
      status: 415,
      message: "Format de demande non accepté.",
      reason: "content_type",
    };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength === null || !/^\d+$/.test(declaredLength)) {
    return {
      ok: false,
      status: 411,
      message: "Demande incomplète.",
      reason: "content_length_absente",
    };
  }
  if (Number(declaredLength) > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, message: "Demande trop volumineuse.", reason: "taille" };
  }

  const text = await request.text();
  // La longueur annoncée n'engage personne : on revérifie sur ce qui est réellement arrivé.
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, message: "Demande trop volumineuse.", reason: "taille_reelle" };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, message: "Demande illisible.", reason: "json_invalide" };
  }
}

/**
 * Un drapeau de fonctionnalité, lu dans l'environnement, **fermé par défaut**.
 *
 * La valeur de repli vient de `@sentio/config` : les drapeaux y sont définis une fois, avec leur
 * raison d'être, et une fonction ne les redéclare pas.
 */
export function envFlag(name: string, fallback: boolean): boolean {
  const raw = Deno.env.get(name);
  if (raw === undefined) return fallback;
  return raw === "true";
}
