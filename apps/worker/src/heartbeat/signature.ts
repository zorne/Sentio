/**
 * La signature d'un battement — authentifier le déclencheur, rien de plus.
 *
 * Le battement réveille l'exécution ([`docs/05-runtime-employe.md`](../../../../docs/05-runtime-employe.md)).
 * Un point d'entrée qui ne se protégerait que par l'obscurité de son URL serait déclenchable par
 * n'importe qui — donc un levier gratuit pour brûler le quota d'inférence de la plateforme, qui
 * est justement ce que `provider_quota` existe pour rationner.
 *
 * Même construction que le jeton de désinscription (`supabase/functions/_shared/optout-token.ts`) :
 * HMAC-SHA256 via `crypto.subtle`, secret que seul le serveur connaît. Deux différences, et elles
 * comptent :
 *
 *   1. **L'horodatage est signé avec le reste**, et une signature trop vieille est refusée. Sans
 *      ça, un en-tête intercepté une fois rejouerait des battements indéfiniment. L'idempotence
 *      protège les effets extérieurs, pas la dépense : chaque rejeu coûterait des appels de
 *      modèle bien réels.
 *   2. **L'absence de secret refuse tout.** Un point d'entrée qui s'ouvrirait quand sa
 *      configuration manque est un point d'entrée ouvert le jour où quelqu'un se trompe de
 *      variable d'environnement — c'est-à-dire le jour où personne ne regarde.
 *
 * Réalise : EXEC-01
 */

/** Fenêtre d'acceptation par défaut, de part et d'autre de l'horodatage signé.
 *
 *  Cinq minutes : assez large pour absorber la dérive d'horloge d'un planificateur et la latence
 *  d'un appel, assez étroite pour qu'un en-tête capturé ne serve pas le lendemain. Ce n'est pas
 *  une valeur sacrée ; l'existence d'une borne, si. */
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

/** Pourquoi un battement est refusé. Jamais rendu à l'appelant — voir `respond` — mais
 *  journalisé : sans la raison, une panne de configuration est indistinguable d'une attaque. */
export type HeartbeatRejection =
  | "secret_absent"
  | "entete_absent"
  | "entete_malforme"
  | "horodatage_invalide"
  | "hors_fenetre"
  | "signature_invalide";

export type SignatureVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: HeartbeatRejection };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** L'en-tête que porte un battement : `<millisecondes>.<signature base64url>`. */
export const HEARTBEAT_HEADER = "x-sentio-heartbeat";

/**
 * Construit l'en-tête d'un battement. Sert au planificateur — et aux tests, qui doivent pouvoir
 * produire un battement authentique sans recopier le format.
 */
export async function signHeartbeat(secret: string, at: Date): Promise<string> {
  const horodatage = String(at.getTime());
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(horodatage));
  return `${horodatage}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Vérifie l'en-tête d'un battement.
 *
 * L'ordre des contrôles n'est pas indifférent : la fenêtre est vérifiée AVANT la signature, pour
 * qu'un horodatage périmé ne coûte même pas un calcul HMAC.
 */
export async function verifyHeartbeat(input: {
  header: string | null;
  secret: string | undefined;
  now: Date;
  toleranceMs?: number;
}): Promise<SignatureVerdict> {
  // Fermé par défaut : pas de secret configuré, pas de battement. Jamais l'inverse.
  if (input.secret === undefined || input.secret === "") return { ok: false, reason: "secret_absent" };
  if (input.header === null || input.header.trim() === "") return { ok: false, reason: "entete_absent" };

  const parts = input.header.split(".");
  if (parts.length !== 2) return { ok: false, reason: "entete_malforme" };
  const [horodatage, signature] = parts;
  if (!horodatage || !signature) return { ok: false, reason: "entete_malforme" };

  const emisA = Number(horodatage);
  if (!Number.isSafeInteger(emisA)) return { ok: false, reason: "horodatage_invalide" };

  const tolerance = input.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  if (Math.abs(input.now.getTime() - emisA) > tolerance) return { ok: false, reason: "hors_fenetre" };

  try {
    const key = await hmacKey(input.secret);
    const valide = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(fromBase64Url(signature)),
      new TextEncoder().encode(horodatage),
    );
    return valide ? { ok: true } : { ok: false, reason: "signature_invalide" };
  } catch {
    // Signature illisible (base64 invalide, longueur aberrante) : refusée comme une signature
    // fausse. La distinction n'aiderait que celui qui cherche à en fabriquer une.
    return { ok: false, reason: "signature_invalide" };
  }
}
