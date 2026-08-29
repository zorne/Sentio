/**
 * Le moteur de composition — de ce qu'on constate à ce que Lady fera.
 *
 * ══ LA RÈGLE QUI GOUVERNE CE FICHIER ══
 *
 * **Le modèle ne décide jamais. Il rédige la justification d'une décision déjà prise.**
 *
 * Cette règle était déjà écrite en base pour le choix du métier
 * (`20260729120027_recommendation.sql`) ; elle vaut désormais pour la configuration entière
 * (`docs/adr/0029`). Tout ce qui suit est donc **pur et déterministe** : mêmes constats en entrée,
 * même configuration en sortie, toujours.
 *
 * Ce n'est pas une préférence esthétique. Une configuration rédigée librement par un modèle est
 * invérifiable : on ne peut pas la tester avant de l'avoir vue tourner, on ne peut pas comparer
 * deux clients, et une régression ne se voit qu'en production. Composer à partir d'un vocabulaire
 * fermé garde chaque brique testable tout en produisant une configuration réellement propre à
 * l'entreprise — par sa combinaison, ses pondérations et son ordre.
 *
 * ══ LES TROIS ÉTAPES ══
 *
 *     relever()        profil déclaré        →  constats typés, avec leur source
 *     diagnostiquer()  constats              →  besoins pondérés, par domaine
 *     composer()       besoins + couverture  →  configuration, ou refus honnête
 */

import { CAPACITES } from "./capability.js";
import {
  type Constat,
  type Domaine,
  type Objet,
  DOMAINES,
  OBJETS,
  POIDS_DE_CONFIANCE,
  POIDS_DE_GENRE,
  ordonnerLesConstats,
} from "./audit.js";

// ─────────────────────────────────────────────────────────────────────────────
// La bibliothèque, telle qu'elle est réellement écrite aujourd'hui
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quels actes servent quel domaine. **C'est l'état réel de la bibliothèque, pas une intention.**
 *
 * Quatre domaines sont vides, et c'est ce qui rend le refus honnête possible : si le besoin le
 * plus fort tombe dans un domaine vide, Sentio le dit au lieu de vendre à côté. Les remplir est le
 * travail de l'étape 8 du plan, un domaine à la fois.
 */
export const ACTES_PAR_DOMAINE: Partial<Record<Domaine, Partial<Record<Objet, readonly string[]>>>> = {
  recherche_selection: { prospect: [CAPACITES.rechercherProspect] },
  evaluation: { prospect: [CAPACITES.qualifierProspect] },
  communication_sortante: {
    prospect: [CAPACITES.envoyerProspect, CAPACITES.relancerProspect],
  },
  donnees_fiches: { prospect: [CAPACITES.mettreAJourProspect] },
};

/**
 * Les actes que la bibliothèque sait exercer sur ce couple — vide si elle ne sait pas.
 *
 * ⚠️ Un couple absent n'est pas une lacune de ce fichier : c'est l'état réel de la bibliothèque.
 * `relancer` existe, `facture` existe, et pourtant `relancer × facture` n'est pas servi — parce
 * qu'aucun moteur ne le sert. Le déploiement échoue tout seul si on déclarait le contraire
 * (`20260729120010`, bloc `do $$`), et c'est exactement le garde-fou qu'on veut.
 */
export function actesServis(domaine: Domaine, objet: Objet): readonly string[] {
  return ACTES_PAR_DOMAINE[domaine]?.[objet] ?? [];
}

/**
 * Le rôle que Sentio annonce au dirigeant quand un domaine domine.
 *
 * ⚠️ Ce n'est PAS un métier choisi dans un catalogue : c'est l'étiquette de restitution d'une
 * composition, décidée par les constats. Deux entreprises du même secteur peuvent en recevoir
 * deux différentes — c'est le but (`docs/adr/0029`).
 */
export const ROLE_PAR_DOMAINE: Record<Domaine, string> = {
  recherche_selection: "prospection",
  evaluation: "qualification",
  communication_sortante: "prospection",
  communication_entrante: "relation_client",
  donnees_fiches: "administration_commerciale",
  documents: "administration",
  temps_echeances: "suivi",
  analyse_restitution: "pilotage",
};

/**
 * Ce qu'un acte EXIGE pour pouvoir être exercé sans danger.
 *
 * ⚠️ Ce ne sont pas des dépendances techniques, ce sont des **règles de produit**. Écrire à une
 * entreprise qu'on n'a pas qualifiée, c'est brûler la réputation du client — la garantie que
 * `peut_envoyer()` défend en base (`20260729120038`). Relancer sans trace des échanges, c'est
 * relancer au hasard.
 *
 * Le moteur ferme donc l'ensemble des capacités sur ces exigences : activer `envoyer` active
 * `qualifier`, sans qu'aucune règle de composition n'ait à y penser.
 */
export const EXIGENCES_PAR_ACTE: Record<string, readonly string[]> = {
  [CAPACITES.envoyerProspect]: [CAPACITES.qualifierProspect],
  [CAPACITES.relancerProspect]: [CAPACITES.envoyerProspect, CAPACITES.mettreAJourProspect],
};

/** Ferme un ensemble de capacités sur leurs exigences. Idempotent, donc rejouable. */
export function fermerSurLesExigences(capacites: readonly string[]): readonly string[] {
  const retenues = new Set(capacites);
  let ajout = true;
  while (ajout) {
    ajout = false;
    for (const capacite of [...retenues]) {
      for (const exigee of EXIGENCES_PAR_ACTE[capacite] ?? []) {
        if (!retenues.has(exigee)) {
          retenues.add(exigee);
          ajout = true;
        }
      }
    }
  }
  return [...retenues].sort();
}

/**
 * Ce que Lady fera en premier, par domaine. Lu par le dirigeant, jamais par le modèle.
 *
 * ⚠️⚠️ **CES PHRASES PORTENT DÉSORMAIS UN COMPORTEMENT, PAS SEULEMENT UN AFFICHAGE.**
 *
 * Elles sont écrites telles quelles dans `lady_configuration.priorites`, et le moteur de
 * priorisation (`prioriserLesTravaux`, `@sentio/core`) les relit **à l'envers** pour retrouver
 * le domaine et son rang — c'est ce rang qui décide quel travail Lady ouvre en premier
 * (`domainePourPriorite`, juste en dessous).
 *
 * Conséquence à ne pas découvrir en production : **reformuler une de ces phrases, même pour la
 * rendre plus jolie, change l'ordre de travail de Lady** chez tous les clients dont la
 * configuration active porte l'ancienne formulation — silencieusement, puisque la phrase reste
 * lisible et que l'écran continue de l'afficher correctement.
 *
 * Deux garde-fous mécaniques, plutôt qu'une consigne qu'on oublie :
 *   · `composition.test.ts` vérifie que ces huit phrases sont **distinctes et toutes réversibles**
 *     — une phrase partagée par deux domaines rendrait le rang indécidable ;
 *   · un travail dont le domaine ne se retrouve pas ne devient jamais invisible : il reçoit le
 *     poids plancher (`poidsSansPrioritePourcent`), et le vieillissement finit par le reprendre.
 *
 * Si une reformulation est vraiment voulue, elle se fait donc **en connaissance de cause** : les
 * configurations déjà publiées gardent l'ancienne phrase (elles sont immuables), et leurs travaux
 * retomberont sur le poids plancher jusqu'à ce qu'une nouvelle version soit acceptée.
 */
export const PRIORITE_PAR_DOMAINE: Record<Domaine, string> = {
  recherche_selection: "élargir le nombre d'entreprises approchées",
  evaluation: "n'engager la conversation qu'avec les entreprises qui correspondent",
  communication_sortante: "engager la conversation, puis relancer avec tact",
  communication_entrante: "reprendre les demandes entrantes laissées sans réponse",
  donnees_fiches: "tenir les fiches à jour après chaque échange",
  documents: "produire et classer les documents attendus",
  temps_echeances: "surveiller les échéances et rappeler à temps",
  analyse_restitution: "rendre compte de ce qui avance, et de ce qui bloque",
};

/**
 * Retrouve le domaine derrière une priorité écrite, ou `null` si la phrase est inconnue.
 *
 * ══ POURQUOI ON RELIT LA PHRASE PLUTÔT QUE DE PERSISTER UN SCORE ══
 *
 * `diagnostiquer()` calcule déjà un score par couple, et `composer()` en garde **l'ordre** dans
 * `priorites` — la première phrase est le besoin le plus fort. L'information de priorité est donc
 * déjà là, complète, dans un champ que seul un accord du dirigeant peut changer
 * (`accepter_la_configuration`). Y ajouter un score persisté n'aurait rien appris de plus, aurait
 * exigé une migration, et aurait ouvert un second chemin d'écriture à gouverner.
 *
 * ⚠️ Ce qu'on perd, assumé : **le rang, pas l'amplitude.** Deux besoins à 9,8 et 9,7 se lisent
 * ici comme « premier » et « second », au même écart que 9,8 et 0,2. Avec deux travaux réellement
 * ouvrables aujourd'hui (`lead`, `recherche`), la différence est nulle — et le rang est même plus
 * stable d'un cycle à l'autre. **À réexaminer quand un troisième travail existera**, pas avant :
 * c'est à ce moment que les écarts d'amplitude commenceront à vouloir dire quelque chose.
 *
 * `null` n'est pas une erreur : une configuration ancienne peut porter une phrase reformulée
 * depuis. Le travail concerné passe alors au poids plancher, jamais à zéro.
 */
export function domainePourPriorite(priorite: string): Domaine | null {
  const cherchee = priorite.trim();
  for (const domaine of DOMAINES) {
    if (PRIORITE_PAR_DOMAINE[domaine] === cherchee) return domaine;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Étape 2 — le diagnostic : des constats aux besoins
// ─────────────────────────────────────────────────────────────────────────────

export interface BesoinPriorise {
  readonly domaine: Domaine;
  /** Sur quel objet porte ce besoin. Deux besoins de même domaine sur deux objets sont distincts. */
  readonly objet: Objet;
  /** Somme pondérée des constats du domaine. Négatif = ce domaine va bien, on n'y touche pas. */
  readonly score: number;
  /** La bibliothèque sait-elle faire quelque chose ici ? Sinon, aucun renfort n'est possible. */
  readonly couvert: boolean;
  /** Les constats qui l'expliquent, dans l'ordre. C'est la matière de la justification. */
  readonly constats: readonly Constat[];
}

/**
 * Pondère les constats en besoins, domaine par domaine.
 *
 * Une **force** pèse négativement : c'est le mécanisme qui permet de ne PAS renforcer là où le
 * client le demandait, quand ce qu'il demande fonctionne déjà. Sans ça, le diagnostic ne serait
 * qu'un écho poli de la déclaration.
 */
export function diagnostiquer(constats: readonly Constat[]): readonly BesoinPriorise[] {
  const ordonnes = ordonnerLesConstats(constats);

  // Un besoin est un couple (domaine, objet). « Les relances ne suivent pas » n'appelle pas les
  // mêmes actes selon qu'il s'agit de prospects ou de factures impayées — les confondre reviendrait
  // à recoller ce que l'étape 2 avait séparé.
  const besoins = DOMAINES.flatMap((domaine) =>
    OBJETS.map((objet): BesoinPriorise => {
      const duCouple = ordonnes.filter((c) => c.domaine === domaine && c.objet === objet);
      const score = duCouple.reduce(
        (total, c) => total + POIDS_DE_GENRE[c.genre] * POIDS_DE_CONFIANCE[c.confiance],
        0,
      );
      return {
        domaine,
        objet,
        score,
        couvert: actesServis(domaine, objet).length > 0,
        constats: duCouple,
      };
    }),
  );

  // Tri par besoin décroissant, puis par nom : à score égal, l'ordre ne dépend jamais de
  // l'ordre d'arrivée des constats. C'est ce qui rend le résultat rejouable.
  return [...besoins].sort(
    (a, b) =>
      b.score - a.score || a.domaine.localeCompare(b.domaine) || a.objet.localeCompare(b.objet),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Étape 3 — la composition : des besoins à la configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfigurationProposee {
  /** Sortie du diagnostic, jamais une entrée. */
  readonly role: string;
  /** Les clés d'actes activés, triées — deux compositions identiques sont égales caractère à caractère. */
  readonly capacites: readonly string[];
  readonly priorites: readonly string[];
  /** Ce que Lady ne fera pas pour ce client, en plus des limites du noyau. */
  readonly limites: readonly string[];
  readonly autonomie: "confirm" | "confirm_once" | "auto";
  /** Les constats qui ont conduit là. Le modèle rédige à partir d'eux, jamais au-delà. */
  readonly motifs: readonly string[];
}

export type ResultatDeComposition =
  | { readonly statut: "compose"; readonly configuration: ConfigurationProposee }
  | {
      readonly statut: "hors_perimetre";
      /** Le couple où le besoin est le plus fort, et que la bibliothèque ne couvre pas. */
      readonly domaine: Domaine;
      readonly objet: Objet;
      readonly motif: string;
    }
  | { readonly statut: "aucun_besoin"; readonly motif: string };

/**
 * Les exclusions qui protègent la réputation du client. Toujours présentes, quelle que soit la
 * composition : ce sont les envois qu'on ne fait jamais, pas un réglage.
 */
const EXCLUSIONS_CONSTANTES = [
  "particuliers",
  "clients existants du client",
  "concurrents déclarés",
] as const;

/**
 * Compose la configuration à partir des besoins.
 *
 * ⚠️ **Rien n'est inventé ici.** Le moteur CHOISIT et ORDONNE des briques écrites ailleurs ; il
 * n'en rédige aucune. Si le besoin dominant tombe dans un domaine que la bibliothèque ne couvre
 * pas, il refuse — et le refus est la bonne réponse, pas un échec.
 */
export function composer(besoins: readonly BesoinPriorise[]): ResultatDeComposition {
  const reels = besoins.filter((b) => b.score > 0);

  if (reels.length === 0) {
    return {
      statut: "aucun_besoin",
      motif:
        "Aucun point de friction ne ressort de ce que nous savons de cette entreprise. Nous " +
        "préférons ne rien proposer plutôt que d'inventer un besoin.",
    };
  }

  // Le besoin le plus fort décide — y compris quand il n'est pas couvert. On ne se rabat pas sur
  // le suivant : vendre le deuxième besoin en taisant le premier serait exactement le mensonge
  // que `hors_perimetre` existe pour empêcher.
  const dominant = reels[0] as BesoinPriorise;
  if (!dominant.couvert) {
    return {
      statut: "hors_perimetre",
      domaine: dominant.domaine,
      objet: dominant.objet,
      motif:
        `Ce qui pèse le plus lourd chez vous relève de ${ROLE_PAR_DOMAINE[dominant.domaine]}, ` +
        `et ce n'est pas encore ce que Lady sait faire. Nous préférons vous le dire maintenant ` +
        `plutôt que de vous vendre autre chose.`,
    };
  }

  const retenus = reels.filter((b) => b.couvert);

  // ⚠️ L'activation est plus fine que le domaine, et c'est une règle de produit.
  //
  // Un domaine CASSÉ — un goulot ou une faiblesse — ouvre toute sa famille d'actes : c'est là que
  // le renfort est attendu. Une simple OPPORTUNITÉ n'ouvre que l'acte d'entrée : le domaine
  // fonctionne, on ne fait qu'y donner accès.
  //
  // Sans cette distinction, un client dont le problème est le ciblage recevrait des relances en
  // plus. Or il n'a pas besoin qu'on écrive davantage : il a besoin qu'on écrive moins, et mieux.
  const casse = (b: BesoinPriorise): boolean =>
    b.constats.some((c) => c.genre === "goulot" || c.genre === "faiblesse");

  const capacites = fermerSurLesExigences(
    retenus.flatMap((b) => {
      const actes = actesServis(b.domaine, b.objet);
      return casse(b) ? actes : actes.slice(0, 1);
    }),
  );
  const priorites = [...new Set(retenus.map((b) => PRIORITE_PAR_DOMAINE[b.domaine]))];

  const motifs = retenus.flatMap((b) =>
    b.constats.map((c) => `${c.domaine} sur ${c.objet} — ${c.genre} : ${c.libelle} (${c.source})`),
  );

  // Un besoin fort mais non couvert qui n'est PAS dominant se dit quand même : le dirigeant doit
  // savoir ce que Lady ne prendra pas en charge, au moment où il achète.
  for (const b of reels.filter((x) => !x.couvert)) {
    motifs.push(
      `${b.domaine} sur ${b.objet} — non couvert aujourd'hui : ` +
        `${PRIORITE_PAR_DOMAINE[b.domaine]} reste à votre charge`,
    );
  }

  return {
    statut: "compose",
    configuration: {
      role: ROLE_PAR_DOMAINE[dominant.domaine],
      capacites,
      priorites,
      limites: [...EXCLUSIONS_CONSTANTES],
      // Prudent par défaut, comme l'employé (`20260806120002`) : un client qui n'a rien réglé
      // n'a jamais consenti à ce qu'on agisse sans lui.
      autonomie: "confirm",
      motifs,
    },
  };
}
