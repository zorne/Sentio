/**
 * Les erreurs du noyau.
 *
 * Elles sont typées parce qu'une décision en dépend : la chaîne de repli du Model Gateway ne se
 * déclenche que sur un dépassement de quota ou une panne passagère, **jamais** sur une erreur
 * logique — sinon un vrai bug se cache derrière des tentatives silencieuses
 * (`docs/05-runtime-employe.md`).
 *
 * D'où la distinction, portée par le type et non par le message :
 *   • `RetryableProviderError` → on peut essayer le fournisseur suivant ;
 *   • `PermanentProviderError` → on remonte immédiatement, sans rien tenter d'autre.
 */

/** Racine des erreurs du noyau, pour distinguer nos erreurs de celles du reste du monde. */
export class CoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Un fournisseur a échoué d'une manière qui autorise à en essayer un autre. */
export abstract class RetryableProviderError extends CoreError {
  constructor(
    readonly providerKey: string,
    message: string,
  ) {
    super(message);
  }
}

/** Quota du fournisseur épuisé — sa faute à lui, pas à la requête. */
export class ProviderQuotaExceeded extends RetryableProviderError {}

/** Panne passagère : indisponibilité, délai dépassé, erreur réseau. */
export class ProviderUnavailable extends RetryableProviderError {}

/**
 * Erreur logique : requête malformée, capacité inconnue, réponse inexploitable. **Ne déclenche
 * aucun repli.** Un fournisseur de secours produirait la même erreur, et l'aurait masquée.
 */
export class PermanentProviderError extends CoreError {
  constructor(
    readonly providerKey: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Aucun fournisseur conforme n'est disponible pour cette classe de données.
 *
 * ⚠️ Ce n'est pas une panne, c'est une **règle**. Sur une requête portant de la donnée réelle, la
 * chaîne de repli ne franchit jamais la frontière de classe de données : si le fournisseur
 * conforme est épuisé, la tâche est **reportée**, jamais routée vers le secours
 * (`AGENTS.md`, invariant 5).
 */
export class TaskDeferred extends CoreError {
  constructor(
    /** Message destiné au client — soumis au lexique (`docs/17-lexique.md`). */
    readonly clientMessage: string,
    /** Raison technique, pour le journal. Jamais affichée. */
    readonly reason: string,
  ) {
    super(reason);
  }
}

/**
 * Une donnée réelle allait partir vers un fournisseur non conforme. C'est le dernier rempart de
 * l'invariant 5 : il lève plutôt que d'appeler, et il lève **avant** tout appel réseau.
 */
export class NonCompliantRouting extends CoreError {}

/** Une capacité a été demandée sans moteur disponible pour la formule de l'entreprise. */
export class CapabilityUnavailable extends CoreError {}
