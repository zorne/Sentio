// ════════════════════════════════════════════════════════════════════
// Registre des métiers proposés à l'onboarding — un seul endroit qui
// décide, par métier : le texte du chat, les compétences affichées
// autour de l'hologramme, et si l'agent a un vrai moteur derrière lui.
//
// À ce jour, SEUL "commercial" a un agent réel (system prompt Gemini,
// outils CRM/email, exécution de mission — voir onboarding-actions.ts et
// agent-actions.ts). Les quatre autres sont annoncés sur la landing
// ("bientôt") mais n'ont aucun outil ni tenant réel : leur chat ici est
// simulé (RoleAwaitingChat), pas branché sur un vrai LLM/tenant. Le jour
// où l'un d'eux a un vrai backend, il suffit de passer `live: true` et de
// lui donner un vrai composant de chat comme OnboardingChat.
// ════════════════════════════════════════════════════════════════════

export type AgentRoleSlug = "commercial" | "support" | "comptabilite" | "marketing" | "rh";

export interface SkillDef {
  label: string;
  desc: string;
}

export interface SkillRule {
  pattern: RegExp;
  skill: string;
}

export interface AgentRole {
  slug: AgentRoleSlug;
  /** Nom court, pour les libellés d'UI ("Recruter votre agent Support"). */
  label: string;
  /** Nom affiché comme identité de l'agent lui-même ("Employé support"). */
  displayName: string;
  /** Un vrai agent (LLM + outils + tenant) existe déjà derrière ce métier. */
  live: boolean;
  /** Première question posée par le chat. */
  greeting: string;
  /** Questions suivantes du chat simulé (métiers non "live" uniquement). */
  followUps: string[];
  skills: Record<string, SkillDef>;
  defaultSkills: string[];
  rules: SkillRule[];
}

const GENERIC_SKILLS = {
  autonomy: { label: "Autonomie réglable", desc: "Vous décidez ce qu'il fait seul." },
  journal: {
    label: "Journal & validations",
    desc: "Chaque décision est tracée, rien d'irréversible sans vous.",
  },
} as const;

export const AGENT_ROLES: Record<AgentRoleSlug, AgentRole> = {
  commercial: {
    slug: "commercial",
    label: "Commercial",
    displayName: "Employé commercial",
    live: true,
    greeting:
      "Bonjour ! Je vais configurer votre premier Employé numérique. Pour commencer, quel est le nom de votre entreprise, et une adresse email de contact ?",
    followUps: [],
    skills: {
      "crm-read": { label: "Lit vos leads CRM", desc: "Ouvre vos données commerciales sans ressaisie." },
      followups: { label: "Rédige les relances", desc: "Emails de suivi personnalisés par prospect." },
      prioritize: { label: "Priorise les chauds", desc: "Classe les leads selon leur probabilité de closing." },
      ...GENERIC_SKILLS,
      "high-volume": { label: "Tient le volume", desc: "Des dizaines de prospects traités en parallèle." },
    },
    defaultSkills: ["crm-read", "autonomy", "journal"],
    rules: [
      { pattern: /(relance|email|mail|courriel|suivi)/i, skill: "followups" },
      { pattern: /(urgent|priorit|chaud|important|rapide)/i, skill: "prioritize" },
      { pattern: /(beaucoup|volume|centaine|nombreux|masse|nombreuses)/i, skill: "high-volume" },
    ],
  },

  support: {
    slug: "support",
    label: "Support",
    displayName: "Employé support",
    live: false,
    greeting:
      "Bonjour ! L'employé Support arrive très bientôt. Dites-moi quand même : quel est le nom de votre entreprise, et une adresse email de contact ?",
    followUps: ["Sur quel canal vos clients vous écrivent-ils le plus (email, chat, téléphone) ?"],
    skills: {
      "tickets-read": { label: "Lit les tickets entrants", desc: "Centralise les demandes, quel que soit le canal." },
      "brand-tone": { label: "Répond avec votre ton", desc: "Le style s'adapte à votre marque, jamais un script générique." },
      escalate: { label: "Escalade si besoin", desc: "Reconnaît ce qui doit remonter à un humain." },
      ...GENERIC_SKILLS,
      "high-volume": { label: "Tient le volume", desc: "Des dizaines de tickets traités en parallèle." },
    },
    defaultSkills: ["tickets-read", "autonomy", "journal"],
    rules: [
      { pattern: /(urgent|sensible|escalad|remont|compliqu)/i, skill: "escalate" },
      { pattern: /(marque|ton|style|voix)/i, skill: "brand-tone" },
      { pattern: /(beaucoup|volume|nombreux|masse)/i, skill: "high-volume" },
    ],
  },

  comptabilite: {
    slug: "comptabilite",
    label: "Comptabilité",
    displayName: "Employé comptabilité",
    live: false,
    greeting:
      "Bonjour ! L'employé Comptabilité arrive très bientôt. Dites-moi quand même : quel est le nom de votre entreprise, et une adresse email de contact ?",
    followUps: ["Vos factures partent-elles plutôt à des particuliers ou des entreprises ?"],
    skills: {
      "invoices-read": { label: "Lit les factures", desc: "Suit les échéances et les impayés sans tableur." },
      reminders: { label: "Relance les débiteurs", desc: "Emails de relance calibrés selon le retard." },
      reconcile: { label: "Rapproche les paiements", desc: "Détecte les écarts entre factures et règlements." },
      ...GENERIC_SKILLS,
      "high-volume": { label: "Tient le volume", desc: "Des dizaines de factures suivies en parallèle." },
    },
    defaultSkills: ["invoices-read", "autonomy", "journal"],
    rules: [
      { pattern: /(relance|impay[ée]|retard|rappel)/i, skill: "reminders" },
      { pattern: /(rapproch|paiement|virement|r[eè]glement)/i, skill: "reconcile" },
      { pattern: /(beaucoup|volume|nombreux|masse)/i, skill: "high-volume" },
    ],
  },

  marketing: {
    slug: "marketing",
    label: "Marketing",
    displayName: "Employé marketing",
    live: false,
    greeting:
      "Bonjour ! L'employé Marketing arrive très bientôt. Dites-moi quand même : quel est le nom de votre entreprise, et une adresse email de contact ?",
    followUps: ["Vous communiquez surtout par quel canal (email, réseaux sociaux, blog) ?"],
    skills: {
      "brief-read": { label: "Lit vos briefs", desc: "Comprend l'angle et la cible sans réunion." },
      drafts: { label: "Rédige les contenus", desc: "Posts, emails, variantes prêtes à relire." },
      schedule: { label: "Planifie les publications", desc: "Respecte votre calendrier éditorial." },
      ...GENERIC_SKILLS,
      "high-volume": { label: "Tient le volume", desc: "Des dizaines de contenus traités en parallèle." },
    },
    defaultSkills: ["brief-read", "autonomy", "journal"],
    rules: [
      { pattern: /(r[ée]dig|[ée]cri|post|email|contenu)/i, skill: "drafts" },
      { pattern: /(planifi|calendrier|publication|date)/i, skill: "schedule" },
      { pattern: /(beaucoup|volume|nombreux|masse)/i, skill: "high-volume" },
    ],
  },

  rh: {
    slug: "rh",
    label: "Ressources humaines",
    displayName: "Employé RH",
    live: false,
    greeting:
      "Bonjour ! L'employé RH arrive très bientôt. Dites-moi quand même : quel est le nom de votre entreprise, et une adresse email de contact ?",
    followUps: ["Vous recrutez surtout pour quel type de poste en ce moment ?"],
    skills: {
      "candidates-read": { label: "Lit les candidatures", desc: "Trie les CV selon vos critères, pas au hasard." },
      shortlist: { label: "Présélectionne les profils", desc: "Classe par pertinence pour le poste." },
      "schedule-interviews": { label: "Organise les entretiens", desc: "Propose des créneaux, relance les candidats." },
      ...GENERIC_SKILLS,
      "high-volume": { label: "Tient le volume", desc: "Des dizaines de candidatures traitées en parallèle." },
    },
    defaultSkills: ["candidates-read", "autonomy", "journal"],
    rules: [
      { pattern: /(pr[ée]s[ée]lection|crit[èe]re|pertinen|profil)/i, skill: "shortlist" },
      { pattern: /(entretien|planifi|cr[ée]neau|rendez-vous)/i, skill: "schedule-interviews" },
      { pattern: /(beaucoup|volume|nombreux|masse)/i, skill: "high-volume" },
    ],
  },
};

export function getAgentRole(slug: string | null): AgentRole {
  if (slug && slug in AGENT_ROLES) return AGENT_ROLES[slug as AgentRoleSlug];
  return AGENT_ROLES.commercial;
}

export function matchSkills(role: AgentRole, userTexts: string[]): string[] {
  const joined = userTexts.join(" \n ");
  const active = new Set<string>(role.defaultSkills);
  for (const rule of role.rules) {
    if (rule.pattern.test(joined)) active.add(rule.skill);
  }
  return Array.from(active);
}
