// ════════════════════════════════════════════════════════════════════
// ACQUIS-17 — limitation par visiteur et par adresse sur le diagnostic
// public. Voir migrations/0011_diagnostic_rate_limit.sql pour le
// pourquoi (base plutôt que mémoire du process).
//
// Ce n'est pas un contrôle de sécurité fin — une charge concurrente
// pourrait laisser passer quelques messages de trop, sans conséquence
// réelle. C'est un plafond de coût : borner ce qu'un visiteur unique ou
// une adresse peut consommer d'inférence par jour.
//
// ⚠️ Ce que ceci NE fait PAS, et qui est fait ailleurs : le plafond
// GLOBAL de l'enveloppe `public_diagnostic` (ACQUIS-18), un
// coupe-circuit pour toute la fonctionnalité, indépendant du comptage
// par visiteur. Il vit dans
// `packages/vitrine-core/src/gateway/envelope.ts` et se branche dans
// `buildDiagnosticGateway()`. Les deux plafonds sont nécessaires : un
// plafond par visiteur ne borne rien face à mille visiteurs, un plafond
// global ne protège pas des mille requêtes d'un seul.
//
// Ce qui reste vrai et non résolu : `buildDiagnosticGateway()` lit la
// même variable `GROQ_API_KEY` que le conseiller. Le budget est
// désormais découpé et appliqué par enveloppe ; la CLÉ, elle, reste
// partagée — donc une limite de débit atteinte par un usage se voit
// encore chez l'autre. Séparer les comptes est une décision
// d'exploitation, pas de code.
//
// Réalise : ACQUIS-17
// ════════════════════════════════════════════════════════════════════

import type { Pool } from "pg";
import { cookies, headers } from "next/headers";
import { createHash, randomUUID } from "node:crypto";

const VISITOR_COOKIE = "sentio_diag_visitor";
export const VISITOR_DAILY_LIMIT = 40;
export const IP_DAILY_LIMIT = 150;

export type RateLimitVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "visiteur" | "adresse" };

/** Lit (ou pose) le cookie visiteur, et calcule le hachage de l'adresse — jamais l'IP en clair
 *  au-delà de cette fonction. */
export async function resolveDiagnosticVisitor(): Promise<{ visitorId: string; ipHash: string }> {
  const jar = await cookies();
  let visitorId = jar.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    visitorId = randomUUID();
    jar.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "adresse-inconnue";
  const salt = process.env.SENTIO_IP_HASH_SALT ?? "sel-de-developpement-jamais-en-production";
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex");

  return { visitorId, ipHash };
}

/** Incrémente le compteur du jour pour ce visiteur, et vérifie les deux plafonds. Incrémente
 *  toujours (même refusé) : un visiteur bloqué qui retente n'échappe pas au compteur, et le
 *  plafond par adresse reste exact. */
export async function checkDiagnosticRateLimit(
  pool: Pool,
  visitorId: string,
  ipHash: string,
): Promise<RateLimitVerdict> {
  const { rows } = await pool.query<{ message_count: number }>(
    `insert into diagnostic_rate_limit (visitor_id, ip_hash, day, message_count)
     values ($1, $2, current_date, 1)
     on conflict (visitor_id, day)
     do update set message_count = diagnostic_rate_limit.message_count + 1
     returning message_count`,
    [visitorId, ipHash],
  );
  const visitorCount = rows[0]?.message_count ?? 0;
  if (visitorCount > VISITOR_DAILY_LIMIT) return { allowed: false, reason: "visiteur" };

  const { rows: ipRows } = await pool.query<{ total: number }>(
    `select coalesce(sum(message_count), 0)::int as total
     from diagnostic_rate_limit where ip_hash = $1 and day = current_date`,
    [ipHash],
  );
  const ipTotal = ipRows[0]?.total ?? 0;
  if (ipTotal > IP_DAILY_LIMIT) return { allowed: false, reason: "adresse" };

  return { allowed: true };
}
