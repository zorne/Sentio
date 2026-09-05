// ════════════════════════════════════════════════════════════════════
// Le rafraîchissement de session — la seule chose que ce fichier fait.
//
// ══ POURQUOI IL EXISTE, ET CE QU'IL RÉPARE ══
//
// `lib/supabase-server.ts` écrit, depuis toujours : « Peut échouer dans un Server Component
// (cookies read-only) — on ignore, middleware s'en charge quand nécessaire. » Ce middleware
// n'existait pas. Le `catch {}` avalait donc l'écriture, et personne ne persistait le jeton
// rafraîchi.
//
// Ce que ça produisait, mesuré et non supposé (`lib/session-sans-middleware.test.ts`) :
//
//   1. le jeton d'accès expire (`jwt_expiry = 3600`) ;
//   2. le Server Component rafraîchit — la page s'affiche NORMALEMENT ;
//   3. mais Supabase fait tourner le jeton de rafraîchissement, et le nouveau n'est écrit
//      nulle part : le navigateur garde l'ancien, désormais consommé ;
//   4. à la requête suivante, `AuthApiError: Already Used` → `getUser()` rend `null` →
//      `redirect("/login")`.
//
// La perte est donc DIFFÉRÉE et SILENCIEUSE : le dirigeant est éjecté au chargement d'après,
// sans rien avoir fait de particulier. C'est le pire cas pour qui doit la diagnostiquer.
//
// En s'exécutant AVANT le Server Component, ce middleware rafraîchit là où l'écriture de cookies
// est permise, puis passe le jeton neuf à la fois à la requête (pour la page, dans cette passe)
// et à la réponse (pour le navigateur, pour les suivantes).
//
// ══ CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ ══
//
// ⚠️ **Aucune autorisation.** Il ne lit aucune entreprise, ne redirige pas, ne protège aucune
// route. Il n'ouvre donc aucune surface d'accès nouvelle : tout ce qu'un visiteur pouvait
// atteindre avant, il l'atteint pareil, et rien de plus. Les décisions restent où elles sont —
// `redirect("/login")` dans la page, `isAuthorizedForTenant` dans les Server Actions. Déplacer
// une garde ici la rendrait invisible à l'endroit où on la cherche.
//
// ⚠️ **Il ne s'exécute pas sur le site public.** Rafraîchir une session sur `/` ou `/formules`
// ajouterait un appel réseau à Supabase pour chaque visiteur anonyme, sur des pages qui n'ont
// aucune session à tenir — et le budget d'exploitation est de €0 (`docs/11-exploitation.md`).
// Le premier passage dans l'espace suffit : c'est là que le jeton est lu.
// ════════════════════════════════════════════════════════════════════

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Même forme que dans `lib/supabase-server.ts` : la bibliothèque ne l'exporte pas nommée. */
interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  // ⚠️ Mal configuré, on laisse passer sans rien faire. Lever ici rendrait le site entier
  // inaccessible sur une variable oubliée, là où la page, elle, dit clairement ce qui manque.
  if (url === undefined || anon === undefined || url === "" || anon === "") return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // ⚠️ LES DEUX ÉCRITURES COMPTENT, ET ELLES NE SERVENT PAS LA MÊME CHOSE.
        // Sur la REQUÊTE : le Server Component de cette même passe lira le jeton neuf.
        // Sur la RÉPONSE : le navigateur le gardera pour les passes suivantes.
        // N'en faire qu'une laisse le défaut d'origine, déplacé d'un cran.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Le seul geste : il déclenche le rafraîchissement si le jeton a expiré. Le résultat ne nous
  // intéresse pas — la page le redemandera, et c'est elle qui décide quoi en faire.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Uniquement là où une session est lue. Voir l'en-tête : le site public n'a rien à rafraîchir.
  matcher: ["/espace/:path*", "/acces/:path*"],
};
