// ════════════════════════════════════════════════════════════════════
// Client Supabase côté NAVIGATEUR — pour Realtime (WebSocket sur
// execution_event) et pour le bouton "Se connecter" côté client.
// ════════════════════════════════════════════════════════════════════

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, anon);
}
