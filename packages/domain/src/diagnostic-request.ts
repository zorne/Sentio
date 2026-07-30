/**
 * ACQUIS-13, côté entrée — la validation d'une demande de recommandation.
 *
 * Le moteur de `recommendation.ts` est une fonction pure qui suppose ses entrées **déjà propres**.
 * Ce module est ce qui rend cette supposition vraie : il transforme un corps de requête *inconnu*
 * en `DiagnosticProfile`, ou il refuse en disant quel champ ne va pas.
 *
 * Pourquoi ici, et pas dans la fonction serveur qui reçoit la requête :
 *
 *   • **le domaine sait ce qu'un profil valide veut dire** — les freins traités, les besoins hors
 *     périmètre, ce qui peut manquer ; une validation écrite ailleurs recopierait ces listes, et
 *     trois copies divergentes valent zéro règle ;
 *   • **la validation survit au changement d'hébergement** — la fonction Deno d'aujourd'hui et la
 *     route serveur de demain appellent le même parseur, sans le réécrire
 *     ([`adr/0021`](../../docs/adr/0021-execution-serveur-en-ue.md), règle 4) ;
 *   • **elle est testable sans infrastructure**, donc réellement testée.
 *
 * ⚠️ Tout ce que tape un visiteur est une **donnée**, jamais une instruction
 * (`docs/10-securite-rgpd.md`). D'où trois refus systématiques : les champs inconnus, les textes
 * démesurés, et les caractères de contrôle — un profil ne contient pas de saut de ligne, et une
 * phrase glissée dans un champ ne doit pas pouvoir devenir une consigne en aval.
 *
 * Réalise : ACQUIS-13
 */

import { HANDLED_FRICTIONS, OUT_OF_SCOPE_NEEDS, type DiagnosticProfile } from "./recommendation.js";

/** Un champ refusé, et la raison — de quoi corriger, pas seulement savoir que c'est refusé. */
export interface DiagnosticRequestViolation {
  /** Le chemin du champ, tel qu'il est envoyé : `objective.target`, `headcount`. */
  readonly field: string;
  readonly reason: string;
}

export type DiagnosticRequestParse =
  | { readonly ok: true; readonly profile: DiagnosticProfile }
  | { readonly ok: false; readonly violations: readonly DiagnosticRequestViolation[] };

/**
 * Longueurs maximales des champs libres. Elles ne protègent pas d'une faute de frappe : elles
 * bornent ce qu'un visiteur peut faire transiter par un champ de formulaire.
 */
const MAX_LENGTHS = {
  sector: 120,
  targetCustomers: 200,
  objectiveMetric: 60,
  objectiveHorizon: 40,
} as const;

/** Une entreprise de plus d'un million de personnes n'existe pas ici : c'est une saisie erronée. */
const MAX_HEADCOUNT = 1_000_000;

/** Au-delà, l'objectif n'est plus un objectif : c'est un test ou une erreur d'unité. */
const MAX_OBJECTIVE_TARGET = 1_000_000_000;

const PROFILE_FIELDS = [
  "sector",
  "headcount",
  "friction",
  "objective",
  "targetCustomers",
  "hasProspectList",
] as const;

const OBJECTIVE_FIELDS = ["metric", "target", "horizon"] as const;

const KNOWN_FRICTIONS: readonly string[] = [
  ...Object.values(HANDLED_FRICTIONS),
  ...OUT_OF_SCOPE_NEEDS,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Les caractères de contrôle, sauts de ligne compris. Aucun n'a de raison d'être dans un profil. */
function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

/**
 * Transforme une demande inconnue en profil de diagnostic.
 *
 * **Un champ absent vaut `null`**, jamais une valeur par défaut : le moteur répond alors
 * « incomplet » et le diagnostic continue de poser ses questions, au lieu de calibrer un employé
 * sur une supposition (`recommendation.ts`, étape 2).
 *
 * Fonction pure : aucune entrée/sortie, aucune horloge, aucun hasard.
 */
export function parseDiagnosticProfile(input: unknown): DiagnosticRequestParse {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      violations: [{ field: "", reason: "le corps de la demande doit être un objet" }],
    };
  }

  const violations: DiagnosticRequestViolation[] = [];

  // Un champ inconnu n'est pas ignoré : soit l'interface s'est trompée de nom — et le silence
  // ferait passer un profil incomplet pour un profil complet — soit on essaie de faire entrer
  // autre chose. Les deux se refusent.
  for (const key of Object.keys(input)) {
    if (!(PROFILE_FIELDS as readonly string[]).includes(key)) {
      violations.push({ field: key, reason: "champ inconnu" });
    }
  }

  const sector = parseOptionalText(input["sector"], "sector", MAX_LENGTHS.sector, violations);
  const targetCustomers = parseOptionalText(
    input["targetCustomers"],
    "targetCustomers",
    MAX_LENGTHS.targetCustomers,
    violations,
  );
  const headcount = parseHeadcount(input["headcount"], violations);
  const friction = parseFriction(input["friction"], violations);
  const objective = parseObjective(input["objective"], violations);
  const hasProspectList = parseOptionalBoolean(input["hasProspectList"], violations);

  if (violations.length > 0) return { ok: false, violations };

  return {
    ok: true,
    profile: { sector, headcount, friction, objective, targetCustomers, hasProspectList },
  };
}

function parseOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
  violations: DiagnosticRequestViolation[],
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    violations.push({ field, reason: "doit être du texte" });
    return null;
  }
  if (hasControlCharacters(value)) {
    violations.push({ field, reason: "contient des caractères de contrôle" });
    return null;
  }
  if (value.length > maxLength) {
    violations.push({ field, reason: `dépasse ${maxLength} caractères` });
    return null;
  }
  const trimmed = value.trim();
  // Une chaîne vide est un champ non renseigné, pas une réponse : la traiter comme absente évite
  // un calibrage fondé sur du vide.
  return trimmed === "" ? null : trimmed;
}

function parseHeadcount(value: unknown, violations: DiagnosticRequestViolation[]): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    violations.push({ field: "headcount", reason: "doit être un nombre entier de personnes" });
    return null;
  }
  if (value < 1 || value > MAX_HEADCOUNT) {
    violations.push({ field: "headcount", reason: `doit être compris entre 1 et ${MAX_HEADCOUNT}` });
    return null;
  }
  return value;
}

function parseFriction(
  value: unknown,
  violations: DiagnosticRequestViolation[],
): DiagnosticProfile["friction"] {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !KNOWN_FRICTIONS.includes(value)) {
    // On ne renvoie pas la liste des valeurs acceptées : le frein est déterminé par l'extraction
    // de profil, pas choisi par le navigateur. Une valeur inconnue est un défaut d'appel.
    violations.push({ field: "friction", reason: "frein inconnu" });
    return null;
  }
  return value as DiagnosticProfile["friction"];
}

function parseObjective(
  value: unknown,
  violations: DiagnosticRequestViolation[],
): DiagnosticProfile["objective"] {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    violations.push({ field: "objective", reason: "doit être un objet" });
    return null;
  }

  for (const key of Object.keys(value)) {
    if (!(OBJECTIVE_FIELDS as readonly string[]).includes(key)) {
      violations.push({ field: `objective.${key}`, reason: "champ inconnu" });
    }
  }

  const before = violations.length;
  const metric = parseRequiredText(
    value["metric"],
    "objective.metric",
    MAX_LENGTHS.objectiveMetric,
    violations,
  );
  const horizon = parseRequiredText(
    value["horizon"],
    "objective.horizon",
    MAX_LENGTHS.objectiveHorizon,
    violations,
  );
  const target = parseTarget(value["target"], violations);

  // Un objectif partiel n'est pas un objectif : il ne devient pas `null` en silence, sinon le
  // moteur conclurait « incomplet » alors que le visiteur, lui, a bien répondu.
  if (violations.length > before || metric === null || horizon === null || target === null) {
    return null;
  }
  return { metric, target, horizon };
}

function parseRequiredText(
  value: unknown,
  field: string,
  maxLength: number,
  violations: DiagnosticRequestViolation[],
): string | null {
  if (value === undefined || value === null) {
    violations.push({ field, reason: "manquant" });
    return null;
  }
  const parsed = parseOptionalText(value, field, maxLength, violations);
  if (parsed === null && !violations.some((violation) => violation.field === field)) {
    violations.push({ field, reason: "manquant" });
  }
  return parsed;
}

function parseTarget(value: unknown, violations: DiagnosticRequestViolation[]): number | null {
  const field = "objective.target";
  if (value === undefined || value === null) {
    violations.push({ field, reason: "manquant" });
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    violations.push({ field, reason: "doit être un nombre" });
    return null;
  }
  if (value <= 0 || value > MAX_OBJECTIVE_TARGET) {
    violations.push({ field, reason: `doit être compris entre 1 et ${MAX_OBJECTIVE_TARGET}` });
    return null;
  }
  return value;
}

function parseOptionalBoolean(
  value: unknown,
  violations: DiagnosticRequestViolation[],
): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    violations.push({ field: "hasProspectList", reason: "doit être vrai ou faux" });
    return null;
  }
  return value;
}
