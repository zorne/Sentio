// ════════════════════════════════════════════════════════════════════════════════════════════
// TROUVER LES ENTREPRISES À APPROCHER — le moteur qui manquait.
//
// C'est le premier maillon de toute la chaîne : sans lui, `lead` reste vide, aucune mission ne
// s'ouvre, et rien de ce que fait Lady ne peut commencer. Voir `annuaire.ts` pour la source et les
// règles d'écartement, et le constat P0-1 de `docs/35`.
//
// ══ CE QUE CE MOTEUR PEUT ET NE PEUT PAS ══
//
// Il inscrit des entreprises. Il ne les contacte pas, et il ne le pourra pas : la source publique
// ne donne aucune adresse email. Ce n'est pas une limite de ce fichier, c'est la nature de la
// donnée publique. Le dirigeant obtient donc une liste d'entreprises **repérées et qualifiables**,
// ce qui est exactement ce que Sentio annonce aujourd'hui — et rien de plus.
//
// ══ POURQUOI IL EST « INTERNE » ET DONC MONTABLE PAR DÉFAUT ══
//
// Le critère de `composition.ts` n'est pas « simple à brancher », c'est **réversible**. Ce moteur
// lit une base publique et écrit dans la table du client. Une entreprise inscrite à tort s'écarte
// d'un clic ; rien ne sort de chez le client. Ça ne se compare pas à un message parti.
// ════════════════════════════════════════════════════════════════════════════════════════════

import { CAPACITES } from "@sentio/domain";

import type { AnnuaireDEntreprises, EntrepriseTrouvee } from "./annuaire.js";

/** Ce que le moteur sait faire de la base : inscrire, sans jamais écraser. */
export interface RegistreDeProspects {
  /**
   * Inscrit les entreprises trouvées et rend le nombre RÉELLEMENT ajouté.
   *
   * ⚠️ Le nombre ajouté, jamais le nombre proposé. Une entreprise déjà connue est refusée par
   * l'index d'unicité, et c'est un **résultat normal** — pas une erreur. Rendre le nombre demandé
   * ferait dire à Lady « j'ai trouvé douze entreprises » quand elle n'en a ajouté aucune.
   */
  inscrire(input: {
    tenantId: string;
    entreprises: readonly EntrepriseTrouvee[];
    motifDeSelection: string;
  }): Promise<number>;
}

export interface RechercherInput {
  readonly tenantId: string;
  /** Ce qu'on cherche, en mots. Vient de la configuration du client, pas du modèle seul. */
  readonly quoi: string;
  readonly codePostal?: string;
  readonly limite: number;
}

export type RechercherResult =
  | { readonly status: "trouve"; readonly examinees: number; readonly ajoutees: number }
  | { readonly status: "rien_de_nouveau"; readonly examinees: number };

export class RechercherProspectsCapability {
  readonly engineKey = "base";
  readonly capabilityKey = CAPACITES.rechercherProspect;

  constructor(
    private readonly annuaire: AnnuaireDEntreprises,
    private readonly registre: RegistreDeProspects,
  ) {}

  async execute(input: RechercherInput): Promise<RechercherResult> {
    // ⚠️ La borne est ici et pas seulement dans l'annuaire. Un moteur qui accepterait « limite:
    // 10000 » parce que l'appelant l'a écrit ouvrirait autant de missions au battement suivant, et
    // brûlerait le quota d'inférence du client en une nuit.
    const limite = Math.min(Math.max(Math.trunc(input.limite), 1), 25);

    const entreprises = await this.annuaire.chercher({
      quoi: input.quoi,
      ...(input.codePostal !== undefined && { codePostal: input.codePostal }),
      limite,
    });

    if (entreprises.length === 0) return { status: "rien_de_nouveau", examinees: 0 };

    // ⚠️ LE MOTIF EST ÉCRIT AU MOMENT DE L'INSCRIPTION, PAS RECONSTITUÉ APRÈS.
    //
    // L'article 14 du RGPD impose de dire au prospect **l'origine de la donnée** dès le premier
    // contact (`docs/10`, § Prospection commerciale). Cette phrase est ce qui rendra cette
    // obligation tenable le jour où l'envoi existera : sans elle, il faudrait deviner d'où vient
    // une fiche, des mois après.
    const motifDeSelection =
      `Repérée dans l'annuaire public des entreprises (base SIRENE) : « ${input.quoi} »` +
      (input.codePostal !== undefined && input.codePostal !== ""
        ? `, autour du ${input.codePostal}.`
        : ", en France.");

    const ajoutees = await this.registre.inscrire({
      tenantId: input.tenantId,
      entreprises,
      motifDeSelection,
    });

    // Toutes déjà connues : ce n'est pas un échec, c'est le résultat, et il doit se lire comme tel.
    if (ajoutees === 0) return { status: "rien_de_nouveau", examinees: entreprises.length };

    return { status: "trouve", examinees: entreprises.length, ajoutees };
  }
}
