/**
 * **Tous** les textes visibles par un visiteur vivent ici, et nulle part ailleurs.
 *
 * Ce n'est pas une préférence d'organisation : c'est la condition du contrôle automatique de
 * lexique (`CONF-08`, [`docs/17-lexique.md`](../../../../docs/17-lexique.md)). Un mot interdit
 * écrit dans un composant sous pression — « l'IA a analysé votre demande » — ne serait vu par
 * personne. Ici, il fait échouer l'intégration continue, et `verifier-frontieres.mjs` refuse tout
 * texte écrit ailleurs.
 *
 * Deux objets, et la distinction est juridique :
 *
 *   • `LIBELLES` — le lexique s'applique **strictement** ;
 *   • `LIBELLES_EXEMPTES` — les deux seules zones où la loi passe devant le lexique : les pages
 *     légales, et l'information de transparence du diagnostic
 *     ([`adr/0015`](../../../../docs/adr/0015-transparence-ai-act.md)). Le contrôle de lexique doit
 *     ignorer cet objet, et lui seul.
 *
 * ⚠️ **Aucun chiffre ici** — ni prix, ni résultat, ni délai. Un chiffre affiché sans une ligne en
 * base qui le justifie est interdit (`AGENTS.md`, invariant 4), et le prix de la formule Start
 * n'est pas tranché (D2, [`docs/15-decisions-ouvertes.md`](../../../../docs/15-decisions-ouvertes.md)).
 */

/** Zone où le lexique s'applique sans exception. */
export const LIBELLES = {
  marque: "Sentio",
  baseline: "Cabinet de recrutement d'employés numériques",
  navigation: {
    accueil: "Accueil",
    mission: "Ce que nous tenons",
    deroulement: "Comment cela se passe",
  },

  /** ACQUIS-02 — la section d'ouverture. Elle dit ce qu'on vend, sans emphase. */
  hero: {
    titre: "Un collaborateur, recruté pour un objectif.",
    sousTitre:
      "Vous décrivez ce que vous voulez atteindre. Sentio évalue votre situation et vous propose " +
      "un seul employé numérique, calibré sur elle.",
    precision: "Pas de catalogue à comparer, pas de réglages à faire.",
  },

  /**
   * ACQUIS-03 — la mission. Chaque engagement est tenu par une décision du dépôt, pas par une
   * intention (`docs/23-proposition-de-valeur.md`) : n'en ajouter aucun qui ne le soit.
   */
  mission: {
    titre: "Ce que nous nous engageons à tenir",
    intro:
      "Trois engagements, et chacun se paie en contraintes que nous nous imposons plutôt qu'en " +
      "promesses que nous vous faisons.",
    engagements: [
      {
        titre: "Un employé conseillé, jamais choisi dans une liste",
        texte:
          "La recommandation est calculée sur ce que vous décrivez, selon des règles fixes et " +
          "explicables. Si votre besoin sort de ce que nous savons faire, nous vous le disons — " +
          "au moment où vous l'exprimez, pas après.",
      },
      {
        titre: "Aucun chiffre que nous ne puissions justifier",
        texte:
          "Ce que vous verrez de vos résultats sera mesuré, et rien d'autre. Une estimation sera " +
          "annoncée comme telle. Un mois faible s'affichera tel qu'il est.",
      },
      {
        titre: "La qualité du travail plutôt que le volume",
        texte:
          "Peu d'entreprises approchées, chacune choisie et justifiable. Votre réputation " +
          "d'expéditeur met des mois à se réparer : elle passe avant le nombre de messages.",
      },
    ],
  },

  /** ACQUIS-05 — le déroulement, dans l'ordre réel du parcours (`docs/07-parcours-produit.md`). */
  deroulement: {
    titre: "Comment cela se passe",
    etapes: [
      {
        titre: "Vous décrivez votre objectif",
        texte: "En quelques échanges : votre activité, à qui vous vendez, ce qui vous bloque.",
      },
      {
        titre: "Sentio évalue votre situation",
        texte: "Le frein principal est identifié, et l'employé est calibré sur votre secteur.",
      },
      {
        titre: "Une seule recommandation, expliquée",
        texte: "Un employé, son périmètre, son premier pas — et les raisons de ce choix.",
      },
      {
        titre: "Vous le recrutez",
        texte: "Il reçoit une identité, un objectif chiffré, et le contexte de votre entreprise.",
      },
      {
        titre: "Vous suivez ses résultats",
        texte: "Tout se passe ensuite dans votre espace privé : sa progression, ce qu'il a appris.",
      },
    ],
  },

  chantier: {
    /**
     * L'état réel du produit, dit simplement. Une vitrine qui propose un parcours indisponible
     * ferait mentir la première page — et le diagnostic reste fermé tant que la limitation par
     * visiteur n'existe pas (`ACQUIS-17`).
     */
    diagnosticFerme: "Le diagnostic n'est pas encore ouvert aux visiteurs.",
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
