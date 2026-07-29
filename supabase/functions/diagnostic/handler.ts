/**
 * `POST /diagnostic` — le traitement de la première fonction serveur de Sentio.
 *
 * Le point d'entrée (`index.ts`) ne fait que brancher `respond` sur `Deno.serve`. La séparation
 * n'est pas cosmétique : elle permet de **tester le traitement sans ouvrir de port**, donc de le
 * tester réellement.
 *
 * Elle rend la **recommandation** correspondant à un profil de diagnostic : ce que Sentio propose,
 * ou pourquoi il ne propose rien. C'est l'endroit où l'on voit ce qu'un adaptateur d'entrée doit
 * être ([`adr/0021`](../../../docs/adr/0021-execution-serveur-en-ue.md), règle 2) :
 *
 *   1. il vérifie le transport (méthode, taille, format) ;
 *   2. il vérifie l'entrée avec le parseur du domaine ;
 *   3. il appelle le domaine ;
 *   4. il répond.
 *
 * **Il ne décide rien.** Aucune condition de ce fichier ne dit quel employé recommander, ni ce qui
 * est hors périmètre, ni ce qui manque : tout cela est dans `packages/domain`, testé sans
 * infrastructure et rejoué à chaque modification. Le jour où cette fonction devient une route
 * serveur d'un hébergeur européen, seul le décor ci-dessous change.
 *
 * ⚠️ **Ce que cette fonction ne fait pas encore**, et qui manque avant de l'ouvrir au public :
 *   • aucune trace en base — la session de diagnostic n'est pas enregistrée (`ACQUIS-22`) ;
 *   • aucune limitation par visiteur ni par adresse (`ACQUIS-17`) : tant qu'elle n'existe pas, le
 *     drapeau `publicDiagnosticEnabled` reste fermé, ce qui rend la fonction inerte ;
 *   • aucune justification rédigée (`ACQUIS-15`) : le moteur rend ses *faits*, pas une prose.
 * Elle n'appelle donc aucun fournisseur de modèle, et ne conserve rien.
 */

import { parseDiagnosticProfile, recommend } from "@sentio/domain";
import { DEFAULT_FEATURE_FLAGS } from "@sentio/config";

import {
  correlationId,
  envFlag,
  jsonResponse,
  log,
  preflightResponse,
  readJsonBody,
} from "../_shared/http.ts";

const ROUTE = "diagnostic";

/**
 * Textes rendus au visiteur. Sobres, sans jargon, et conformes au lexique
 * (`docs/17-lexique.md`) : un message d'erreur est un texte client comme un autre.
 */
const MESSAGES = {
  methodeRefusee: "Cette adresse n'accepte que l'envoi d'un diagnostic.",
  diagnosticFerme: "Le diagnostic n'est pas encore ouvert. Revenez très bientôt.",
  demandeInvalide: "Certaines réponses n'ont pas pu être prises en compte.",
  panne: "Nous n'avons pas pu terminer votre diagnostic. Réessayez dans un instant.",
} as const;

/**
 * Le traitement, exporté pour être **testé sans serveur** : un test construit une `Request` et lit
 * la `Response`. `Deno.serve` ci-dessous n'est plus qu'un branchement.
 */
export async function handle(request: Request): Promise<Response> {
  const correlation = correlationId(request);

  if (request.method === "OPTIONS") return preflightResponse(request);

  if (request.method !== "POST") {
    log({ route: ROUTE, correlationId: correlation, status: 405, reason: "methode" });
    return jsonResponse(request, 405, { message: MESSAGES.methodeRefusee }, correlation);
  }

  // Le diagnostic manipule une donnée réelle dès la première question : il ne s'ouvre que par une
  // décision explicite, jamais par omission (`packages/config/src/flags.ts`).
  if (!envFlag("SENTIO_PUBLIC_DIAGNOSTIC_ENABLED", DEFAULT_FEATURE_FLAGS.publicDiagnosticEnabled)) {
    log({ route: ROUTE, correlationId: correlation, status: 503, reason: "drapeau_ferme" });
    return jsonResponse(request, 503, { message: MESSAGES.diagnosticFerme }, correlation);
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    log({ route: ROUTE, correlationId: correlation, status: body.status, reason: body.reason });
    return jsonResponse(request, body.status, { message: body.message }, correlation);
  }

  const parsed = parseDiagnosticProfile(body.value);
  if (!parsed.ok) {
    log({
      route: ROUTE,
      correlationId: correlation,
      status: 422,
      reason: "profil_invalide",
      // Les noms des champs, pas leur contenu : le journal ne reçoit rien de personnel.
      rejectedFields: parsed.violations.map((violation) => violation.field),
    });
    return jsonResponse(
      request,
      422,
      { message: MESSAGES.demandeInvalide, violations: parsed.violations },
      correlation,
    );
  }

  const decision = recommend(parsed.profile);
  log({ route: ROUTE, correlationId: correlation, status: 200, outcome: decision.status });
  return jsonResponse(request, 200, decision, correlation);
}

/**
 * L'enveloppe qui ne laisse jamais fuir une panne.
 *
 * Une exception non rattrapée dans une fonction devient une réponse illisible pour le visiteur et
 * une pile d'appels dans un journal public. Ici : un message honnête dehors, le détail dedans.
 */
export async function respond(request: Request): Promise<Response> {
  const correlation = correlationId(request);
  try {
    return await handle(request);
  } catch (error) {
    // Ce qui sort : un message honnête et l'identifiant de corrélation. Ce qui reste dans le
    // journal : le détail technique — jamais l'inverse.
    log({
      route: ROUTE,
      correlationId: correlation,
      status: 500,
      reason: error instanceof Error ? error.name : "inconnu",
    });
    console.error(JSON.stringify({ route: ROUTE, correlationId: correlation, error: String(error) }));
    return jsonResponse(request, 500, { message: MESSAGES.panne }, correlation);
  }
}
