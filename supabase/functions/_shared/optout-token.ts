/**
 * Le jeton du lien de désinscription — transport, pas domaine.
 *
 * Un lien d'opposition doit fonctionner pour n'importe qui le suit, sans session ni mot de
 * passe : c'est tout son intérêt. Mais un lien qui porterait `tenant_id` et `lead_id` en clair
 * se devine et s'énumère — n'importe qui pourrait désinscrire les prospects d'un concurrent en
 * itérant des identifiants. Le jeton signé règle ça : la charge utile n'est acceptée que si sa
 * signature, produite avec un secret que seul le serveur connaît, est vérifiée bit à bit.
 *
 * Ce n'est pas une règle métier — « une désinscription vérifiée doit être honorée » vit dans
 * `packages/domain/src/optout.ts`. Ceci ne fait qu'authentifier la demande, comme un jeton de
 * session authentifie un visiteur ailleurs. D'où sa place ici plutôt que dans le domaine, qui ne
 * fait aucune entrée/sortie — la signature HMAC en est une, via `crypto.subtle`.
 */

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

/** Construit le jeton. Sert à `packages/capabilities/src/email/send-message.ts` au moment de
 *  composer `optOutUrl` — pas encore branché (`docs/20-plan-action.md`, phase 3), volontairement :
 *  le jeton doit exister et se vérifier avant d'être distribué dans un vrai message. */
export async function buildOptOutToken(
  tenantId: string,
  leadId: string,
  secret: string,
): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(`${tenantId}:${leadId}`));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Vérifie le jeton. `null` pour tout ce qui ne colle pas — jeton absent, mal formé, signature
 *  fausse, secret indisponible — plutôt qu'une distinction que personne ne pourrait exploiter
 *  utilement : soit la demande est légitime, soit elle ne l'est pas. */
export async function verifyOptOutToken(
  token: string,
  secret: string,
): Promise<{ tenantId: string; leadId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(fromBase64Url(signature)),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;

    const decoded = new TextDecoder().decode(fromBase64Url(payload));
    const sep = decoded.indexOf(":");
    if (sep < 1 || sep === decoded.length - 1) return null;
    return { tenantId: decoded.slice(0, sep), leadId: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}
