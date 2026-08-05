// ════════════════════════════════════════════════════════════════════
// ACQUIS-15 — la présentation de l'employé, en langage de dirigeant.
//
// recommend() (@sentio/domain) rend un `Calibration` et des `grounds` —
// des faits bruts, pas une prose lisible ("frein : trop peu d'entreprises
// approchées"). Ce module fait le pont : un second appel au modèle
// transforme ces faits en présentation — un prénom, un titre, une
// mission, ce que l'employé ferait, pourquoi il est recommandé.
//
// Contrainte produit, aussi stricte que l'exactitude des faits : le
// visiteur ne doit jamais avoir l'impression de configurer un logiciel.
// Il découvre un collaborateur. Pas de « LLM », « prompt », « workflow »
// ni de chiffre de résultat inventé (AGENTS.md, invariant 4) — le
// modèle rédige à partir de `grounds`, jamais au-delà.
//
// Le modèle peut échouer à produire une forme exploitable (JSON mal
// formé, champ vide). `presentEmployee` ne laisse jamais ça remonter
// comme une erreur : un repli honnête, construit directement depuis
// `calibration`, garantit qu'un visiteur voit toujours une présentation
// cohérente, même si elle est un peu moins vivante que celle du modèle.
//
// Réalise : ACQUIS-15
// ════════════════════════════════════════════════════════════════════

import type { Calibration, RecommendationDecision } from "@sentio/domain";

export interface EmployeePresentation {
  readonly firstName: string;
  readonly title: string;
  readonly mission: string;
  readonly whatTheyDo: readonly string[];
  readonly whyRecommended: string;
  readonly expectedOutcome: string;
}

type RecommendedDecision = Extract<RecommendationDecision, { status: "recommande" }>;

export interface PresentEmployeeDeps {
  present(input: {
    calibration: Calibration;
    grounds: readonly string[];
  }): Promise<unknown>;
}

/** Ce que chaque capacité veut dire pour un dirigeant — les mêmes intitulés que
 *  `capability.name` en base (migration `20260729120039_adn_commercial_v1.sql`), recopiés ici
 *  plutôt que lus en base : ce module n'a pas de connexion, et ces intitulés ne changent pas
 *  sans une migration qui les changerait aussi. */
const CAPABILITY_WORDING: Record<string, string> = {
  trouver_des_prospects: "repérer les entreprises à approcher",
  qualifier_un_prospect: "vérifier qu'un contact correspond vraiment à ce que vous vendez",
  envoyer_un_message: "engager la conversation avec un premier message",
  relancer_un_prospect: "revenir vers ceux restés sans réponse",
  mettre_a_jour_une_fiche: "tenir votre fiche client à jour",
};

const FALLBACK_TITLES: Record<Calibration["profession"], string> = {
  commercial: "chargé de développement commercial",
};

/** Un prénom illustratif pour la présentation — pas une identité réservée. La vraie identité,
 *  tirée du réservoir de 300+ noms (FOND-34) et jamais réutilisée, n'est assignée qu'au
 *  recrutement effectif (`docs/00-vision.md`, §9). Celui-ci ne sert qu'à rendre la présentation
 *  vivante ; il peut se répéter d'un visiteur à l'autre sans que ça n'engage rien. */
const PREVIEW_FIRST_NAMES = ["Léo", "Camille", "Nora", "Hugo", "Inès", "Adam", "Léa", "Sacha"] as const;

function pickPreviewName(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PREVIEW_FIRST_NAMES[hash % PREVIEW_FIRST_NAMES.length]!;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

/** Validation défensive de ce que le modèle a rendu — jamais fait confiance à sa forme. */
function parsePresentation(raw: unknown): EmployeePresentation | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    isNonEmptyString(r.firstName) &&
    isNonEmptyString(r.title) &&
    isNonEmptyString(r.mission) &&
    isStringArray(r.whatTheyDo) &&
    isNonEmptyString(r.whyRecommended) &&
    isNonEmptyString(r.expectedOutcome)
  ) {
    return {
      firstName: r.firstName.trim(),
      title: r.title.trim(),
      mission: r.mission.trim(),
      whatTheyDo: r.whatTheyDo.map((s) => s.trim()),
      whyRecommended: r.whyRecommended.trim(),
      expectedOutcome: r.expectedOutcome.trim(),
    };
  }
  return null;
}

/** Le repli — jamais un écran d'erreur, une présentation un peu plus sobre mais tout aussi
 *  honnête, entièrement dérivée des faits que `recommend()` a déjà établis. */
function fallbackPresentation(decision: RecommendedDecision): EmployeePresentation {
  const { calibration, grounds } = decision;
  const whatTheyDo = calibration.capabilities.map((key) => CAPABILITY_WORDING[key] ?? key);
  return {
    firstName: pickPreviewName(grounds.join("|")),
    title: FALLBACK_TITLES[calibration.profession],
    mission: calibration.priorities[0] ?? "prendre en charge une partie de votre prospection",
    whatTheyDo,
    whyRecommended: grounds.join(". "),
    expectedOutcome: `Premier pas concret : ${calibration.firstStep}.`,
  };
}

export async function presentEmployee(
  decision: RecommendedDecision,
  deps: PresentEmployeeDeps,
): Promise<EmployeePresentation> {
  try {
    const raw = await deps.present({ calibration: decision.calibration, grounds: decision.grounds });
    const parsed = parsePresentation(raw);
    if (parsed) return parsed;
  } catch {
    // Panne réseau, réponse vide : le repli prend le relais silencieusement.
  }
  return fallbackPresentation(decision);
}

export const PRESENTATION_TOOL = {
  name: "presenter_employe",
  description:
    "Présente l'employé recommandé à un dirigeant qui découvre Sentio. Chaleureux, concret, " +
    "sans jamais inventer de chiffre de résultat.",
  parameters: {
    type: "object",
    properties: {
      firstName: { type: "string", description: "Un prénom, pour que la présentation soit vivante." },
      title: {
        type: "string",
        description:
          "Un intitulé de poste naturel, jamais « agent », « IA », « bot » ni de jargon technique.",
      },
      mission: { type: "string", description: "Une phrase : ce que cet employé ferait pour cette entreprise." },
      whatTheyDo: {
        type: "array",
        items: { type: "string" },
        description: "Trois à cinq actions concrètes, en langage courant, pas des noms de fonctions.",
      },
      whyRecommended: {
        type: "string",
        description:
          "Pourquoi CE profil, en reliant explicitement ce que le dirigeant a dit pendant l'échange. " +
          "Jamais de généralité qui irait pour n'importe quelle entreprise.",
      },
      expectedOutcome: {
        type: "string",
        description:
          "Ce que ça change concrètement pour le dirigeant. JAMAIS un pourcentage, un montant en euros " +
          "ni un délai chiffré : Sentio n'a pas encore de client pour le prouver, dire un chiffre serait " +
          "mentir.",
      },
    },
    required: ["firstName", "title", "mission", "whatTheyDo", "whyRecommended", "expectedOutcome"],
  },
} as const;

export function buildPresentationPrompt(): string {
  return [
    `Tu présentes à un dirigeant l'employé numérique que Sentio recommande, à partir d'un ` +
      `calibrage déjà décidé — tu ne choisis rien, tu le racontes.`,
    `LEXIQUE IMPOSÉ : « employé numérique », « collaborateur ». Jamais « IA », « bot », ` +
      `« assistant », « agent », « automation », « GPT », « prompt », « workflow », « LLM ».`,
    `Ton : chaleureux, concret, jamais commercial ni grandiloquent. Le dirigeant doit reconnaître ` +
      `sa propre situation dans ce que tu écris, pas un texte qui irait pour n'importe qui.`,
    `INTERDIT ABSOLU : inventer un chiffre de résultat (pourcentage, montant, délai). Tu n'as que ` +
      `les faits fournis — au-delà, tu restes qualitatif.`,
    `Appelle l'outil presenter_employe une seule fois, avec tous les champs remplis.`,
  ].join("\n\n");
}
