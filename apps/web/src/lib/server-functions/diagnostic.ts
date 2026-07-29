/**
 * L'unique porte par laquelle l'interface parle au diagnostic.
 *
 * Règle 2 de l'interface : **aucun composant n'accède à une donnée**. Un composant appelle
 * `demanderRecommandation`, affiche ce qu'il reçoit, et ne sait rien de plus — ni de l'adresse, ni
 * du transport, ni de la base, qu'il n'atteindra jamais
 * ([`adr/0022`](../../../../docs/adr/0022-interface-sveltekit.md)).
 *
 * Les types viennent de `@sentio/domain` : ils décrivent une décision **prise ailleurs**. L'import
 * est volontairement `import type` — rien du domaine n'est embarqué dans le navigateur, seule sa
 * forme est connue à la compilation.
 *
 * ⚠️ Aucune règle ici. Si un jour ce fichier se met à interpréter la décision — choisir un texte
 * selon le frein, recalculer une priorité — c'est qu'une règle a fui hors du domaine.
 */

import { PUBLIC_SENTIO_FUNCTIONS_URL } from "$env/static/public";

import type { DiagnosticProfile, DiagnosticRequestViolation, RecommendationDecision } from "@sentio/domain";

/** Ce que l'appel peut rendre — y compris les refus, qui font partie du contrat. */
export type ReponseDiagnostic =
  | { readonly etat: "decision"; readonly decision: RecommendationDecision }
  | {
      readonly etat: "refusee";
      readonly message: string;
      readonly violations: readonly DiagnosticRequestViolation[];
    }
  | { readonly etat: "indisponible"; readonly message: string };

/**
 * Demande la recommandation correspondant au profil recueilli.
 *
 * `fetch` est passé en paramètre : c'est celui de SvelteKit pendant un chargement de page, celui du
 * navigateur ensuite. Ne pas le figer évite d'avoir à le contourner plus tard.
 */
export async function demanderRecommandation(
  profil: Partial<DiagnosticProfile>,
  options: { readonly fetch?: typeof globalThis.fetch; readonly signal?: AbortSignal } = {},
): Promise<ReponseDiagnostic> {
  const appel = options.fetch ?? globalThis.fetch;
  const corps = JSON.stringify(profil);

  const reponse = await appel(`${PUBLIC_SENTIO_FUNCTIONS_URL}/diagnostic`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: corps,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const charge: unknown = await reponse.json().catch(() => null);

  if (reponse.ok) {
    return { etat: "decision", decision: charge as RecommendationDecision };
  }

  const message = lireMessage(charge);

  if (reponse.status === 422) {
    const violations = lireViolations(charge);
    return { etat: "refusee", message, violations };
  }

  // Tout le reste — porte fermée, panne, demande illisible — se présente de la même façon au
  // visiteur : une phrase honnête. Le détail est dans le journal du serveur, avec l'identifiant de
  // corrélation rendu dans l'en-tête `x-correlation-id`.
  return { etat: "indisponible", message };
}

function lireMessage(charge: unknown): string {
  if (typeof charge === "object" && charge !== null && "message" in charge) {
    const message = (charge as { message: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return "";
}

function lireViolations(charge: unknown): readonly DiagnosticRequestViolation[] {
  if (typeof charge !== "object" || charge === null || !("violations" in charge)) return [];
  const violations = (charge as { violations: unknown }).violations;
  if (!Array.isArray(violations)) return [];
  return violations.filter(
    (violation): violation is DiagnosticRequestViolation =>
      typeof violation === "object" &&
      violation !== null &&
      typeof (violation as { field: unknown }).field === "string" &&
      typeof (violation as { reason: unknown }).reason === "string",
  );
}
