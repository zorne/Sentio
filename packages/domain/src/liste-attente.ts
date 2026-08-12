/**
 * ACQUIS-16 — ce qu'on fait d'un besoin que Sentio ne sait pas traiter.
 *
 * Le diagnostic sait déjà le DIRE : `recommend()` rend `hors_perimetre` avec une formulation sans
 * jargon, sans promesse et sans « bientôt disponible » (`docs/adr/0008`). Ce module ajoute ce qui
 * vient après : enregistrer le besoin, et — seulement si le visiteur le demande — de quoi le
 * prévenir un jour.
 *
 * ══ LA RÈGLE QUI DEMANDE LE PLUS DE DISCIPLINE ══
 *
 * Une adresse fournie sans demande explicite d'être prévenu n'est **pas enregistrée**. Pas
 * refusée avec une erreur — simplement écartée, et la demande passe sans elle.
 *
 * C'est contre-intuitif : l'adresse est là, le visiteur l'a tapée, la garder ne coûte rien. Mais
 * on vient de lui dire « nous ne savons pas faire cela ». Garder son adresse pour lui écrire
 * ensuite ferait de la réponse honnête un moyen de collecte, ce qui est exactement l'inverse de
 * ce qu'elle est. Le champ est là pour être prévenu de CE besoin, ou il n'a pas lieu d'être.
 *
 * ══ CE QUI EST TOUJOURS ENREGISTRÉ ══
 *
 * Le besoin, et le métier s'il a été dit. Savoir que douze visiteurs ont demandé la même chose
 * est un signal produit qui ne coûte aucune donnée personnelle — et c'est ce signal, pas la
 * liste d'adresses, qui décidera un jour d'élargir le périmètre.
 *
 * Réalise : ACQUIS-16
 */

export interface DemandeDeListeDAttente {
  /** Le besoin détecté, dans le vocabulaire de `OUT_OF_SCOPE_NEEDS`. */
  readonly besoin: string;
  readonly secteur?: string | null;
  readonly email?: string | null;
  /** Le visiteur a-t-il explicitement demandé à être prévenu ? Jamais déduit de la présence d'une adresse. */
  readonly veutEtrePrevenu: boolean;
}

export interface EntreeDeListeDAttente {
  readonly besoin: string;
  readonly secteur: string | null;
  readonly email: string | null;
  /** Daté, ou nul — jamais l'un sans l'autre, la base l'interdit aussi. */
  readonly consentiLe: Date | null;
}

export type PreparationDeListeDAttente =
  | {
      readonly statut: "a_enregistrer";
      readonly entree: EntreeDeListeDAttente;
      /** Ce qui a été volontairement laissé de côté. Rendu pour être journalisé, jamais tu. */
      readonly ecarte: readonly string[];
    }
  | { readonly statut: "refusee"; readonly raison: string };

/**
 * Contrôle d'adresse volontairement minimal : une arobase entourée de texte, sans espace.
 *
 * Vérifier plus finement rejetterait des adresses valides — les règles réelles sont bien plus
 * permissives que ce que l'on croit — et la seule vérification qui prouve qu'une adresse existe
 * est de lui écrire. Ce contrôle n'est là que pour attraper la faute de frappe évidente.
 */
function ressembleAUneAdresse(valeur: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur);
}

function texteOuNul(valeur: string | null | undefined): string | null {
  if (valeur === null || valeur === undefined) return null;
  const propre = valeur.trim();
  return propre === "" ? null : propre;
}

/**
 * Prépare l'entrée à écrire, ou dit pourquoi il n'y en a pas.
 *
 * `maintenant` est un paramètre et non `new Date()` : une fonction qui lit l'horloge ne se teste
 * pas deux fois de la même façon, et la date de consentement est précisément ce qu'il faudra
 * pouvoir produire si quelqu'un conteste.
 */
export function preparerUneEntreeDeListeDAttente(
  demande: DemandeDeListeDAttente,
  maintenant: Date,
): PreparationDeListeDAttente {
  const besoin = texteOuNul(demande.besoin);
  if (besoin === null) {
    return {
      statut: "refusee",
      raison: "Aucun besoin à enregistrer : une liste d'attente sans besoin ne veut rien dire.",
    };
  }

  const secteur = texteOuNul(demande.secteur);
  const adresse = texteOuNul(demande.email);
  const ecarte: string[] = [];

  if (!demande.veutEtrePrevenu) {
    // L'adresse est là, et on ne la garde pas. C'est le cœur de la règle.
    if (adresse !== null) {
      ecarte.push(
        "adresse fournie sans demande d'être prévenu : elle n'est pas enregistrée",
      );
    }
    return {
      statut: "a_enregistrer",
      entree: { besoin, secteur, email: null, consentiLe: null },
      ecarte,
    };
  }

  if (adresse === null) {
    return {
      statut: "refusee",
      raison:
        "Vous avez demandé à être prévenu, mais aucune adresse n'a été donnée — nous ne pourrions pas vous joindre.",
    };
  }

  if (!ressembleAUneAdresse(adresse)) {
    return {
      statut: "refusee",
      raison: `L'adresse « ${adresse} » ne semble pas valide. Corrigez-la, ou laissez-la vide et le besoin sera tout de même enregistré.`,
    };
  }

  return {
    statut: "a_enregistrer",
    entree: { besoin, secteur, email: adresse, consentiLe: maintenant },
    ecarte,
  };
}

/**
 * Ce qu'on propose au visiteur, après lui avoir dit qu'on ne savait pas faire.
 *
 * Aucune promesse de date, aucun « bientôt » : on ne sait pas si ce besoin sera couvert un jour,
 * et le dire autrement serait vendre une intention. La formulation dit exactement ce qui se
 * passera — être prévenu, ou rien.
 */
export function propositionDeListeDAttente(besoinFormule: string): string {
  return (
    `Nous ne savons pas encore prendre en charge ${besoinFormule}, et nous préférons vous le ` +
    "dire maintenant plutôt qu'après. Si vous le souhaitez, laissez-nous une adresse : nous " +
    "vous préviendrons le jour où nous saurons le faire, et nous ne nous en servirons pour rien " +
    "d'autre. Sans adresse, votre demande est tout de même comptée."
  );
}
