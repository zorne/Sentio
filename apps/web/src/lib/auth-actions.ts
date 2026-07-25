// ════════════════════════════════════════════════════════════════════
// Server Action de connexion — appelée UNIQUEMENT par un clic explicite
// de l'utilisateur (jamais au chargement d'une page). Voir
// /auth/callback/page.tsx pour le pourquoi (protection anti-scanner
// d'emails type Apple Mail Privacy Protection).
// ════════════════════════════════════════════════════════════════════

"use server";

import { createSupabaseServerClient } from "./supabase-server";

export async function confirmMagicLink(code: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return { error: error?.message ?? null };
}
