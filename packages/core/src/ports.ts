/**
 * Les ports du noyau — ce dont il a besoin, sans savoir qui le fournit.
 *
 * `packages/core` ne dépend ni de la base ni du réseau (`docs/02-architecture.md`). Il déclare
 * ici des interfaces ; `packages/db` et `apps/worker` les branchent. C'est ce qui permet de
 * tester le noyau entier sans Postgres — et de changer d'hébergeur sans le réécrire.
 */

import type { TenantId, TaskId, EmployeeId } from "@sentio/domain";
import type { InferenceEnvelope, UsageMetric } from "@sentio/config";

/** L'horloge, injectée : un test qui dépend de l'heure réelle est un test qui échouera un jour. */
export interface Clock {
  now(): Date;
  /** Attente utilisée pour lisser le débit. Un test la remplace par une fonction qui n'attend pas. */
  sleep(milliseconds: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Consommation et plafonds.
 *
 * Les plafonds sont **lus**, jamais écrits dans le code : ouvrir Growth doit rester une
 * modification de données (`docs/03-modele-de-donnees.md`). Une valeur nulle signifie « aucun
 * quota défini pour cette métrique », ce qui est différent de zéro.
 */
export interface UsageLedger {
  tenantUsage(tenantId: TenantId, metric: UsageMetric, on: Date): Promise<number>;
  tenantLimit(tenantId: TenantId, metric: UsageMetric): Promise<number | null>;
  recordTenantUsage(
    tenantId: TenantId,
    metric: UsageMetric,
    amount: number,
    on: Date,
  ): Promise<void>;

  /** Consommation d'une enveloppe d'inférence sur la fenêtre courante du fournisseur. */
  envelopeUsage(envelope: InferenceEnvelope): Promise<number>;
  recordEnvelopeUsage(
    envelope: InferenceEnvelope,
    providerKey: string,
    amount: number,
  ): Promise<void>;
}

/** Écriture au journal. Le journal est en ajout seul : ce port n'expose ni mise à jour ni suppression. */
export interface JournalWriter {
  append(entry: {
    tenantId: TenantId;
    taskId: TaskId | null;
    employeeId: EmployeeId | null;
    kind: string;
    payload?: unknown;
    idempotencyKey?: string | null;
    /**
     * Le pas de run auquel cet événement appartient (EXEC-07). Il relie contexte, proposition,
     * politique, engagement et résultat en une chaîne qu'on peut relire — au lieu de la deviner
     * à partir des horodatages, ce qui devient faux dès que deux pas se chevauchent.
     *
     * Nul pour ce qui n'appartient à aucun pas : routage du Gateway, effacement, purge.
     */
    stepId?: string | null;
  }): Promise<void>;
}

/**
 * La file de travaux, vue du runtime : trois gestes, et aucun autre.
 *
 * Le noyau ne sait pas que la file est une table Postgres consommée avec verrouillage par ligne
 * (`FOND-17`) ; il sait seulement qu'un travail peut être **redû plus tard**, **retiré** parce
 * qu'il est fini, ou **mis de côté** parce qu'il attend une personne.
 *
 * ⚠️ Mettre de côté n'est pas reporter, et la différence est le cœur d'EXEC-08 : un travail
 * reporté porte une échéance et repartira seul ; un travail mis de côté n'en porte aucune, et
 * c'est délibéré. Donner une échéance de repli à un run qui attend un accord le ferait repartir
 * sans que le client ait répondu — c'est-à-dire agir sans accord.
 *
 * Réalise : EXEC-08
 */
/** Un travail pris dans la file, avec ce qu'il faut pour l'exécuter et rien de plus. */
export interface TravailPris {
  readonly tenantId: TenantId;
  readonly taskId: TaskId;
  readonly employeeId: EmployeeId;
  /**
   * Nombre de fois où ce travail a été **repris après interruption** — c'est-à-dire de fois où un
   * bail a expiré sans que rien n'aboutisse. Zéro au premier passage.
   */
  readonly reprises: number;
}

export interface FileDeTravaux {
  /**
   * Prend UN travail dû, et le verrouille — de façon atomique.
   *
   * ⚠️ L'implémentation DOIT s'appuyer sur un verrouillage de ligne de la base avec saut des
   * lignes déjà verrouillées. Une lecture suivie d'une écriture ne suffit pas : entre les deux,
   * un autre exécutant prend le même travail, et deux exécutants sur la même mission consomment
   * deux fois le quota d'inférence pour un seul résultat.
   *
   * Rend `null` quand il n'y a rien à faire — le cas le plus fréquent, et pas une erreur.
   */
  prendre(input: { pris_par: string; maintenant: Date }): Promise<TravailPris | null>;

  /** Le travail redevient dû à cette date, et son verrou est rendu. */
  reporter(input: { tenantId: TenantId; taskId: TaskId; quand: Date }): Promise<void>;

  /** Le run est fini : le travail quitte la file, dans l'état constaté. */
  retirer(input: { tenantId: TenantId; taskId: TaskId; issue: "termine" | "echoue" }): Promise<void>;

  /**
   * Le run attend une personne : le travail quitte la file **sans échéance**. Il n'y reviendra
   * que par un geste humain (EXEC-11), jamais par le temps qui passe.
   */
  mettreDeCote(input: {
    tenantId: TenantId;
    taskId: TaskId;
    motif: "accord_attendu" | "attention_requise";
  }): Promise<void>;
}

/**
 * Où un métier va chercher ses sujets de mission — **le seul endroit qui connaît le métier**.
 *
 * C'est la charnière qui garde l'approvisionnement généraliste : `planifierLApprovisionnement`
 * ne sait pas ce qu'est un prospect, il manipule des couples `(nature, identifiant)`. Le métier
 * Commercial rend des sujets `lead` ; un métier futur rendra autre chose, et ni le noyau ni le
 * schéma ne changeront.
 *
 * ⚠️ L'implémentation DOIT rendre une liste **ordonnée de façon déterministe** et **déjà filtrée**
 * (rien qui soit déjà pris en charge, exclu, ou inéligible). Deux appels sur le même état rendent
 * la même liste : sans ça, deux battements ouvriraient des missions différentes et « le même
 * travail » cesserait d'être décidable.
 *
 * Réalise : EXEC-17
 */
export interface GisementDeMissions {
  /** La nature des sujets rendus (`lead`, …). Portée par le gisement, jamais par l'appelant. */
  readonly nature: string;
  sujetsEligibles(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    /** Borne haute demandée. Le gisement peut en rendre moins, jamais plus. */
    limite: number;
  }): Promise<readonly { readonly kind: string; readonly id: string }[]>;
}

/**
 * Quel gisement sert quel métier.
 *
 * Résolu par `employee_definition.profession` — la même clé que l'ADN. Un métier sans gisement
 * n'ouvre aucune mission et le **dit** ; il ne retombe pas sur celui d'un autre métier, ce qui
 * ferait travailler un employé sur des sujets qui ne le concernent pas.
 */
export interface RegistreDeGisements {
  pour(profession: string): GisementDeMissions | null;
}

/**
 * Ce que la base sait de l'approvisionnement — et que le noyau ne recalcule jamais.
 *
 * Les verdicts et les restes de quota viennent d'ici parce que la base seule peut les établir
 * sans course. Les recalculer en TypeScript tiendrait deux vérités pour un même plafond, et un
 * jour deux réponses différentes.
 */
export interface ApprovisionnementStore {
  /** Les employés à examiner aujourd'hui, avec leur métier. Ordonné, pour être rejouable. */
  employesAExaminer(): Promise<
    readonly { tenantId: TenantId; employeeId: EmployeeId; profession: string }[]
  >;

  /** Le verdict de `peut_ouvrir_une_mission()`, rendu tel quel — jamais interprété au passage. */
  verdict(tenantId: TenantId, employeeId: EmployeeId): Promise<string>;

  /** Missions encore autorisées par la formule sur la période. `null` = aucun plafond défini. */
  restantDePeriode(tenantId: TenantId): Promise<number | null>;

  /**
   * Ouvre les missions et enregistre le lot du jour, **de façon atomique**.
   *
   * Rend le nombre réellement ouvert, qui peut être inférieur au nombre demandé : un sujet déjà
   * pris en charge est refusé par l'index unique, et c'est un résultat normal, pas une erreur.
   * Rend `null` si le lot du jour existait déjà — un battement rejoué n'ouvre rien.
   */
  ouvrirLesMissions(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    jour: string;
    sujets: readonly { readonly kind: string; readonly id: string }[];
    motif: string;
  }): Promise<number | null>;

  /** Enregistre un lot vide, avec sa raison. Un jour sans travail est un fait, pas un silence. */
  enregistrerAucuneOuverture(input: {
    tenantId: TenantId;
    employeeId: EmployeeId;
    jour: string;
    motif: string;
  }): Promise<void>;
}

/**
 * Accords humains. `standing` est l'accord permanent de « confirmer une fois » : accordé une
 * fois, valable jusqu'à révocation.
 */
export interface ApprovalStore {
  /** Accord permanent en vigueur pour cette classe d'effet, révocation prise en compte. */
  hasStandingApproval(
    tenantId: TenantId,
    employeeId: EmployeeId,
    /**
     * ⚠️ La capacité **nommée**, jamais une classe d'effet. Un accord par classe signifierait
     * « cet employé peut faire toutes les actions irréversibles » — le client croirait autoriser
     * un envoi, il autoriserait le genre entier (migration `20260806120002`).
     *
     * L'implémentation doit aussi écarter les accords **révoqués** et **expirés** : ici, seul un
     * accord en vigueur maintenant vaut `true`.
     */
    capabilityKey: string,
  ): Promise<boolean>;

  /** Demande d'accord ponctuel. Renvoie l'identifiant de la demande créée. */
  requestApproval(input: {
    tenantId: TenantId;
    taskId: TaskId;
    employeeId: EmployeeId;
    effectClass: string;
    capabilityKey: string;
  }): Promise<string>;
}
