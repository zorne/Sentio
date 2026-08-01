// ════════════════════════════════════════════════════════════════════
// Grille tarifaire officielle — source unique, réutilisée par la landing
// (#tarifs) et par /plans + /checkout. Les intitulés de fonctionnalités
// sont repris mot pour mot de la grille fournie ; seules les taglines
// "unlock" sont éditoriales (cadrer chaque palier comme une génération
// d'employé IA différente, pas juste plus de quota).
// ════════════════════════════════════════════════════════════════════

export type PlanId = "standard" | "professionnel" | "entreprise";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  unlock: string;
  highlights: string[];
  fullFeatures: string[];
  limits?: string[];
  popular?: boolean;
}

export const PLAN_ORDER: PlanId[] = ["standard", "professionnel", "entreprise"];

export const PLANS: Record<PlanId, Plan> = {
  standard: {
    id: "standard",
    name: "Standard",
    price: "499 €",
    period: "/ mois",
    tagline: "Conçu pour les petites entreprises qui intègrent leur premier employé numérique.",
    unlock:
      "Une première génération d'employé numérique : il travaille seul sur ce qui est répétitif, pendant que vous gardez la main sur le reste.",
    highlights: [
      "1 employé numérique",
      "5 000 tâches par mois",
      "Mémoire persistante",
      "Connexion jusqu'à 5 outils",
      "Tableau de bord",
      "Support par email",
    ],
    fullFeatures: [
      "1 employé numérique",
      "5 000 tâches par mois",
      "Mémoire persistante",
      "Connexion jusqu'à 5 outils",
      "Automatisations simples",
      "Tableau de bord",
      "Rapports basiques",
      "Support par email",
      "Mises à jour incluses",
    ],
    limits: [
      "Aucun apprentissage autonome",
      "Aucun workflow complexe",
      "Aucun travail collaboratif entre employés",
      "Pas d'accès aux capacités premium",
    ],
  },

  professionnel: {
    id: "professionnel",
    name: "Professionnel",
    price: "1 999 €",
    period: "/ mois",
    tagline: "Pour les entreprises qui construisent une véritable équipe d'employés numériques.",
    unlock:
      "Vos employés ne se contentent plus d'exécuter : ils réfléchissent après chaque tâche, planifient seuls et se coordonnent entre eux.",
    highlights: [
      "Jusqu'à 10 employés numériques",
      "100 000 tâches par mois",
      "Mémoire long terme",
      "Apprentissage continu",
      "Réflexion après chaque tâche",
      "Collaboration entre employés",
    ],
    fullFeatures: [
      "Jusqu'à 10 employés numériques",
      "100 000 tâches par mois",
      "Mémoire long terme",
      "Apprentissage continu",
      "Réflexion après chaque tâche (Self Reflection)",
      "Planification autonome",
      "Workflows multi-étapes",
      "Collaboration entre employés",
      "Connexion illimitée aux outils",
      "Capacités premium",
      "Priorité de calcul",
      "API complète",
      "Rapports avancés",
      "Support prioritaire",
    ],
    popular: true,
  },

  entreprise: {
    id: "entreprise",
    name: "Entreprise",
    price: "9 999 €",
    period: "/ mois",
    tagline: "Pour les entreprises qui confient des départements entiers à leur équipe numérique.",
    unlock:
      "Des équipes d'employés qui s'organisent, se supervisent et s'améliorent elles-mêmes, à l'échelle d'une organisation entière.",
    highlights: [
      "Employés numériques illimités",
      "Équipes d'employés autonomes",
      "Employé superviseur",
      "Coordination de plusieurs équipes",
      "Infrastructure dédiée",
      "Account Manager dédié",
    ],
    fullFeatures: [
      "Employés numériques illimités",
      "Tâches illimitées",
      "Mémoire organisationnelle partagée",
      "Création d'employés sur mesure",
      "Équipes d'employés autonomes",
      "Employé superviseur",
      "Coordination de plusieurs équipes",
      "Auto-amélioration contrôlée",
      "Création automatique de workflows",
      "Infrastructure dédiée",
      "Intégrations sur mesure",
      "API Enterprise",
      "SSO / SAML",
      "RBAC avancé",
      "Journal d'audit complet",
      "SLA 99,9 %",
      "Déploiement privé possible",
      "Account Manager dédié",
      "Onboarding personnalisé",
      "Support 24h/24 et 7j/7",
    ],
  },
};

export function getPlan(id: string | null | undefined): Plan | null {
  if (id && id in PLANS) return PLANS[id as PlanId];
  return null;
}
