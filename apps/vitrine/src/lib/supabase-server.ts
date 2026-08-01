// ════════════════════════════════════════════════════════════════════
// Client Supabase côté SERVEUR — utilisé dans les Server Components,
// Server Actions et Route Handlers. Utilise les cookies pour lire la
// session de l'utilisateur connecté. RLS Postgres s'applique
// automatiquement (auth.uid() est renseigné par le JWT du cookie).
// ════════════════════════════════════════════════════════════════════

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquants dans .env.local");
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Peut échouer dans un Server Component (cookies read-only) — on
        // ignore, middleware s'en charge quand nécessaire.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {}
      },
    },
  });
}
