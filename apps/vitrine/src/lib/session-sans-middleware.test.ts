// ════════════════════════════════════════════════════════════════════
// LA SESSION SURVIT-ELLE À L'EXPIRATION DU JETON, SANS `middleware.ts` ?
//
// ══ CE QUE CETTE SUITE PROUVE, ET CE QU'ELLE NE PROUVE PAS ══
//
// Elle exerce le VRAI `createSupabaseServerClient` et la VRAIE bibliothèque `@supabase/ssr`
// (0.5.2). Ce qui est simulé, et seulement ça : le serveur d'authentification, remplacé par un
// GoTrue de paille qui applique la même règle que le vrai — **la rotation du jeton de
// rafraîchissement**. Un jeton présenté deux fois est refusé.
//
// Ce n'est donc pas une preuve de bout en bout contre Supabase (impossible ici : pas de Docker,
// donc pas de pile locale). C'est la preuve du MÉCANISME, à l'endroit exact où il se joue :
// l'écriture des cookies après un rafraîchissement.
//
// ⚠️ Ce qui différencie un Server Component d'une Server Action, et qui est tout le sujet : dans
// un Server Component, `cookies()` est en LECTURE SEULE et `.set()` lève. `supabase-server.ts`
// avale cette exception (`catch {}`) en renvoyant à un middleware — qui n'existe pas dans ce
// dépôt. La question est donc : que devient la session quand personne ne persiste le jeton
// rafraîchi ?
// ════════════════════════════════════════════════════════════════════

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Le magasin de cookies, et la seule chose qui change entre les deux mondes ────────────────
interface Cookie {
  name: string;
  value: string;
}

const magasin = vi.hoisted(() => ({
  cookies: [] as Cookie[],
  /** Server Component : l'écriture lève. Middleware / Server Action : elle passe. */
  ecritureAutorisee: false,
  ecrituresRefusees: 0,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => magasin.cookies.map((c) => ({ name: c.name, value: c.value })),
    set: (name: string, value: string) => {
      if (!magasin.ecritureAutorisee) {
        magasin.ecrituresRefusees += 1;
        // Le message de Next lui-même, pour que l'essai ressemble à la réalité.
        throw new Error("Cookies can only be modified in a Server Action or Route Handler");
      }
      const existant = magasin.cookies.find((c) => c.name === name);
      if (existant) existant.value = value;
      else magasin.cookies.push({ name, value });
    },
  }),
}));

// ── Un GoTrue de paille ──────────────────────────────────────────────────────────────────────
const UTILISATEUR = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "dirigeante@exemple.fr",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};

function jeton(expireDans: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const maintenant = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({
      sub: UTILISATEUR.id,
      aud: "authenticated",
      role: "authenticated",
      email: UTILISATEUR.email,
      iat: maintenant,
      exp: maintenant + expireDans,
    }),
    "signature-de-paille",
  ].join(".");
}

/** Les jetons de rafraîchissement déjà consommés. C'est LA règle qui rend l'absence de
 *  persistance mortelle : Supabase fait tourner le jeton à chaque usage. */
const consommes = new Set<string>();
let rafraichissements = 0;
let compteur = 0;

function session(expireDans: number) {
  compteur += 1;
  return {
    access_token: jeton(expireDans),
    refresh_token: `refresh-${compteur}`,
    expires_in: expireDans,
    expires_at: Math.floor(Date.now() / 1000) + expireDans,
    token_type: "bearer",
    user: UTILISATEUR,
  };
}

let serveur: Server;
let base: string;

beforeAll(async () => {
  // ⚠️ `supabase-js` construit son client temps réel dès `createClient`, et celui-ci exige un
  // `WebSocket` global. Node 20 n'en fournit pas sans drapeau ; Node 22 oui. Ce bouchon ne sert
  // qu'à laisser la suite s'exécuter sous Node 20 — il ne masque pas un défaut du produit, il
  // remplace une capacité de la plateforme. Voir le compte rendu : la même absence sous Node 20
  // en production ferait lever `createSupabaseServerClient`, ce qui se vérifie séparément.
  if (!("WebSocket" in globalThis)) {
    (globalThis as Record<string, unknown>)["WebSocket"] = class {
      close(): void {}
      addEventListener(): void {}
      removeEventListener(): void {}
      send(): void {}
    };
  }

  serveur = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let corps = "";
    req.on("data", (c) => (corps += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");

      if (url.pathname === "/auth/v1/token") {
        const type = url.searchParams.get("grant_type");

        if (type === "password") {
          res.end(JSON.stringify(session(3600)));
          return;
        }

        if (type === "refresh_token") {
          rafraichissements += 1;
          const presente = (JSON.parse(corps || "{}") as { refresh_token?: string }).refresh_token;

          // ⚠️ LA ROTATION. Un jeton déjà servi ne resservira pas — c'est le comportement réel de
          // Supabase, et c'est ce qui transforme « le cookie n'a pas été réécrit » en
          // « la session est perdue ».
          if (presente !== undefined && consommes.has(presente)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "invalid_grant", error_description: "Already Used" }));
            return;
          }
          if (presente !== undefined) consommes.add(presente);
          res.end(JSON.stringify(session(3600)));
          return;
        }
      }

      if (url.pathname === "/auth/v1/user") {
        res.end(JSON.stringify(UTILISATEUR));
        return;
      }

      res.statusCode = 404;
      res.end("{}");
    });
  });

  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  const adresse = serveur.address();
  base = `http://127.0.0.1:${typeof adresse === "object" && adresse !== null ? adresse.port : 0}`;

  process.env["NEXT_PUBLIC_SUPABASE_URL"] = base;
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "cle-anon-de-paille";
});

afterAll(async () => {
  await new Promise<void>((ok) => serveur.close(() => ok()));
});

beforeEach(() => {
  magasin.cookies = [];
  magasin.ecritureAutorisee = true;
  magasin.ecrituresRefusees = 0;
  consommes.clear();
  rafraichissements = 0;
});

/** Une connexion réussie, telle que la Server Action la fait : l'écriture y est permise. */
async function seConnecter(): Promise<void> {
  const { createSupabaseServerClient } = await import("./supabase-server.js");
  magasin.ecritureAutorisee = true;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: UTILISATEUR.email,
    password: "peu-importe",
  });
  expect(error).toBeNull();
}

/** Rend le jeton d'accès du cookie expiré, sans toucher au jeton de rafraîchissement. */
function faireExpirerLeJetonDAcces(): void {
  for (const c of magasin.cookies) {
    const brut = c.value.startsWith("base64-")
      ? Buffer.from(c.value.slice("base64-".length), "base64url").toString("utf8")
      : decodeURIComponent(c.value);
    let objet: Record<string, unknown>;
    try {
      objet = JSON.parse(brut) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof objet["access_token"] !== "string") continue;
    objet["access_token"] = jeton(-60);
    objet["expires_at"] = Math.floor(Date.now() / 1000) - 60;
    objet["expires_in"] = -60;
    const rendu = JSON.stringify(objet);
    c.value = c.value.startsWith("base64-")
      ? `base64-${Buffer.from(rendu, "utf8").toString("base64url")}`
      : encodeURIComponent(rendu);
  }
}

describe("persistance de la session sans middleware.ts", () => {
  it("la connexion écrit bien la session en cookie (le point de départ est sain)", async () => {
    await seConnecter();
    expect(magasin.cookies.length).toBeGreaterThan(0);
    expect(magasin.cookies.some((c) => c.name.includes("auth-token"))).toBe(true);
  });

  it("AVEC écriture possible (ce que ferait un middleware) : le jeton rafraîchi est persisté", async () => {
    await seConnecter();
    faireExpirerLeJetonDAcces();
    const avant = JSON.stringify(magasin.cookies);

    const { createSupabaseServerClient } = await import("./supabase-server.js");
    magasin.ecritureAutorisee = true;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    expect(error).toBeNull();
    expect(data.user?.id).toBe(UTILISATEUR.id);
    expect(rafraichissements).toBeGreaterThan(0);
    // La preuve : le cookie a changé, donc la prochaine requête partira avec le NOUVEAU jeton.
    expect(JSON.stringify(magasin.cookies)).not.toBe(avant);
  });

  it("SANS écriture possible (Server Component, pas de middleware) : le cookie n'est pas réécrit", async () => {
    await seConnecter();
    faireExpirerLeJetonDAcces();
    const avant = JSON.stringify(magasin.cookies);

    const { createSupabaseServerClient } = await import("./supabase-server.js");
    magasin.ecritureAutorisee = false;
    const supabase = await createSupabaseServerClient();
    await supabase.auth.getUser();

    expect(magasin.ecrituresRefusees).toBeGreaterThan(0);
    expect(JSON.stringify(magasin.cookies)).toBe(avant);
  });

  it("CONSÉQUENCE : la requête SUIVANTE perd la session, jeton de rafraîchissement déjà consommé", async () => {
    await seConnecter();
    faireExpirerLeJetonDAcces();

    const { createSupabaseServerClient } = await import("./supabase-server.js");

    // Première visite de /espace après expiration : rafraîchit, ne peut rien écrire.
    magasin.ecritureAutorisee = false;
    const premier = await createSupabaseServerClient();
    const un = await premier.auth.getUser();

    // Deuxième visite : mêmes cookies, donc même jeton de rafraîchissement — déjà consommé.
    const second = await createSupabaseServerClient();
    const deux = await second.auth.getUser();

    // ⚠️ LA PREMIÈRE VISITE RÉUSSIT. C'est le pire des deux cas : la perte est DIFFÉRÉE et
    // silencieuse. Un rafraîchissement réussi côté serveur sert la page normalement, tout en
    // brûlant le jeton que le navigateur garde. Rien ne signale que le cookie est devenu périmé.
    expect(un.data.user?.id).toBe(UTILISATEUR.id);

    // Et la suivante tombe. C'est ce que verrait le dirigeant : `redirect("/login")`, sans
    // explication, alors qu'il vient d'utiliser son espace.
    expect(deux.data.user).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// LE CORRECTIF — le middleware rafraîchit là où l'écriture est permise.
// ════════════════════════════════════════════════════════════════════

describe("le middleware répare la persistance", () => {
  /** Rejoue le trajet d'une requête : cookies du navigateur → middleware → cookies rendus. */
  async function passerParLeMiddleware(
    entrants: Cookie[],
  ): Promise<{ sortants: Cookie[]; aReecrit: boolean }> {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware.js");

    const requete = new NextRequest(new URL("http://localhost:3000/espace"));
    for (const c of entrants) requete.cookies.set(c.name, c.value);

    const reponse = await middleware(requete);
    const sortants = reponse.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
    return { sortants, aReecrit: sortants.length > 0 };
  }

  it("le middleware réécrit le cookie de session quand le jeton a expiré", async () => {
    await seConnecter();
    faireExpirerLeJetonDAcces();
    const avant = magasin.cookies.map((c) => ({ ...c }));

    const { sortants, aReecrit } = await passerParLeMiddleware(avant);

    expect(aReecrit).toBe(true);
    expect(rafraichissements).toBeGreaterThan(0);
    // Le cookie rendu au navigateur n'est plus celui qu'il avait envoyé.
    expect(JSON.stringify(sortants)).not.toBe(JSON.stringify(avant));
  });

  it("la session survit à DEUX requêtes de plus — ce qui échouait sans lui", async () => {
    await seConnecter();
    faireExpirerLeJetonDAcces();

    // Le middleware s'exécute et rend les cookies neufs, que le navigateur adopte.
    const { sortants } = await passerParLeMiddleware(magasin.cookies.map((c) => ({ ...c })));
    magasin.cookies = sortants;

    const { createSupabaseServerClient } = await import("./supabase-server.js");

    // Puis deux Server Components lisent la session, sans jamais pouvoir écrire.
    magasin.ecritureAutorisee = false;
    const un = await (await createSupabaseServerClient()).auth.getUser();
    const deux = await (await createSupabaseServerClient()).auth.getUser();

    expect(un.data.user?.id).toBe(UTILISATEUR.id);
    expect(deux.data.user?.id).toBe(UTILISATEUR.id);
  });

  it("le middleware n'ouvre aucune porte : sans cookie, il ne rend aucune session", async () => {
    const { sortants } = await passerParLeMiddleware([]);
    // Rien à rafraîchir, donc rien à écrire — et surtout, aucune session fabriquée.
    expect(sortants.every((c) => c.value === "" || !c.name.includes("auth-token"))).toBe(true);
  });

  it("le middleware ne s'exécute que sur l'espace privé, jamais sur le site public", async () => {
    const { config } = await import("../middleware.js");
    expect(config.matcher).toEqual(["/espace/:path*", "/acces/:path*"]);
  });
});
