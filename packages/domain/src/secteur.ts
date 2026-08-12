/**
 * ACQUIS-23 / ACQUIS-24 — rapprocher ce que le client dit de son métier d'un profil sectoriel
 * réellement publié.
 *
 * ══ LA SEULE DÉCISION QUI COMPTE ICI : NE PAS APPROCHER ══
 *
 * La tentation est d'accepter « à peu près ». Un client dit « boulangerie-pâtisserie », Sentio
 * connaît « restauration », et il serait facile de rapprocher les deux — le résultat aurait
 * l'air de marcher. Il ne marcherait pas : le profil sectoriel entre dans le contexte de
 * l'employé comme un savoir affirmé (`docs/04-contextes-memoire.md`), et un savoir affirmé sur
 * le mauvais métier est pire que pas de savoir du tout. L'employé parlerait avec assurance d'un
 * cycle d'achat, d'interlocuteurs et d'objections qui ne sont pas ceux de son client.
 *
 * Le rapprochement est donc **exact**, à la typographie près : accents, majuscules, tirets et
 * ponctuation sont neutralisés, rien d'autre. Aucune distance d'édition, aucune racine commune,
 * aucun « contient ». Ce qui n'est pas reconnu est **dit**, pas deviné.
 *
 * ══ POURQUOI DANS `domain` ET PAS DANS `core` ══
 *
 * Parce que la fonction serveur du diagnostic en a besoin, et qu'une fonction ne peut importer
 * que le domaine (`scripts/verifier-frontieres.mjs`, règle 1). Le module ne dépend donc que de
 * la forme minimale d'un profil — son nom et ses alias — et jamais du type complet, qui vit dans
 * `core` avec la lecture du contenu.
 *
 * Réalise : ACQUIS-23, ACQUIS-24
 */

/** Ce qu'il faut savoir d'un profil publié pour décider s'il correspond. Rien de plus. */
export interface ProfilSectorielDisponible {
  readonly sector: string;
  /**
   * Autres façons de nommer le même métier. Déclarées dans le profil, jamais devinées ici :
   * décider qu'un mot en désigne un autre est un choix éditorial, et il se relit dans le profil.
   */
  readonly alias?: readonly string[];
}

export type SelectionDeProfilSectoriel =
  | { readonly statut: "retenu"; readonly sector: string }
  | { readonly statut: "secteur_non_dit"; readonly message: string }
  | { readonly statut: "secteur_inconnu"; readonly declare: string; readonly message: string }
  | {
      readonly statut: "profils_ambigus";
      readonly declare: string;
      readonly candidats: readonly string[];
      readonly message: string;
    };

/**
 * Neutralise ce qui n'est que de la typographie : casse, accents, tirets, ponctuation, espaces
 * multiples. Ne touche à rien d'autre — surtout pas au pluriel ni à la racine des mots, qui
 * distinguent des métiers réels (« menuiserie » n'est pas « menuisier », et un profil qui vaut
 * pour l'un ne vaut pas forcément pour l'autre).
 */
export function normaliserUnSecteur(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MESSAGE_NON_DIT =
  "Vous ne nous avez pas encore dit dans quel métier vous travaillez. Votre commercial " +
  "s'appuiera uniquement sur ce que vous lui direz de votre entreprise.";

function messageInconnu(declare: string): string {
  return (
    `Nous ne connaissons pas encore le métier « ${declare} ». Votre commercial travaillera ` +
    "quand même : il s'appuiera sur ce que vous lui direz de votre entreprise, et sur rien " +
    "d'autre. Nous préférons vous le dire plutôt que de lui prêter un savoir qu'il n'a pas."
  );
}

/**
 * Le profil sectoriel à appliquer, ou la raison honnête pour laquelle il n'y en a pas.
 *
 * `profils_ambigus` n'est pas un cas limite qu'on arbitrerait en prenant le premier : deux
 * profils publiés qui répondent au même nom sont une erreur de publication, et la résoudre en
 * silence la rendrait permanente. Elle est rendue à l'appelant, avec les deux noms.
 */
export function selectionnerUnProfilSectoriel(
  declare: string | null | undefined,
  disponibles: readonly ProfilSectorielDisponible[],
): SelectionDeProfilSectoriel {
  if (declare === null || declare === undefined || declare.trim() === "") {
    return { statut: "secteur_non_dit", message: MESSAGE_NON_DIT };
  }

  const recherche = normaliserUnSecteur(declare);
  if (recherche === "") {
    // Une déclaration faite uniquement de ponctuation ne dit rien de plus qu'une absence.
    return { statut: "secteur_non_dit", message: MESSAGE_NON_DIT };
  }

  const candidats = disponibles.filter((profil) => {
    if (normaliserUnSecteur(profil.sector) === recherche) return true;
    return (profil.alias ?? []).some((alias) => normaliserUnSecteur(alias) === recherche);
  });

  const premier = candidats[0];
  if (premier === undefined) {
    return { statut: "secteur_inconnu", declare: declare.trim(), message: messageInconnu(declare.trim()) };
  }

  if (candidats.length > 1) {
    const noms = candidats.map((profil) => profil.sector).sort();
    return {
      statut: "profils_ambigus",
      declare: declare.trim(),
      candidats: noms,
      message:
        `Plusieurs profils répondent au métier « ${declare.trim()} » : ${noms.join(", ")}. ` +
        "Aucun n'est appliqué tant que l'ambiguïté n'est pas levée.",
    };
  }

  return { statut: "retenu", sector: premier.sector };
}
