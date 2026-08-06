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
 *
 * Réalise : NOYAU-13, NOYAU-14, NOYAU-15, NOYAU-16
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
 * La connaissance sectorielle, une fois lue et vérifiée.
 *
 * Tous les champs sauf `sector` sont **facultatifs**, et c'est délibéré : un profil sectoriel est
 * un document que Sentio écrit progressivement (`docs/22-niche-et-verticalisation.md`). Un profil
 * qui ne connaît encore que le vocabulaire d'un secteur doit pouvoir servir — sans que le moteur
 * comble les rubriques manquantes.
 *
 * ⚠️ Ce contenu n'est JAMAIS dérivé des données d'un client (`docs/adr/0011`). C'est ce qui
 * permet à cette couche d'être commune sans faire fuiter une entreprise vers une autre.
 */
export interface SectorKnowledge {
  readonly sector: string;
  readonly vocabulaire?: readonly string[];
  readonly interlocuteurs?: readonly string[];
  readonly cycleAchat?: string;
  readonly objections?: readonly string[];
  readonly angles?: readonly string[];
}

export class MalformedSectorProfile extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedSectorProfile";
  }
}

/**
 * Lit un profil sectoriel stocké en base (`jsonb`) et **refuse** ce qui n'en est pas un.
 *
 * Le parallèle avec `parseDna` est voulu, la sévérité aussi : un profil mal formé qu'on lirait
 * « au mieux » injecterait dans la tête de l'employé des fragments dont personne ne saurait dire
 * d'où ils viennent. Mieux vaut un run qui échoue bruyamment.
 *
 * Ce qui est absent reste absent : aucune rubrique n'est inventée, aucune valeur par défaut n'est
 * posée. Un profil sans objections n'est pas un profil sans objection connue — c'est un profil
 * dont ce chapitre n'est pas encore écrit, et l'employé ne doit pas parler à sa place.
 */
export function parseSectorKnowledge(raw: unknown): SectorKnowledge {
  if (typeof raw !== "object" || raw === null) {
    throw new MalformedSectorProfile("Profil sectoriel illisible : un objet est attendu.");
  }
  const record = raw as Record<string, unknown>;

  const sector = record["sector"] ?? record["secteur"];
  if (typeof sector !== "string" || sector.trim() === "") {
    throw new MalformedSectorProfile(
      "Profil sectoriel invalide : le secteur est obligatoire — sans lui, on ne sait pas à qui ce savoir s'applique.",
    );
  }

  const optionalStrings = (value: unknown, field: string): string[] | undefined => {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new MalformedSectorProfile(
        `Profil sectoriel invalide : « ${field} » doit être une liste de textes.`,
      );
    }
    const nettoyes = (value as string[]).map((v) => v.trim()).filter((v) => v !== "");
    return nettoyes.length === 0 ? undefined : nettoyes;
  };

  const optionalText = (value: unknown, field: string): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") {
      throw new MalformedSectorProfile(`Profil sectoriel invalide : « ${field} » doit être un texte.`);
    }
    return value.trim() === "" ? undefined : value.trim();
  };

  // Construit champ par champ : une clé n'est POSÉE que si elle a une valeur. Poser
  // `vocabulaire: undefined` ferait croire à une rubrique vide là où il n'y a pas de rubrique.
  const connaissance: {
    sector: string;
    vocabulaire?: readonly string[];
    interlocuteurs?: readonly string[];
    cycleAchat?: string;
    objections?: readonly string[];
    angles?: readonly string[];
  } = { sector: sector.trim() };

  const vocabulaire = optionalStrings(record["vocabulaire"], "vocabulaire");
  if (vocabulaire !== undefined) connaissance.vocabulaire = vocabulaire;

  const interlocuteurs = optionalStrings(record["interlocuteurs"], "interlocuteurs");
  if (interlocuteurs !== undefined) connaissance.interlocuteurs = interlocuteurs;

  const cycleAchat = optionalText(record["cycleAchat"] ?? record["cycle_achat"], "cycleAchat");
  if (cycleAchat !== undefined) connaissance.cycleAchat = cycleAchat;

  const objections = optionalStrings(record["objections"], "objections");
  if (objections !== undefined) connaissance.objections = objections;

  const angles = optionalStrings(record["angles"], "angles");
  if (angles !== undefined) connaissance.angles = angles;

  return connaissance;
}

/** Le profil porte-t-il autre chose que son propre nom ? Un profil réduit à son secteur n'apprend
 *  rien à l'employé : la couche est alors comptée absente, plutôt qu'écrite vide. */
function hasSubstance(sector: SectorKnowledge): boolean {
  return (
    sector.vocabulaire !== undefined ||
    sector.interlocuteurs !== undefined ||
    sector.cycleAchat !== undefined ||
    sector.objections !== undefined ||
    sector.angles !== undefined
  );
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
  /** Couche 2 — la connaissance du SECTEUR, rédigée par Sentio et jamais dérivée d'un client
   *  (`docs/adr/0011`). Absente tant qu'aucun profil n'existe pour le secteur du client : dans
   *  ce cas la couche ne s'écrit pas, elle ne se remplace pas par du générique. */
  readonly sector?: SectorKnowledge;
  readonly profile: readonly CompanyProfileEntry[];
  readonly facts: readonly LearnedFact[];
  readonly task: TaskContext;
  readonly maxLearnedFacts?: number;
}

/** Les couches qui n'ont rien eu à dire. Rendues explicitement pour que le runtime les
 *  journalise : une absence qu'on ne nomme pas est indistinguable d'un oubli de branchement. */
export type MissingLayer = "secteur" | "profil_entreprise" | "faits_appris";

export interface AssembledContext {
  readonly turns: readonly ConversationTurn[];
  readonly usedFacts: readonly LearnedFact[];
  /** Écartés, avec la raison — le runtime les journalise, on doit pouvoir expliquer une absence. */
  readonly excluded: readonly { readonly factId: string; readonly reason: string }[];
  readonly missingLayers: readonly MissingLayer[];
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

  // ── Couche 2 — le SECTEUR. Après l'ADN, avant l'entreprise : elle précise le métier, elle ne
  //    le redéfinit pas, et elle s'efface devant ce que le client dit de lui-même.
  //    Rien n'est écrit si rien n'est su : pas de rubrique vide, pas de valeur générique.
  const sectorLines: string[] = [];
  if (input.sector !== undefined && hasSubstance(input.sector)) {
    sectorLines.push(`Ce que Sentio sait du secteur « ${input.sector.sector} » :`);
    if (input.sector.vocabulaire !== undefined) {
      sectorLines.push(`- Vocabulaire du métier : ${input.sector.vocabulaire.join(" ; ")}.`);
    }
    if (input.sector.interlocuteurs !== undefined) {
      sectorLines.push(`- Interlocuteurs habituels : ${input.sector.interlocuteurs.join(" ; ")}.`);
    }
    if (input.sector.cycleAchat !== undefined) {
      sectorLines.push(`- Cycle d'achat : ${input.sector.cycleAchat}.`);
    }
    if (input.sector.objections !== undefined) {
      sectorLines.push(`- Objections fréquentes : ${input.sector.objections.join(" ; ")}.`);
    }
    if (input.sector.angles !== undefined) {
      sectorLines.push(`- Angles qui fonctionnent : ${input.sector.angles.join(" ; ")}.`);
    }
    sectorLines.push(
      "Ce savoir est général au secteur, jamais tiré d'une autre entreprise. Ce que dit ce client " +
        "précisément prime toujours dessus.",
    );
  }

  // ── Couche 3 — la mémoire d'entreprise. Seul ce qui est ACTIF est injecté : une ligne retirée
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

  // ── Couche 5 — la tâche et l'état du run. Éphémère, et clairement séparée du reste : ce n'est
  //    pas une mémoire, ça ne survit pas au run.
  const taskLines = [`Objectif de ce travail : ${input.task.objective}.`];
  if (input.task.done !== undefined && input.task.done.length > 0) {
    taskLines.push("Déjà fait :", ...input.task.done.map((step) => `- ${step}`));
  }

  const missingLayers: MissingLayer[] = [];
  if (sectorLines.length === 0) missingLayers.push("secteur");
  if (profileLines.length === 0) missingLayers.push("profil_entreprise");
  if (usedFacts.length === 0) missingLayers.push("faits_appris");

  const turns: ConversationTurn[] = [
    { role: "system", type: "text", text: dnaLines.join("\n") },
  ];
  if (sectorLines.length > 0) {
    turns.push({ role: "system", type: "text", text: sectorLines.join("\n") });
  }
  if (memoryLines.length > 0) {
    turns.push({ role: "system", type: "text", text: memoryLines.join("\n") });
  }
  turns.push({ role: "user", type: "text", text: taskLines.join("\n") });

  return { turns, usedFacts, excluded, missingLayers };
}
