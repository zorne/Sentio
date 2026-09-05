/**
 * Le point d'entrée du battement — il authentifie, il délègue, il répond.
 *
 * C'est le déclencheur de l'exécution autonome ([`docs/05-runtime-employe.md`](../../../../docs/05-runtime-employe.md)) :
 * en V1, aucun serveur permanent ne tourne. Un planificateur appelle ce point d'entrée, qui
 * réveille le système ; celui-ci prend les travaux dus, exécute un pas borné, enregistre l'état
 * et rend la main. C'est ce qui rend le « €0 » tenable sans renoncer à l'autonomie.
 *
 * **Ce que ce module ne fait PAS**, volontairement : il ne lit pas la file, il n'exécute aucun
 * pas, il ne journalise rien. Il reçoit `executerLesTravauxDus` en dépendance — un port, comme
 * partout ailleurs dans le noyau. Le contenu de ce port viendra avec `EXEC-02` (charger l'état
 * d'un run) et suivants, et le verrouillage de la file avec `EXEC-12`. Séparer les deux permet
 * de tester l'authentification sans base, et l'exécution sans HTTP.
 *
 * **Framework-free à dessein** : la signature est `Request → Response`, celle des standards du
 * web. Aucune ligne ici ne dépend de l'hébergeur. Le jour où l'exécution déménage vers un
 * hébergeur européen classique ([`adr/0021`](../../../../docs/adr/0021-execution-serveur-en-ue.md)),
 * seule la ligne qui monte ce gestionnaire change.
 *
 * Réalise : EXEC-01
 */

import type { Clock } from "@sentio/core";

import { HEARTBEAT_HEADER, verifyHeartbeat, type HeartbeatRejection } from "./signature.js";

export { HEARTBEAT_HEADER, signHeartbeat, verifyHeartbeat, DEFAULT_TOLERANCE_MS } from "./signature.js";
export type { HeartbeatRejection, SignatureVerdict } from "./signature.js";

/** Ce qu'un battement a fait, rendu au planificateur pour qu'un incident soit visible dans ses
 *  journaux à lui — pas seulement dans les nôtres. */
export interface HeartbeatReport {
  /** Travaux pris dans la file pendant ce battement. */
  readonly traites: number;
  /** Travaux échoués sans interrompre le battement — un run cassé n'arrête pas les autres. */
  readonly echoues: number;
  /**
   * Ce que chaque pas a produit, par motif (`travail_acheve`, `report_de_quota`, …).
   *
   * ⚠️ SANS CE COMPTE, UN REPORT RESSEMBLE À UN SUCCÈS. « Traité » ne disait que « aucune
   * exception n'a été levée » : dix runs tous reportés faute de fournisseur conforme rendaient
   * `{traites:10, echoues:0}`, un rapport rassurant et faux.
   */
  readonly motifs: Readonly<Record<string, number>>;
  /**
   * Runs qui ont consommé leur budget sans exécuter une seule action.
   *
   * ⚠️ AUCUN MOTIF NE LE DIT. Un run qui tourne dix fois sur une réponse illisible rend
   * `{pas_suivant: 9, budget_epuise: 1}` : deux motifs qui veulent dire « le travail avance ». Ils
   * ne mentent pas, des pas ont bien eu lieu — c'est le RÉSULTAT qui manque.
   */
  readonly sansAction: number;
  /**
   * Le jugement du battement — **calculé ici, jamais reconstitué par l'appelant**.
   *
   * ⚠️ C'EST UNE FRONTIÈRE, PAS UN CONFORT. Le planificateur doit LIRE ce verdict, jamais le
   * recalculer à partir des chiffres : la règle qui distingue un silence légitime d'une panne est
   * écrite une fois, en TypeScript, avec ses tests. La recopier dans un script la ferait diverger
   * au premier changement — et c'est le script qui déciderait alors si l'on alerte.
   */
  readonly verdict: "normal" | "anormal";
  /** Ce qui rend ce battement anormal. Vide quand il est normal — un chiffre sans raison n'aide pas. */
  readonly anomalies: readonly string[];
}

export interface HeartbeatDeps {
  /** Lu à chaque appel, jamais capturé au démarrage : une rotation de secret ne doit pas
   *  exiger un redéploiement. */
  readonly secret: () => string | undefined;
  readonly clock: Clock;
  /** Le travail réel. Vide jusqu'à EXEC-02 — c'est ce qui rend cet incrément livrable seul. */
  readonly executerLesTravauxDus: () => Promise<HeartbeatReport>;
  /** Journalisation d'exploitation. Par défaut, la sortie standard en JSON, comme les fonctions
   *  serveur (`supabase/functions/_shared/http.ts`). */
  readonly log?: (record: Record<string, unknown>) => void;
}

function journaliserParDefaut(record: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Un battement ne se met jamais en cache : une réponse rejouée depuis un cache
      // masquerait une exécution qui n'a pas eu lieu.
      "cache-control": "no-store",
    },
  });
}

/**
 * Construit le gestionnaire du battement.
 *
 * Les refus rendent tous le même corps et le même code, quelle que soit la cause : distinguer
 * « signature fausse » de « horodatage périmé » n'aide que celui qui cherche à en fabriquer une
 * valide. La raison réelle part dans le journal, où elle est utile — sans elle, une panne de
 * configuration ressemblerait trait pour trait à une attaque.
 */
export function createHeartbeatHandler(deps: HeartbeatDeps): (request: Request) => Promise<Response> {
  const log = deps.log ?? journaliserParDefaut;

  return async function respond(request: Request): Promise<Response> {
    // POST seulement : un battement a un effet. Sur GET, il serait déclenché par un préchargement
    // de navigateur, un scanner de liens ou un aperçu de messagerie — la même mésaventure que le
    // lien de connexion a déjà connue (`/auth/callback`, protection anti-scanner Apple Mail).
    if (request.method !== "POST") {
      log({ route: "heartbeat", status: 405, methode: request.method });
      return json({ erreur: "Méthode non autorisée." }, 405);
    }

    const verdict = await verifyHeartbeat({
      header: request.headers.get(HEARTBEAT_HEADER),
      secret: deps.secret(),
      now: deps.clock.now(),
    });

    if (!verdict.ok) {
      const raison: HeartbeatRejection = verdict.reason;
      log({ route: "heartbeat", status: 401, raison });
      return json({ erreur: "Battement refusé." }, 401);
    }

    try {
      const rapport = await deps.executerLesTravauxDus();
      log({ route: "heartbeat", status: 200, ...rapport });
      return json(rapport, 200);
    } catch (error) {
      // Un battement qui échoue ne doit pas rester muet : le planificateur est le seul témoin.
      log({ route: "heartbeat", status: 500, erreur: String(error) });
      return json({ erreur: "Battement interrompu." }, 500);
    }
  };
}
