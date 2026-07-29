/**
 * **Tous** les textes visibles par un visiteur vivent ici, et nulle part ailleurs.
 *
 * Ce n'est pas une préférence d'organisation : c'est la condition du contrôle automatique de
 * lexique (`CONF-08`, [`docs/17-lexique.md`](../../../../docs/17-lexique.md)). Un mot interdit
 * écrit dans un composant sous pression — « l'IA a analysé votre demande » — ne serait vu par
 * personne. Ici, il fait échouer l'intégration continue.
 *
 * Deux objets, et la distinction est juridique :
 *
 *   • `LIBELLES` — le lexique s'applique **strictement** ;
 *   • `LIBELLES_EXEMPTES` — les deux seules zones où la loi passe devant le lexique : les pages
 *     légales, et l'information de transparence du diagnostic
 *     ([`adr/0015`](../../../../docs/adr/0015-transparence-ai-act.md)). Le contrôle de lexique doit
 *     ignorer cet objet, et lui seul.
 */

/** Zone où le lexique s'applique sans exception. */
export const LIBELLES = {
  marque: "Sentio",
  navigation: {
    accueil: "Accueil",
    diagnostic: "Diagnostic",
  },
  accueil: {
    // Provisoire : les sections de la vitrine (Hero, Mission, tarifs) sont les tâches
    // ACQUIS-01 → ACQUIS-11. Rien ici ne promet un résultat, et aucun chiffre n'est affiché —
    // un chiffre sans ligne en base qui le justifie ne s'affiche jamais (AGENTS.md, invariant 4).
    titre: "Un collaborateur, recruté pour un objectif.",
    sousTitre:
      "Vous décrivez ce que vous voulez atteindre. Sentio évalue votre situation et vous propose " +
      "un seul employé numérique, calibré sur elle.",
    enConstruction: "Cette page est en cours d'écriture.",
  },
  pied: {
    droits: "Sentio",
  },
} as const;

/**
 * Zone exemptée de lexique — parce que la loi l'exige, et seulement là où elle l'exige.
 *
 * L'information de transparence est **obligatoire** depuis l'article 50 du règlement européen sur
 * l'IA, applicable le 2 août 2026, et elle doit être *claire* : le mot y est employé sans
 * périphrase, une phrase sobre, **avant la première question** du diagnostic.
 */
export const LIBELLES_EXEMPTES = {
  transparenceDiagnostic:
    "Ce diagnostic est conduit par un système d'intelligence artificielle. Vos réponses servent " +
    "à évaluer votre situation, et à rien d'autre.",
} as const;
