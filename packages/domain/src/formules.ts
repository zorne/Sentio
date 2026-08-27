// ════════════════════════════════════════════════════════════════════════════════════════════
// LES FORMULES, DITES AU CLIENT — à partir de ce que la base contient, et de rien d'autre.
//
// ══ POURQUOI CE FICHIER N'A PAS DE PRIX ══
//
// Il n'y en a nulle part, et c'est une décision, pas un oubli. La grille précédente vivait dans
// le code (`lib/plans.ts`), annonçait 499, 1 999 et 9 999 € par mois, et vendait trente-trois
// fonctionnalités dont presque aucune n'existait — jusqu'à un engagement de disponibilité chiffré
// sur une infrastructure choisie pour coûter zéro euro (constat A3.1 de `docs/32`).
//
// Deux règles la remplacent, et elles viennent du dépôt lui-même :
//
//   · `adr/0025` : **la base fait foi**, jamais un fichier. Un prix qui vit dans le code se
//     change par un déploiement, et diverge le jour où on oublie d'en faire un ;
//   · `docs/31` §5 : **le prix vit chez le prestataire de paiement**. L'écrire ailleurs afficherait
//     un chiffre que rien ne garantit, et le jour où un tarif change, la page mentirait à celui
//     qui paie l'autre montant.
//
// Donc : tant que le paiement n'est pas branché, il n'y a **pas de prix à afficher**, et on écrit
// que c'est gratuit. C'est vrai, c'est vérifiable, et ça ne se périme pas.
//
// ══ CE QU'ON AFFICHE À LA PLACE, ET POURQUOI C'EST MIEUX ══
//
// Les **limites réelles**, lues dans `plan_quota`. Elles existent déjà, elles sont appliquées par
// le produit, et ce sont elles qui répondent à la seule question que se pose un dirigeant devant
// une grille : « qu'est-ce que j'ai le droit de faire ». Un quota affiché ici est le MÊME que
// celui qui refusera la 501ᵉ action — c'est l'invariant `LADY-AH`, déjà tenu pour l'espace.
// ════════════════════════════════════════════════════════════════════════════════════════════

/** Une limite telle que `plan_quota` la stocke. */
export interface QuotaDeFormule {
  readonly metric: string;
  readonly quotaLimit: number;
}

export interface FormuleDecrite {
  readonly tier: string;
  /** Le nom montré au client. Le `tier` reste technique et ne sort jamais. */
  readonly nom: string;
  /** À qui elle s'adresse, en une phrase. Aucune promesse de résultat. */
  readonly pourQui: string;
  /** Ce qu'elle autorise, en toutes lettres, tiré des quotas réels. */
  readonly limites: readonly string[];
  /** Vraie quand le produit accepte réellement de la vendre aujourd'hui. */
  readonly disponible: boolean;
}

/**
 * Le nom et la phrase de chaque palier.
 *
 * ⚠️ Ce sont des MOTS, pas des capacités. Ils ne décident de rien : ce qu'une formule autorise
 * est décidé par `plan_quota`, en base. Si un jour un palier disparaît de la base, il disparaît
 * de la page sans que personne ne touche à ce fichier.
 */
const MOTS: Record<string, { readonly nom: string; readonly pourQui: string }> = {
  start: {
    nom: "Premier employé",
    pourQui: "Pour une entreprise qui confie un premier travail répétitif, et veut voir ce que ça donne.",
  },
  growth: {
    nom: "Petite équipe",
    pourQui: "Pour une entreprise qui a vu ce que ça donne et veut en confier davantage.",
  },
  scale: {
    nom: "Équipe",
    pourQui: "Pour une entreprise qui confie un pan entier de son travail.",
  },
};

/**
 * La façon de dire chaque limite.
 *
 * ⚠️ `inference_tokens_*` n'est PAS traduit, et c'est délibéré. Un jeton d'inférence ne veut rien
 * dire pour un dirigeant, et l'expliquer reviendrait à lui faire visiter la salle des machines.
 * `docs/17` interdit d'ailleurs le mot. Il est appliqué, il n'est pas affiché.
 */
const DITS: Record<string, (n: number) => string> = {
  active_employees: (n) => (n === 1 ? "1 employé numérique" : `Jusqu'à ${n} employés numériques`),
  tasks_per_period: (n) => `${n.toLocaleString("fr-FR")} missions par mois`,
  outbound_messages_per_period: (n) => `${n.toLocaleString("fr-FR")} messages par mois`,
  outbound_messages_per_day: (n) =>
    `${n} messages par jour au maximum, pour protéger votre réputation d'expéditeur`,
};

/** L'ordre d'affichage : du plus parlant au plus technique. */
const ORDRE = [
  "active_employees",
  "tasks_per_period",
  "outbound_messages_per_period",
  "outbound_messages_per_day",
];

/**
 * Décrit une formule pour le client.
 *
 * Rend `null` pour un palier que ce fichier ne connaît pas : mieux vaut ne rien montrer qu'un
 * intitulé technique. Une formule ajoutée en base sans passer ici ne s'affichera pas, et c'est le
 * bon défaut — on ne vend pas quelque chose qu'on n'a pas su nommer.
 */
export function decrireLaFormule(
  tier: string,
  commercialisable: boolean,
  quotas: readonly QuotaDeFormule[],
): FormuleDecrite | null {
  const mots = MOTS[tier];
  if (mots === undefined) return null;

  const parMetrique = new Map(quotas.map((q) => [q.metric, q.quotaLimit]));
  const limites: string[] = [];
  for (const metrique of ORDRE) {
    const valeur = parMetrique.get(metrique);
    const dire = DITS[metrique];
    if (valeur !== undefined && dire !== undefined) limites.push(dire(valeur));
  }

  return { tier, nom: mots.nom, pourQui: mots.pourQui, limites, disponible: commercialisable };
}

/**
 * Ce qu'on écrit à la place d'un prix.
 *
 * ⚠️ Une seule phrase, et elle est vraie aujourd'hui. Le jour où le paiement est branché, ce
 * n'est pas cette phrase qu'il faudra changer : c'est le prestataire de paiement qui donnera le
 * montant, et cette fonction disparaîtra.
 */
export const PRIX_PENDANT_LA_BETA = "Gratuit, sans carte bancaire";
