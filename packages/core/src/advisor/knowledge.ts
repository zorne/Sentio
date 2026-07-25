// ════════════════════════════════════════════════════════════════════
// Base de connaissances SENTIA — source unique de vérité du conseiller.
//
// Choix d'architecture : des entrées TYPÉES et INDEXÉES plutôt qu'un
// prompt système géant. Deux raisons concrètes :
//
//   1. COÛT — seules les entrées pertinentes à la question partent dans
//      le prompt. Un prompt monolithique de 3 000 tokens serait payé à
//      CHAQUE message ; ici on envoie 300 à 600 tokens utiles.
//   2. MAINTENANCE — enrichir la base = ajouter un objet à ce tableau.
//      Aucun autre fichier à toucher, aucun prompt à réécrire.
//
// La récupération se fait par score de mots-clés, pas par embeddings :
// à cette échelle (quelques dizaines d'entrées) c'est plus rapide, plus
// prévisible, sans appel réseau ni base vectorielle à opérer. Le contrat
// `retrieve()` reste le même si l'on bascule un jour sur du vectoriel.
// ════════════════════════════════════════════════════════════════════

export type Topic =
  | "produit"
  | "fonctionnement"
  | "autonomie"
  | "securite"
  | "donnees"
  | "integrations"
  | "tarifs"
  | "cas-usage"
  | "support"
  | "performance";

export interface KnowledgeEntry {
  id: string;
  topic: Topic;
  /** Termes qui doivent faire remonter cette entrée. Inclure les
   *  synonymes et les formulations courantes des visiteurs. */
  keywords: string[];
  /** Rédigé comme une réponse, pas comme une fiche : le modèle doit
   *  pouvoir s'appuyer dessus sans reformuler lourdement. */
  content: string;
}

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "quoi",
    topic: "produit",
    keywords: ["sentia", "quoi", "c'est quoi", "produit", "plateforme", "présentation", "définition", "sert"],
    content:
      "SENTIA est une plateforme d'employés numériques. Chaque employé SENTIA est un agent autonome qui consulte les données de l'entreprise, arbitre, et exécute des actions métier. Il travaille seul sur ce qui est réversible et s'arrête pour demander l'accord de l'humain avant toute action irréversible.",
  },
  {
    id: "difference",
    topic: "produit",
    keywords: ["différence", "chatbot", "assistant", "concurrent", "mieux", "pourquoi", "unique", "comparaison"],
    content:
      "Un chatbot répond à des questions. Un employé SENTIA accomplit des missions : il décide de ce qu'il faut faire, agit dans les outils, et rend compte. La différence tient à trois choses : l'autonomie réglable par type d'action, la traçabilité intégrale de chaque décision, et une mémoire qui s'enrichit à chaque mission.",
  },
  {
    id: "boucle",
    topic: "fonctionnement",
    keywords: ["fonctionne", "marche", "déroulé", "étapes", "mission", "comment", "processus", "boucle"],
    content:
      "Une mission se déroule ainsi : l'employé reçoit un objectif, consulte les données nécessaires, compare les options, choisit une action, l'exécute, puis passe à la suivante jusqu'à l'accomplissement. Chaque étape est écrite dans un journal permanent, lisible en français clair dans le tableau de bord, en direct.",
  },
  {
    id: "autonomie",
    topic: "autonomie",
    keywords: ["autonomie", "validation", "accord", "contrôle", "permission", "approuver", "confiance", "irréversible"],
    content:
      "L'autonomie se règle par classe d'action, pas globalement. Lecture : automatique. Écriture réversible (notes, statuts) : automatique ou notifiée. Action irréversible (envoi d'email, modification de facture) : validation humaine requise. Trois modes existent pour les actions sensibles — demander à chaque fois, demander une seule fois puis faire confiance, ou refuser. Une confiance accordée reste révocable à tout moment.",
  },
  {
    id: "memoire",
    topic: "fonctionnement",
    keywords: ["mémoire", "apprend", "apprentissage", "souvient", "progresse", "évolue", "historique"],
    content:
      "Après chaque mission terminée, l'employé en tire des faits durables qu'il conserve : préférences d'un client, actions déjà menées, décisions prises. Il les relit au début de chaque nouvelle mission. Concrètement, il ne relance jamais deux fois le même prospect par erreur et il connaît le ton de l'entreprise après quelques semaines. Il n'y a aucun réentraînement de modèle : la progression passe par la mémoire et le contexte.",
  },
  {
    id: "tracabilite",
    topic: "securite",
    keywords: ["traçabilité", "journal", "audit", "historique", "vérifier", "preuve", "log", "trace"],
    content:
      "Chaque décision et chaque action sont inscrites dans un journal permanent qui ne peut être ni modifié ni effacé, y compris par l'employé lui-même. N'importe quelle mission peut être rejouée étape par étape, même des mois plus tard. C'est ce journal qui alimente le tableau de bord en temps réel.",
  },
  {
    id: "donnees",
    topic: "donnees",
    keywords: ["données", "rgpd", "confidentialité", "hébergement", "europe", "privé", "protection", "entraînement"],
    content:
      "Les données sont hébergées en Europe. Le cloisonnement entre clients est appliqué au niveau de la base de données elle-même, pas seulement dans le code applicatif. Règle stricte : aucune donnée réelle de client n'est transmise à un fournisseur d'IA qui pourrait l'utiliser pour son propre entraînement — cette contrainte est vérifiée par le système avant chaque appel, pas laissée à la vigilance des développeurs.",
  },
  {
    id: "cle-ia",
    topic: "securite",
    keywords: ["clé", "api", "modèle", "fournisseur", "openai", "groq", "gemini", "llm", "ia utilisée"],
    content:
      "SENTIA n'est lié à aucun fournisseur d'IA unique. Les modèles sont interchangeables derrière une couche d'abstraction interne, et le système bascule automatiquement sur un fournisseur de secours si le principal est indisponible. Chaque client peut utiliser sa propre clé, ce qui lui garantit la maîtrise de ses coûts et de la gouvernance de ses données.",
  },
  {
    id: "integrations",
    topic: "integrations",
    keywords: ["intégration", "connecter", "outils", "crm", "email", "api", "compatible", "brancher"],
    content:
      "Un employé SENTIA agit à travers des outils déclarés : lecture de prospects, mise à jour de fiches, envoi d'emails. Chaque outil précise ce qu'il fait et s'il est réversible — c'est cette déclaration qui pilote les règles de validation. Ajouter une intégration (CRM, messagerie, facturation) consiste à déclarer un nouvel outil, sans modifier le moteur.",
  },
  {
    id: "tarifs",
    topic: "tarifs",
    keywords: ["tarif", "prix", "coût", "combien", "gratuit", "abonnement", "payer", "facture", "essai"],
    content:
      "Deux offres. Essai gratuit : un employé actif, cent missions par mois, journal complet et validations incluses, sans carte bancaire. Business à 790 € par mois : employés et missions illimités, autonomie réglable par type d'action, intégrations, hébergement européen. Facturation mensuelle, résiliable à tout moment. Au-delà, une offre sur mesure existe pour les besoins de volume ou de conformité.",
  },
  {
    id: "roi",
    topic: "tarifs",
    keywords: ["rentabilité", "roi", "économie", "salarié", "poste", "vaut", "rentable", "gain"],
    content:
      "L'offre Business coûte environ quatre fois moins qu'un poste équivalent chargé, sans délai de recrutement ni contrainte d'horaires. Le tableau de bord comptabilise les missions accomplies, ce qui permet de mesurer le gain réel plutôt que de l'estimer.",
  },
  {
    id: "metiers",
    topic: "cas-usage",
    keywords: ["métier", "commercial", "support", "comptabilité", "marketing", "rh", "disponible", "catalogue"],
    content:
      "L'employé Commercial est disponible aujourd'hui : il relance les prospects et prépare les rendez-vous. Les métiers Support, Comptabilité, Marketing et Ressources humaines arrivent ensuite. Tous partagent le même moteur — même autonomie réglable, même traçabilité, même mémoire ; seul le métier change, et il s'écrit en configuration plutôt qu'en code.",
  },
  {
    id: "demarrer",
    topic: "cas-usage",
    keywords: ["démarrer", "commencer", "inscription", "essayer", "installer", "configurer", "onboarding", "recruter"],
    content:
      "Le recrutement se fait par conversation, en deux minutes environ : un assistant pose quelques questions sur l'activité, les clients types et le ton souhaité, puis configure l'employé à partir des réponses. Il n'y a ni logiciel à installer ni panneau de réglages techniques — tout se passe dans le navigateur.",
  },
  {
    id: "installation",
    topic: "performance",
    keywords: ["installer", "télécharger", "logiciel", "machine", "ordinateur", "cloud", "navigateur"],
    content:
      "Rien ne s'installe et rien ne tourne sur la machine du client. SENTIA est une application web : le calcul se fait sur les serveurs, le navigateur ne fait qu'afficher. Aucune charge, aucune installation, aucune maintenance côté client.",
  },
  {
    id: "erreur",
    topic: "support",
    keywords: ["erreur", "trompe", "faux", "problème", "panne", "fiabilité", "risque", "sûr"],
    content:
      "Deux garde-fous limitent la portée d'une erreur. D'abord, aucune action irréversible ne part sans validation humaine tant que la confiance n'a pas été explicitement accordée. Ensuite, tout est tracé : une décision discutable est visible et compréhensible immédiatement. En cas d'indisponibilité d'un fournisseur d'IA, le système bascule automatiquement sur un autre plutôt que d'échouer.",
  },
  {
    id: "support",
    topic: "support",
    keywords: ["support", "aide", "contact", "assistance", "accompagnement", "humain", "joindre"],
    content:
      "Le support se fait par email à contact@sentia.com. Les comptes Entreprise bénéficient d'un engagement de service et d'un accompagnement dédié, notamment sur les sujets de conformité.",
  },
];

/**
 * Sélectionne les entrées pertinentes pour une question.
 *
 * Score simple : correspondance de mots-clés, avec bonus pour une
 * expression exacte. Suffisant et déterministe à cette échelle — et
 * surtout, remplaçable par une recherche vectorielle sans changer la
 * signature ni le code appelant.
 */
export function retrieve(question: string, limit = 4): KnowledgeEntry[] {
  const q = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const scored = KNOWLEDGE.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      const k = kw.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (q.includes(k)) score += k.length > 5 ? 3 : 2;
    }
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Aucune correspondance : on renvoie le socle produit plutôt que rien,
  // pour que le conseiller puisse toujours répondre sur SENTIA.
  if (scored.length === 0) {
    return KNOWLEDGE.filter((e) => e.id === "quoi" || e.id === "boucle");
  }
  return scored.slice(0, limit).map((s) => s.entry);
}
