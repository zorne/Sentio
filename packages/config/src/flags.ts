/**
 * Drapeaux de fonctionnalité.
 *
 * Un drapeau sert à découpler la livraison du code de son activation. Il ne sert **jamais** à
 * ouvrir une formule : Growth et Scale s'activent par une lecture de quota en base, pas par un
 * drapeau (`docs/03-modele-de-donnees.md`).
 */
export interface FeatureFlags {
  /**
   * Le fournisseur d'inférence a un opt-out d'entraînement activé, prouvé et daté.
   * Tant que c'est faux, **aucune donnée réelle ne doit y transiter** : le fournisseur est non
   * conforme. Préalable de mise en service, pas une bonne pratique.
   * → `docs/adr/0009-fournisseur-inference-ue.md`
   */
  inferenceOptOutProven: boolean;

  /**
   * Le diagnostic conversationnel de la vitrine est ouvert au public.
   * Dépend de `inferenceOptOutProven` : le diagnostic manipule de la donnée réelle dès la
   * première question.
   */
  publicDiagnosticEnabled: boolean;

  /** Le paiement est ouvert. Bloqué tant que le lot 8 (conformité) n'est pas terminé. */
  checkoutEnabled: boolean;

  /**
   * Le diagnostic peut recruter DIRECTEMENT, sans paiement.
   *
   * ⚠️ CE DRAPEAU DONNE LE PRODUIT. Ouvert, n'importe quel visiteur qui finit une conversation
   * repart avec une entreprise, une employée et un accès. Il existe pour que le fondateur puisse
   * traverser son propre parcours de bout en bout, exactement comme un client, sans passer par
   * l'achat.
   *
   * Il est fermé par défaut, et il doit le rester en ligne. Le dépôt a déjà payé la leçon :
   * `CheckoutAction` livrait un compte à qui cliquait sur « Procéder au paiement » quand la clé
   * de paiement manquait (constat B4 de `docs/32`). Une porte ouverte par omission finit toujours
   * par être trouvée.
   *
   * → `docs/33-le-parcours-gratuit.md`
   */
  recrutementSansPaiement: boolean;
}

/**
 * Valeurs par défaut : tout est fermé. Un drapeau s'ouvre par une décision explicite, jamais par
 * omission.
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  inferenceOptOutProven: false,
  publicDiagnosticEnabled: false,
  checkoutEnabled: false,
  recrutementSansPaiement: false,
};
