/**
 * METIER-11 — ce que produit une désinscription vérifiée.
 *
 * La désinscription est RÉACTIVE (le prospect agit), l'exclusion est PRÉVENTIVE (le client
 * agit) — les deux se rangent dans `suppression`, et `peut_envoyer()` (migration 0038) les
 * traite à l'identique : présentes, elles bloquent tout envoi futur, sans exception ni délai.
 * « Immédiat » ne veut donc pas dire un traitement rapide : ça veut dire qu'il n'existe **aucune
 * fenêtre** entre l'écriture de la ligne et son effet, parce que la garde la relit à chaque
 * tentative d'envoi, jamais en différé.
 *
 * Ce module ne fait rien d'irréversible lui-même — il décide seulement CE QUI doit être écrit.
 * L'adaptateur d'entrée (`supabase/functions/desinscription`) vérifie que la demande est
 * légitime (un jeton signé, pas une adresse devinée) puis persiste cette intention.
 *
 * Réalise : METIER-11
 */

import type { LeadId, TenantId } from "./ids.js";

export interface DesinscriptionIntent {
  readonly tenantId: TenantId;
  readonly leadId: LeadId;
  /** Toujours une adresse email en minuscules — la colonne `suppression.pattern` est comparée
   *  ainsi par `peut_envoyer()`, et une casse qui varie créerait un faux sentiment de sécurité. */
  readonly pattern: string;
  readonly kind: "desinscription";
  readonly reason: string;
}

export class AdresseManquante extends Error {
  constructor() {
    super("Ce prospect n'a pas d'adresse : rien à désinscrire.");
    this.name = "AdresseManquante";
  }
}

/** Construit l'intention de désinscription. Lève si l'adresse est vide plutôt que d'écrire une
 *  ligne muette qu'on ne saurait jamais interpréter. */
export function desinscrire(input: {
  tenantId: TenantId;
  leadId: LeadId;
  email: string;
}): DesinscriptionIntent {
  const email = input.email.trim().toLowerCase();
  if (email === "") throw new AdresseManquante();

  return {
    tenantId: input.tenantId,
    leadId: input.leadId,
    pattern: email,
    kind: "desinscription",
    reason: "Désinscription en un clic, via le lien porté par chaque message envoyé.",
  };
}
