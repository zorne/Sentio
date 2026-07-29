/**
 * NOYAU-13 à 16 — l'assemblage de contexte en trois couches.
 *
 * C'est la pièce centrale du produit (`docs/04-contextes-memoire.md`) :
 *
 *   1. **ADN** — commun au métier, immuable. Toujours en tête, jamais tronqué, jamais discuté.
 *   2. **Contexte entreprise** — profil et faits appris, propres au client, triés et **bornés**.
 *   3. **Contexte de tâche** — éphémère. Ce n'est pas une mémoire : il ne survit pas au run.
 *
 * L'ordre n'est pas une préférence. L'ADN passe en premier parce que c'est lui qui garantit qu'un
 * commercial reste un commercial : ce qui vient après le précise, jamais ne le contredit.
 */

import type { CompanyProfileEntry, LearnedFact } from "@sentio/domain";

import type { ConversationTurn } from "../conversation/turn.js";

/**
 * L'ADN, une fois lu et vérifié. `limites` n'est pas décoratif : c'est la matière du filtre
 * anti-contradiction ci-dessous.
 */
export interface EmployeeDna {
  readonly profession: string;
  readonly mission: string;
  readonly perimetre: readonly string[];
  readonly limites: readonly string[];
  readonly regles?: readonly string[];
}

export class MalformedDna extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedDna";
  }
}

/**
 * Lit un ADN stocké en base (`jsonb`) et **refuse** ce qui n'en est pas un.
 *
 * Un ADN sans périmètre ni limites produirait un employé sans frontières — exactement ce que les
 * deux contextes existent pour empêcher. Mieux vaut un run qui échoue bruyamment qu'un commercial
 * qui accepte de faire de la comptabilité parce qu'un champ manquait.
 */
export function parseDna(raw: unknown): EmployeeDna {
  if (typeof raw !== "object" || raw === null) {
    throw new MalformedDna("ADN illisible : un objet est attendu.");
  }
  const record = raw as Record<string, unknown>;
  const strings = (value: unknown, field: string): string[] => {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new MalformedDna(`ADN invalide : « ${field} » doit être une liste de textes.`);
    }
    return value as string[];
  };

  const profession = record["profession"];
  const mission = record["mission"];
  if (typeof profession !== "string" || typeof mission !== "string") {
    throw new MalformedDna("ADN invalide : « profession » et « mission » sont obligatoires.");
  }

  const perimetre = strings(record["perimetre"], "perimetre");
  const limites = strings(record["limites"], "limites");
  if (perimetre.length === 0 || limites.length === 0) {
    throw new MalformedDna(
      "ADN invalide : un employé sans périmètre ni limites n'est pas un employé, c'est une " +
        "surface d'attaque.",
    );
  }

  const regles = record["regles"] === undefined ? undefined : strings(record["regles"], "regles");
  return regles === undefined
    ? { profession, mission, perimetre, limites }
    : { profession, mission, perimetre, limites, regles };
}

/**
 * Nombre de faits appris injectés au plus.
 *
 * Ce n'est pas une règle produit, c'est un garde-fou de coût : sans bornage, le contexte — donc
 * la dépense — croîtrait sans limite avec l'ancienneté du client
 * (`docs/04-contextes-memoire.md`). La valeur se règle ; l'existence d'une borne, non.
 */
export const DEFAULT_MAX_LEARNED_FACTS = 20;

export interface TaskContext {
  readonly objective: string;
  /** Ce qui a déjà été fait dans ce run. Éphémère : vit dans le journal, jamais dans la mémoire. */
  readonly done?: readonly string[];
}

export interface AssembleInput {
  readonly dna: EmployeeDna;
  readonly profile: readonly CompanyProfileEntry[];
  readonly facts: readonly LearnedFact[];
  readonly task: TaskContext;
  readonly maxLearnedFacts?: number;
}

export interface AssembledContext {
  readonly turns: readonly ConversationTurn[];
  readonly usedFacts: readonly LearnedFact[];
  /** Écartés, avec la raison — le runtime les journalise, on doit pouvoir expliquer une absence. */
  readonly excluded: readonly { readonly factId: string; readonly reason: string }[];
}

/** Normalise pour comparer : minuscules, sans accents. Le filtre ne doit pas dépendre de la typographie. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * NOYAU-16 — le filtre anti-contradiction.
 *
 * Un fait appris qui heurte une limite de l'ADN n'est **pas** injecté. L'apprentissage peut
 * enregistrer n'importe quoi — une phrase mal comprise, une consigne glissée dans un email
 * entrant — mais il ne doit pas pouvoir élargir le périmètre du métier par la bande. C'est le
 * pendant du verrou d'écriture sur l'ADN : l'un empêche de le modifier, celui-ci empêche de le
 * contourner.
 *
 * Le filtre est **déterministe** : il compare aux limites déclarées, il ne juge pas le sens. Un
 * filtre sémantique demanderait un appel de modèle pour protéger un appel de modèle — coûteux, et
 * faillible de la même manière que ce qu'il surveille.
 */
export function contradictsDna(fact: string, dna: EmployeeDna): string | null {
  const haystack = normalize(fact);
  for (const limite of dna.limites) {
    const needle = normalize(limite);
    if (needle !== "" && haystack.includes(needle)) {
      return `heurte une limite de l'ADN : « ${limite} »`;
    }
  }
  return null;
}

export function assembleContext(input: AssembleInput): AssembledContext {
  const max = input.maxLearnedFacts ?? DEFAULT_MAX_LEARNED_FACTS;
  const excluded: { factId: string; reason: string }[] = [];

  // ── Couche 1 — l'ADN. Position non négociable : le premier tour, toujours.
  const dnaLines = [
    `Métier : ${input.dna.profession}.`,
    `Mission : ${input.dna.mission}.`,
    `Périmètre : ${input.dna.perimetre.join(" ; ")}.`,
    `Limites, jamais franchies : ${input.dna.limites.join(" ; ")}.`,
  ];
  if (input.dna.regles !== undefined && input.dna.regles.length > 0) {
    dnaLines.push(`Règles : ${input.dna.regles.join(" ; ")}.`);
  }

  // ── Couche 2 — la mémoire d'entreprise. Seul ce qui est ACTIF est injecté : une ligne retirée
  //    reste lisible pour expliquer le passé, elle ne guide plus l'action.
  const profileLines = input.profile
    .filter((entry) => entry.status === "actif")
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => `- ${entry.key} : ${JSON.stringify(entry.value)}`);

  const usable: LearnedFact[] = [];
  for (const fact of input.facts) {
    if (fact.status !== "actif") continue;
    const contradiction = contradictsDna(fact.fact, input.dna);
    if (contradiction !== null) {
      excluded.push({ factId: fact.id, reason: contradiction });
      continue;
    }
    usable.push(fact);
  }

  // Les plus utilisés d'abord, puis les plus récents : c'est le tri que sert l'index
  // `learned_fact_relevance_idx`. Le bornage vient après le tri, jamais avant.
  const ranked = usable
    .slice()
    .sort((a, b) => b.usageCount - a.usageCount || b.createdAt.getTime() - a.createdAt.getTime());

  const usedFacts = ranked.slice(0, max);
  // Les écartés viennent du classement, pas de l'ordre d'arrivée : sinon on bornerait au hasard.
  for (const fact of ranked.slice(max)) {
    excluded.push({ factId: fact.id, reason: `hors des ${max} faits les plus pertinents` });
  }

  const memoryLines: string[] = [];
  if (profileLines.length > 0) {
    memoryLines.push("Ce que vous savez de cette entreprise :", ...profileLines);
  }
  if (usedFacts.length > 0) {
    memoryLines.push(
      "Ce que vous avez appris en travaillant pour elle :",
      ...usedFacts.map((fact) => `- ${fact.fact}`),
    );
  }

  // ── Couche 3 — la tâche. Éphémère, et clairement séparée du reste.
  const taskLines = [`Objectif de ce travail : ${input.task.objective}.`];
  if (input.task.done !== undefined && input.task.done.length > 0) {
    taskLines.push("Déjà fait :", ...input.task.done.map((step) => `- ${step}`));
  }

  const turns: ConversationTurn[] = [
    { role: "system", type: "text", text: dnaLines.join("\n") },
  ];
  if (memoryLines.length > 0) {
    turns.push({ role: "system", type: "text", text: memoryLines.join("\n") });
  }
  turns.push({ role: "user", type: "text", text: taskLines.join("\n") });

  return { turns, usedFacts, excluded };
}
