/**
 * METIER-13 — la capacité « mettre à jour une fiche », moteur du contrat déjà publié
 * (`mettre_a_jour_une_fiche`, migration `20260729120039_adn_commercial_v1.sql`).
 *
 * Ce que consigne cette capacité — l'état de la relation, et éventuellement une note — n'est
 * jamais l'endroit où mesurer la performance du commercial : `lead.status` sert `peut_envoyer()`
 * (ne pas relancer un prospect qui a déjà répondu) et le tableau de bord du client, pas une
 * métrique de succès. Une note vide ne s'écrit pas : un événement de journal sans contenu ne
 * raconte rien à personne, et grossit `execution_event` pour rien.
 *
 * Comme `SendMessageCapability`, les effets de bord sont derrière deux ports injectés — le
 * moteur reste testable sans base. Contrairement à elle, la mise à jour d'une fiche est
 * `internal_write` (contrat, migration 0039) : rien ici n'est irréversible, donc pas de clé
 * d'idempotence à réserver avant d'agir. Elle reste néanmoins idempotente de fait — mettre deux
 * fois le même statut ne produit pas un second effet visible pour le client, seulement une ligne
 * de journal de plus, ce que `execution_event` est fait pour absorber.
 *
 * Réalise : METIER-13
 */

/** Les quatre valeurs que `lead.status` accepte (contrainte `check`, migration 0038) — un
 *  cinquième mot ici serait accepté par TypeScript mais rejeté par la base : les deux doivent
 *  rester en phase à la main tant qu'aucun schéma partagé ne les génère l'un depuis l'autre. */
export type LeadStatus = "nouveau" | "contacte" | "repondu" | "exclu";

export interface UpdateFicheInput {
  readonly tenantId: string;
  readonly leadId: string;
  readonly status: LeadStatus;
  /** Ce qu'a dit le prospect, ou ce que l'employé a observé. Une chaîne vide compte comme
   *  absente : voir la note de tête sur les événements muets. */
  readonly note?: string;
}

export interface LeadStatusStore {
  /** `false` si aucune ligne ne correspond (prospect inconnu, ou d'une autre entreprise) — la
   *  capacité ne peut pas distinguer les deux, et n'a pas à le faire (RLS s'en charge déjà). */
  updateStatus(input: {
    tenantId: string;
    leadId: string;
    status: LeadStatus;
  }): Promise<boolean>;
}

export interface FicheEventJournal {
  record(input: {
    tenantId: string;
    leadId: string;
    employeeId: string;
    status: LeadStatus;
    note: string | null;
  }): Promise<void>;
}

export type UpdateFicheResult =
  | { readonly status: "mise_a_jour"; readonly leadId: string }
  | { readonly status: "prospect_inconnu" };

export class UpdateFicheCapability {
  /** Le moteur de base, celui que la migration 0039 lie aux trois formules. */
  readonly engineKey = "base";
  readonly capabilityKey = "mettre_a_jour_une_fiche";

  constructor(
    private readonly leads: LeadStatusStore,
    private readonly journal: FicheEventJournal,
  ) {}

  async execute(
    input: UpdateFicheInput,
    context: { employeeId: string },
  ): Promise<UpdateFicheResult> {
    const updated = await this.leads.updateStatus({
      tenantId: input.tenantId,
      leadId: input.leadId,
      status: input.status,
    });
    if (!updated) return { status: "prospect_inconnu" };

    const note = input.note?.trim();
    await this.journal.record({
      tenantId: input.tenantId,
      leadId: input.leadId,
      employeeId: context.employeeId,
      status: input.status,
      note: note && note !== "" ? note : null,
    });

    return { status: "mise_a_jour", leadId: input.leadId };
  }
}
