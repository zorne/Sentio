/**
 * RECRUT-02 — la confirmation de paiement, **côté serveur, jamais depuis le navigateur**.
 *
 * ══ POURQUOI CE POINT D'ENTRÉE EXISTE ══
 *
 * Un parcours d'achat se termine par une redirection : le prestataire renvoie l'acheteur vers une
 * page de succès. **Cette redirection ne prouve rien.** Elle vient du navigateur, donc de
 * quelqu'un qui peut la fabriquer, la rejouer, ou la partager. Recruter sur elle reviendrait à
 * offrir un employé à qui sait recopier une URL.
 *
 * Ce que le serveur écoute, c'est la notification **signée** du prestataire. Elle arrive de
 * serveur à serveur, elle porte une signature que seul le détenteur du secret peut produire, et
 * elle couvre le corps exact — pas seulement l'instant (`packages/domain`, `verifierLaCharge`).
 *
 * ══ TROIS REFUS AVANT LA MOINDRE ÉCRITURE ══
 *
 *   1. **méthode** — seule une notification est acceptée ; un GET ne recrute personne ;
 *   2. **taille et forme** — refusées avant lecture, comme partout ailleurs ;
 *   3. **signature** — sur l'horodatage ET le corps. Un octet de différence invalide tout.
 *
 * ══ CE QU'IL NE FAIT PAS ══
 *
 * Il ne décide de rien. Tout le recrutement — entreprise, identité, employé, configuration,
 * contexte, notification — tient dans `recruter()`, en une transaction
 * (`20260815120009_recrutement.sql`). Un recrutement à moitié fait laisserait un client qui a payé
 * et un employé incapable de travailler.
 *
 * Et il est **idempotent par construction** : un prestataire rejoue ses notifications, et
 * `recruter()` rend le recrutement déjà fait au lieu d'en créer un second.
 *
 * Réalise : RECRUT-02
 */

import { verifierLaCharge } from "@sentio/domain";

import { PostgresDeno } from "../battement/sql.ts";
import {
  MAX_REQUEST_BYTES,
  correlationId,
  jsonResponse,
  log,
} from "../_shared/http.ts";

/** L'en-tête que porte la notification signée du prestataire. */
const ENTETE_SIGNATURE = "x-sentio-signature";

interface Confirmation {
  readonly recommendation: string;
  readonly entreprise: string;
  readonly formule: string;
  readonly reference: string;
  /**
   * L'adresse de l'acheteur. Sans elle, on créerait une entreprise que **personne ne peut
   * réclamer** : l'acheteur n'a pas encore de compte au moment où il paie, et le rattachement se
   * fait à sa première connexion (`20260815120013`).
   */
  readonly email: string;
}

/** Ce qu'on accepte de lire. Fermé : un champ inconnu est refusé, jamais ignoré. */
function lireLaConfirmation(brut: unknown): Confirmation | null {
  if (typeof brut !== "object" || brut === null) return null;
  const r = brut as Record<string, unknown>;

  const attendus = ["recommendation", "entreprise", "formule", "reference", "email"];
  if (Object.keys(r).some((cle) => !attendus.includes(cle))) return null;

  for (const cle of attendus) {
    if (typeof r[cle] !== "string" || (r[cle] as string).trim() === "") return null;
  }
  return {
    recommendation: (r["recommendation"] as string).trim(),
    entreprise: (r["entreprise"] as string).trim(),
    formule: (r["formule"] as string).trim(),
    reference: (r["reference"] as string).trim(),
    email: (r["email"] as string).trim(),
  };
}

export async function handle(request: Request): Promise<Response> {
  const correlation = correlationId(request);

  // ⚠️ Aucune réponse préalable de navigateur ici, contrairement au diagnostic. Une confirmation
  // de paiement arrive de serveur à serveur : lui ouvrir le protocole des requêtes croisées
  // reviendrait à annoncer qu'un navigateur peut l'appeler — ce qui n'est vrai, et souhaitable,
  // pour aucune des deux parties.
  if (request.method !== "POST") {
    log({ route: "recrutement", correlationId: correlation, status: 405, reason: "methode" });
    return jsonResponse(request, 405, { erreur: "methode_non_autorisee" }, correlation);
  }

  // Le corps est lu UNE fois : la signature doit porter sur les octets exacts reçus, pas sur une
  // re-sérialisation qui pourrait différer d'un espace.
  const brut = await request.text();
  if (brut.length > MAX_REQUEST_BYTES) {
    log({ route: "recrutement", correlationId: correlation, status: 413, reason: "taille" });
    return jsonResponse(request, 413, { erreur: "corps_trop_grand" }, correlation);
  }

  const verdict = await verifierLaCharge({
    header: request.headers.get(ENTETE_SIGNATURE),
    secret: Deno.env.get("SENTIO_PAIEMENT_SECRET"),
    corps: brut,
    now: new Date(),
  });

  if (!verdict.ok) {
    // ⚠️ Le motif est journalisé, jamais rendu. Dire « signature invalide » plutôt que « secret
    // absent » à celui qui essaie, c'est lui apprendre où il en est.
    log({
      route: "recrutement",
      correlationId: correlation,
      status: 401,
      reason: verdict.reason,
    });
    return jsonResponse(request, 401, { erreur: "non_autorise" }, correlation);
  }

  let charge: unknown;
  try {
    charge = JSON.parse(brut);
  } catch {
    log({ route: "recrutement", correlationId: correlation, status: 400, reason: "json_invalide" });
    return jsonResponse(request, 400, { erreur: "corps_illisible" }, correlation);
  }

  const confirmation = lireLaConfirmation(charge);
  if (confirmation === null) {
    log({ route: "recrutement", correlationId: correlation, status: 422, reason: "champs" });
    return jsonResponse(request, 422, { erreur: "confirmation_invalide" }, correlation);
  }

  const url = Deno.env.get("DATABASE_URL");
  if (url === undefined || url === "") {
    log({ route: "recrutement", correlationId: correlation, status: 503, reason: "base_absente" });
    return jsonResponse(request, 503, { erreur: "indisponible" }, correlation);
  }

  const sql = PostgresDeno.ouvrir(url);
  try {
    const lignes = await sql.query<{
      tenant_id: string;
      employee_id: string;
      deja_recrute: boolean;
    }>("select * from recruter($1, $2, $3, $4, $5)", [
      confirmation.recommendation,
      confirmation.entreprise,
      confirmation.formule,
      confirmation.reference,
      confirmation.email,
    ]);

    const resultat = lignes[0];
    if (resultat === undefined) {
      log({ route: "recrutement", correlationId: correlation, status: 500, reason: "sans_resultat" });
      return jsonResponse(request, 500, { erreur: "recrutement_incomplet" }, correlation);
    }

    log({
      route: "recrutement",
      correlationId: correlation,
      status: 200,
      outcome: resultat.deja_recrute ? "deja_recrute" : "recrute",
    });
    // Le rejeu rend 200 comme le premier appel : un prestataire qui reçoit une erreur rejoue
    // encore, et rejouerait indéfiniment.
    return jsonResponse(request, 200, { recrute: true, dejaFait: resultat.deja_recrute }, correlation);
  } catch (erreur) {
    // ⚠️ Le détail va au journal, jamais au réseau : un message de base de données décrit le
    // schéma à qui le lit.
    log({
      route: "recrutement",
      correlationId: correlation,
      status: 422,
      reason: erreur instanceof Error ? erreur.name : "inconnu",
    });
    // Le détail va sur la sortie d'erreur, séparément — même forme que `desinscription`. Un
    // message de base de données décrit le schéma à qui le lit : il n'a rien à faire dans la
    // réponse réseau, mais l'exploitant en a besoin.
    console.error(
      JSON.stringify({ route: "recrutement", correlationId: correlation, error: String(erreur) }),
    );
    return jsonResponse(request, 422, { erreur: "recrutement_refuse" }, correlation);
  } finally {
    await sql.fermer();
  }
}

if (import.meta.main) {
  Deno.serve(handle);
}
