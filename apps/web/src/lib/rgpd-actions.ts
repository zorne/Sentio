// ════════════════════════════════════════════════════════════════════
// Server Actions RGPD — enregistrement traçable des demandes des personnes
// concernées. Écriture directe en base : la date de réception fait foi
// pour le délai de réponse de 30 jours (RGPD art. 12.3).
// ════════════════════════════════════════════════════════════════════

"use server";

import { Client } from "pg";

const RIGHTS = new Set(["access", "portability", "rectification", "erasure", "restriction", "objection"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Anti-flood minimal en mémoire — un tenant ne devrait pas soumettre plus
// de 3 demandes par heure. La limitation en dur reste acceptable ici car
// une demande RGPD est rare et personnelle.
const hits = new Map<string, number[]>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 3) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export interface RgpdInput { right: string; email: string; detail: string }
export type RgpdResult = { ok: true } | { ok: false; error: string };

export async function submitRgpdRequest(input: RgpdInput): Promise<RgpdResult> {
  if (!RIGHTS.has(input.right)) return { ok: false, error: "Type de droit invalide." };
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: "Email invalide." };
  const detail = input.detail.trim().slice(0, 2000);

  // Note : dans une Server Action, on n'a pas d'IP fiable sans passer par
  // les headers request-scoped. On journalise "unknown" — la valeur légale
  // reste l'email fourni.
  if (throttled(email)) return { ok: false, error: "Trop de demandes. Réessayez dans une heure." };

  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    await db.query(
      `insert into rgpd_request (right_type, subject_email, detail) values ($1, $2, $3)`,
      [input.right, email, detail]
    );
    // TODO : notifier privacy@sentia.com par email (Resend/SMTP à brancher).
    // Pour l'instant, la trace en base est la source de vérité juridique.
    return { ok: true };
  } catch (err) {
    console.error("[rgpd]", err instanceof Error ? err.message : err);
    return { ok: false, error: "Erreur d'enregistrement. Contactez privacy@sentia.com." };
  } finally {
    await db.end();
  }
}
