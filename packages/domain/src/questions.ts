/**
 * LADY-X — parler à son employée, sans qu'aucun chiffre ne soit inventé.
 *
 * ══ LA DÉCISION QUI COMMANDE CE FICHIER ══
 *
 * **Aucun modèle ne répond ici.** La question est rapprochée d'une liste fermée d'intentions,
 * puis la réponse est un gabarit rempli avec des comptes lus en base
 * (`travail_sur_la_periode`, `avancement_vers_l_objectif`).
 *
 * La tentation inverse est forte : brancher un modèle sur la base et le laisser raconter. Ça
 * marcherait presque toujours. Mais un modèle qui compte lui-même se trompe d'une unité une fois
 * sur cinquante — et cette fois-là, il l'affirmera avec le même aplomb que les quarante-neuf
 * autres. Un dirigeant à qui l'on annonce « 12 réponses » quand il y en a 9 ne refait pas
 * confiance aux 49 chiffres suivants. C'est l'invariant 4 du dépôt, appliqué là où il coûte le
 * plus cher : la seule surface où le client PARLE à son employée.
 *
 * ══ CE QUE ÇA COÛTE, ET QUI EST ASSUMÉ ══
 *
 * Elle ne répond qu'à ce qu'on lui a appris à répondre. Une question hors liste reçoit un refus
 * qui **dit ce qu'elle sait dire** — c'est plus utile qu'une réponse vague, et infiniment moins
 * coûteux qu'une réponse fausse.
 *
 * Réalise : LADY-X
 */

/** Ce qu'une période de travail a produit. Des comptes, jamais des taux. */
export interface TravailMesure {
  readonly missionsOuvertes: number;
  readonly missionsAgies: number;
  readonly messagesEnvoyes: number;
  readonly reponses: number;
  readonly rendezVous: number;
  readonly ventes: number;
  readonly chiffreAffaires: number;
}

/** Où en est la cible du dirigeant. Absent quand aucun objectif n'est actif. */
export interface AvancementMesure {
  readonly metrique: string;
  readonly cible: number;
  readonly realise: number;
  readonly joursEcoules: number;
  readonly horizonJours: number;
}

export type Intention =
  | "journee"
  | "prospection"
  | "reponses"
  | "ventes"
  | "objectif"
  | "role"
  | "arret";

/** Sur quelle fenêtre porte la question. Le calendrier est du ressort de l'appelant. */
export type Fenetre = "aujourdhui" | "hier" | "semaine" | "periode";

export interface Question {
  readonly intention: Intention;
  readonly fenetre: Fenetre;
}

export interface ContexteDeReponse {
  readonly prenom: string;
  readonly travail: TravailMesure;
  readonly avancement: AvancementMesure | null;
  readonly role: string | null;
  readonly arretee: boolean;
}

export type Reponse =
  | { readonly statut: "repond"; readonly phrase: string }
  | { readonly statut: "ne_sait_pas"; readonly phrase: string; readonly suggestions: readonly string[] };

/**
 * Les questions qu'elle sait traiter, telles qu'un dirigeant les poserait.
 *
 * ⚠️ Ce sont des MOTS, pas des phrases entières : personne ne tape deux fois la même question de
 * la même façon. On cherche des indices, et le plus spécifique gagne — sinon « combien de clients
 * ont répondu » tomberait sur « clients » (prospection) au lieu de « répondu ».
 */
const INDICES: readonly { readonly intention: Intention; readonly mots: readonly string[]; readonly poids: number }[] = [
  { intention: "ventes", poids: 4, mots: ["vendu", "vente", "ventes", "signe", "signes", "chiffre", "ca", "client gagne"] },
  { intention: "reponses", poids: 4, mots: ["repondu", "reponse", "reponses", "repondent", "retour", "retours"] },
  { intention: "objectif", poids: 3, mots: ["objectif", "cible", "but", "ou en est", "avancement", "atteint"] },
  { intention: "role", poids: 3, mots: ["role", "fais quoi", "occupes", "concentres", "priorite", "priorites", "sais faire"] },
  { intention: "arret", poids: 3, mots: ["arret", "arrete", "arretee", "pause", "stop", "pourquoi rien"] },
  { intention: "prospection", poids: 2, mots: ["prospect", "prospects", "prospecte", "contacte", "contactes", "entreprises", "approche", "envoye", "messages"] },
  { intention: "journee", poids: 1, mots: ["fait", "journee", "quoi de neuf", "nouvelles", "avance", "travaille", "passe"] },
];

const FENETRES: readonly { readonly fenetre: Fenetre; readonly mots: readonly string[] }[] = [
  { fenetre: "hier", mots: ["hier"] },
  { fenetre: "semaine", mots: ["semaine", "7 jours", "cette semaine", "derniers jours"] },
  { fenetre: "periode", mots: ["mois", "depuis le debut", "en tout", "total", "au total"] },
];

/** Minuscules, sans accents, sans ponctuation. Une question n'est pas une commande. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rapproche une question d'une intention connue. `null` quand rien ne correspond.
 *
 * Le poids départage : « combien de prospects ont répondu » contient deux indices, et c'est
 * « répondu » qui porte la vraie question.
 */
export function lireLaQuestion(texte: string): Question | null {
  const dit = normaliser(texte);
  if (dit === "") return null;

  let meilleure: { intention: Intention; poids: number } | null = null;
  for (const indice of INDICES) {
    if (!indice.mots.some((mot) => dit.includes(normaliser(mot)))) continue;
    if (meilleure === null || indice.poids > meilleure.poids) {
      meilleure = { intention: indice.intention, poids: indice.poids };
    }
  }
  const fenetreDite = FENETRES.find((f) =>
    f.mots.some((mot) => dit.includes(normaliser(mot))),
  )?.fenetre;

  // ⚠️ « Et hier ? » ne contient aucun mot d'intention — et c'est pourtant une vraie question,
  // posée après une autre. Une fenêtre seule vaut donc « raconte-moi ta journée » : c'est le
  // sujet par défaut quand on prend des nouvelles de quelqu'un. Sans cette règle, la relance la
  // plus naturelle d'une conversation était la seule à ne pas être comprise.
  if (meilleure === null) {
    return fenetreDite === undefined ? null : { intention: "journee", fenetre: fenetreDite };
  }

  return { intention: meilleure.intention, fenetre: fenetreDite ?? "aujourdhui" };
}

/** Ce qu'elle sait dire, dans les mots du dirigeant. Affiché quand elle ne comprend pas. */
export const CE_QU_ELLE_SAIT_DIRE: readonly string[] = [
  "Qu'est-ce que tu as fait aujourd'hui ?",
  "Combien d'entreprises as-tu approchées cette semaine ?",
  "Combien t'ont répondu ?",
  "Où en est mon objectif ?",
  "Sur quoi tu te concentres ?",
];

const MOTS_DE_LA_FENETRE: Record<Fenetre, string> = {
  aujourdhui: "aujourd'hui",
  hier: "hier",
  semaine: "cette semaine",
  periode: "depuis le début",
};

/** « 1 message » et non « 1 messages ». Le détail se remarque tout de suite. */
function pluriel(n: number, singulier: string, plurielMot: string): string {
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? plurielMot : singulier}`;
}

/**
 * Construit la réponse. **Aucun chiffre n'est calculé ici** : ils viennent tous du contexte,
 * c'est-à-dire de lignes en base. Cette fonction met en phrase, et c'est tout.
 */
export function repondre(question: Question, ctx: ContexteDeReponse): Reponse {
  const quand = MOTS_DE_LA_FENETRE[question.fenetre];
  const t = ctx.travail;

  // ⚠️ L'arrêt passe AVANT tout le reste. Répondre « 0 message envoyé » à un dirigeant qui a
  // lui-même mis son employée en pause est exact, et parfaitement trompeur.
  if (ctx.arretee && question.intention !== "role") {
    return {
      statut: "repond",
      phrase:
        `Je suis à l'arrêt : vous m'avez mise en pause. Je n'ouvre plus de mission, je n'en ` +
        `reprends aucune, et je n'envoie rien. Ce qui était préparé vous attend.`,
    };
  }

  switch (question.intention) {
    case "journee": {
      if (t.missionsAgies === 0 && t.messagesEnvoyes === 0) {
        return {
          statut: "repond",
          phrase: `Rien ${quand} : je n'ai travaillé aucune mission.`,
        };
      }
      const morceaux = [
        `J'ai travaillé ${pluriel(t.missionsAgies, "mission", "missions")}`,
        t.messagesEnvoyes > 0
          ? `envoyé ${pluriel(t.messagesEnvoyes, "message", "messages")}`
          : null,
        t.reponses > 0 ? `reçu ${pluriel(t.reponses, "réponse", "réponses")}` : null,
        t.rendezVous > 0 ? `décroché ${pluriel(t.rendezVous, "rendez-vous", "rendez-vous")}` : null,
      ].filter((m): m is string => m !== null);
      return { statut: "repond", phrase: `${morceaux.join(", ")} ${quand}.` };
    }

    case "prospection":
      return {
        statut: "repond",
        phrase:
          t.messagesEnvoyes === 0
            ? `Je n'ai approché aucune entreprise ${quand}.`
            : `J'ai approché ${pluriel(t.messagesEnvoyes, "entreprise", "entreprises")} ${quand}.`,
      };

    case "reponses":
      return {
        statut: "repond",
        phrase:
          t.reponses === 0
            ? `Personne ne m'a répondu ${quand}.`
            : `${pluriel(t.reponses, "entreprise m'a répondu", "entreprises m'ont répondu")} ${quand}.`,
      };

    case "ventes":
      return {
        statut: "repond",
        phrase:
          t.ventes === 0
            ? `Aucune vente déclarée ${quand}. Je ne compte que ce que vous déclarez vous-même.`
            : `${pluriel(t.ventes, "vente déclarée", "ventes déclarées")} ${quand}, pour ` +
              `${t.chiffreAffaires.toLocaleString("fr-FR")} €.`,
      };

    case "objectif": {
      if (ctx.avancement === null) {
        return {
          statut: "repond",
          phrase:
            "Vous ne m'avez pas encore donné d'objectif. Sans lui je ne travaille pas : je ne " +
            "saurais pas pour quoi.",
        };
      }
      const a = ctx.avancement;
      const reste = Math.max(a.horizonJours - a.joursEcoules, 0);
      return {
        statut: "repond",
        phrase:
          `${a.realise.toLocaleString("fr-FR")} sur ${a.cible.toLocaleString("fr-FR")} ` +
          `${a.metrique}, en ${pluriel(a.joursEcoules, "jour", "jours")}. ` +
          `Il vous reste ${pluriel(reste, "jour", "jours")}.`,
      };
    }

    case "role":
      return {
        statut: "repond",
        phrase:
          ctx.role === null
            ? "Ma configuration n'est pas encore établie. Je ne travaillerai pas tant qu'elle ne l'est pas."
            : `Je me concentre sur ${ctx.role}.`,
      };

    case "arret":
      return {
        statut: "repond",
        phrase: "Je ne suis pas à l'arrêt : je travaille normalement.",
      };
  }
}

/**
 * Le chemin complet : une question libre, une réponse mesurée.
 *
 * Une question incomprise ne reçoit **pas** de réponse approximative : elle reçoit la liste de ce
 * qu'elle sait dire. Deviner produirait un chiffre juste à la question d'à côté — la pire des
 * réponses fausses, parce qu'elle est vraie ailleurs.
 */
export function demander(texte: string, ctx: ContexteDeReponse): Reponse {
  const question = lireLaQuestion(texte);
  if (question === null) {
    return {
      statut: "ne_sait_pas",
      phrase: "Je ne sais pas répondre à ça. Voilà ce que je sais dire :",
      suggestions: CE_QU_ELLE_SAIT_DIRE,
    };
  }
  return repondre(question, ctx);
}
