/**
 * L'adaptateur d'hôte : un serveur Node qui parle `Request` / `Response`.
 *
 * ══ POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST SI COURT ══
 *
 * Le battement est écrit aux standards du web — `Request` → `Response` — pour ne dépendre d'aucun
 * hébergeur (`heartbeat/index.ts`). Node, lui, parle `IncomingMessage` / `ServerResponse`. Ce
 * fichier est la traduction entre les deux, et **rien d'autre** : aucune règle, aucune décision,
 * aucune donnée. C'est ce qui fait qu'un changement d'hôte se paie ici, et nulle part ailleurs
 * (`docs/adr/0021`, règle 4).
 *
 * ⚠️ **Il ne lit aucun corps de requête.** Le battement n'en a pas : il est authentifié par un
 * en-tête signé, et son déclencheur ne transmet rien d'autre. Lire un corps qu'on n'utilise pas
 * offrirait une surface d'attaque gratuite — un corps de plusieurs gigaoctets suffirait à saturer
 * la mémoire d'un service qui n'en avait pas besoin.
 *
 * Réalise : EXEC-18
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/** Ce que le worker expose au monde. Une seule route : le reste répond 404, sans détail. */
export const ROUTE_DU_BATTEMENT = "/battement";

export interface ServeurEnMarche {
  readonly port: number;
  readonly arreter: () => Promise<void>;
}

/** Traduit une requête Node vers une requête du web. L'hôte et le schéma ne servent qu'à
 *  construire une URL absolue : rien de ce qu'ils contiennent n'est utilisé pour décider. */
function versRequeteWeb(message: IncomingMessage): Request {
  const url = new URL(message.url ?? "/", "http://worker.local");
  const headers = new Headers();
  for (const [nom, valeur] of Object.entries(message.headers)) {
    if (typeof valeur === "string") headers.set(nom, valeur);
    else if (Array.isArray(valeur)) headers.set(nom, valeur.join(", "));
  }
  return new Request(url, { method: message.method ?? "GET", headers });
}

async function ecrire(reponse: Response, sortie: ServerResponse): Promise<void> {
  const entetes: Record<string, string> = {};
  reponse.headers.forEach((valeur, nom) => {
    entetes[nom] = valeur;
  });
  sortie.writeHead(reponse.status, entetes);
  sortie.end(await reponse.text());
}

/**
 * Démarre le serveur.
 *
 * `port: 0` demande à l'hôte un port libre — c'est ce que font les tests, pour qu'aucune suite ne
 * dépende d'un port fixe ni n'entre en collision avec une autre.
 */
export function demarrerLeServeur(
  battement: (request: Request) => Promise<Response>,
  options: { port: number; log?: (record: Record<string, unknown>) => void },
): Promise<ServeurEnMarche> {
  const log = options.log ?? (() => undefined);

  const serveur: Server = createServer((message, sortie) => {
    void (async () => {
      try {
        const url = new URL(message.url ?? "/", "http://worker.local");
        if (url.pathname !== ROUTE_DU_BATTEMENT) {
          // Aucun détail : une réponse qui distinguerait « route inconnue » de « méthode
          // refusée » aide surtout celui qui cartographie le service.
          sortie.writeHead(404, { "content-type": "application/json; charset=utf-8" });
          sortie.end(JSON.stringify({ erreur: "Introuvable." }));
          return;
        }
        await ecrire(await battement(versRequeteWeb(message)), sortie);
      } catch (erreur) {
        // Un serveur qui meurt sur une requête mal formée est un serveur indisponible. On
        // journalise et on rend 500 — la cause reste chez nous, jamais dans la réponse.
        log({ route: "serveur", status: 500, erreur: String(erreur) });
        sortie.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        sortie.end(JSON.stringify({ erreur: "Erreur interne." }));
      }
    })();
  });

  return new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(options.port, () => {
      const adresse = serveur.address();
      const port = typeof adresse === "object" && adresse !== null ? adresse.port : options.port;
      let arrete = false;
      resolve({
        port,
        // ⚠️ Idempotent. Un arrêt demandé deux fois — un `SIGTERM` qui arrive pendant un arrêt
        // manuel, un orchestrateur qui insiste — ne doit pas produire d'erreur : « déjà arrêté »
        // est le résultat voulu, pas un échec. Sans ça, le second appel rejette
        // (`ERR_SERVER_NOT_RUNNING`) et transforme un arrêt propre en incident.
        arreter: () =>
          new Promise<void>((fini, echec) => {
            if (arrete) {
              fini();
              return;
            }
            arrete = true;
            serveur.close((erreur) => (erreur === undefined ? fini() : echec(erreur)));
          }),
      });
    });
  });
}
