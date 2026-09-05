// ════════════════════════════════════════════════════════════════════════════════════════════
// D'OÙ VIENNENT LES ENTREPRISES À APPROCHER.
//
// ══ LE CONSTAT P0-1 DE `docs/35` ══
//
// Les missions s'ouvrent exclusivement à partir de la table `lead`. **Rien ne l'a jamais
// remplie** : ni route, ni écran, ni worker, ni migration. La capacité `rechercher.prospect`
// n'existait que comme étiquette — déclarée en base, composable dans une configuration, présentée
// au client, sans attelage ni moteur. Le runtime tournait donc à vide, définitivement.
//
// ══ LA SOURCE, ET POURQUOI CELLE-LÀ ══
//
// L'annuaire des entreprises de l'État (`recherche-entreprises.api.gouv.fr`, base SIRENE) :
// données **publiques**, service public, gratuit, **sans clé** — donc aucun secret de plus à
// tenir, aucune dépense, et une base légale limpide pour de la prospection professionnelle.
//
// ⚠️ ELLE NE DONNE AUCUNE ADRESSE EMAIL. Vérifié sur l'API réelle avant d'écrire cette ligne :
// aucun champ de contact, nulle part. C'est structurel, pas un oubli — l'État ne publie pas les
// emails des entreprises. Lady peut donc **repérer et qualifier** des entreprises ; elle ne peut
// pas leur écrire. Ça tombe juste : les moteurs d'envoi ne sont pas montés non plus.
//
// ══ CE QUI EST ÉCARTÉ, ET C'EST DU RGPD, PAS DU CONFORT ══
//
//   1. **Les entreprises non diffusibles** (`statut_diffusion` ≠ « O »). L'INSEE marque ainsi
//      celles qui ont demandé à ne pas figurer dans les diffusions publiques. Les prospecter
//      serait passer outre une opposition déjà exprimée.
//   2. **Les entrepreneurs individuels** (`nature_juridique` en 1xxx). Leur raison sociale EST le
//      nom d'une personne physique : la collecter, c'est collecter une donnée personnelle, avec
//      tout ce que l'article 14 impose. On s'en tient aux personnes morales.
//   3. **Les dirigeants.** L'API les rend ; on ne les lit même pas. Des noms de personnes n'ont
//      rien à faire dans une table de prospects d'entreprise.
//   4. **Ce qui est fermé** — et à DEUX niveaux, ce qui n'était pas évident.
//
// ⚠️ LE PIÈGE DES DEUX NIVEAUX, TROUVÉ EN ESSAYANT L'API POUR DE VRAI.
//
// Le filtre géographique de l'API porte sur **n'importe quel établissement** de l'entreprise, pas
// sur son siège. Une recherche sur Lille rend donc des sociétés dont le siège est à Sarcelles —
// et dont l'établissement lillois est **FERMÉ** (`etat_administratif: "F"`). Constaté sur un cas
// réel. Prospecter une agence fermée n'a aucune valeur, et le siège affiché ne dit pas où
// l'entreprise a été trouvée. On exige donc l'activité de l'entreprise ET celle de
// l'établissement apparié, et c'est cet établissement-là qu'on retient comme adresse.
//
// ══ POURQUOI UNE ABSTRACTION ══
//
// `AnnuaireDEntreprises` existe pour la même raison que `ModelProvider` : la source doit pouvoir
// changer sans que le moteur bouge. Elle est aussi ce qui rend le moteur testable **sans réseau**.
// ════════════════════════════════════════════════════════════════════════════════════════════

/** Ce qu'on retient d'une entreprise. Volontairement pauvre : rien de personnel. */
export interface EntrepriseTrouvee {
  /**
   * Le SIRET de l'établissement retenu — l'identifiant stable qui empêche de réinscrire la même
   * entreprise à chaque recherche. Le SIREN ne suffirait pas : deux agences d'un même groupe sont
   * deux prospects distincts pour un commercial.
   */
  readonly reference: string;
  readonly nom: string;
  /** Le code d'activité (NAF), tel quel : il sert à qualifier, pas à être lu par un dirigeant. */
  readonly secteur: string | null;
  readonly commune: string | null;
  readonly codePostal: string | null;
}

export interface CriteresDeRecherche {
  /** Ce qu'on cherche, en mots : « menuiserie », « cabinet de courtage ». */
  readonly quoi: string;
  /** Où, en code postal. Facultatif : sans lui, la recherche porte sur toute la France. */
  readonly codePostal?: string;
  readonly limite: number;
}

export interface AnnuaireDEntreprises {
  chercher(criteres: CriteresDeRecherche): Promise<readonly EntrepriseTrouvee[]>;
}

/** Une source injoignable ou en panne. Distincte d'une recherche qui ne trouve rien. */
export class AnnuaireIndisponible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnuaireIndisponible";
  }
}

/**
 * Traduit la réponse de l'annuaire, et écarte ce qui ne doit pas être prospecté.
 *
 * ⚠️ EXPORTÉE, ET C'EST DÉLIBÉRÉ : toutes les règles d'écartement se testent ici, sans réseau.
 * Un filtre qu'on ne peut éprouver qu'en appelant l'État n'est pas éprouvé.
 */
export function lireLaReponseDeLAnnuaire(charge: unknown): readonly EntrepriseTrouvee[] {
  const resultats = (charge as { results?: unknown })?.results;
  if (!Array.isArray(resultats)) return [];

  const trouvees: EntrepriseTrouvee[] = [];

  for (const brut of resultats) {
    const r = brut as Record<string, unknown>;

    // ── 1. L'entreprise a demandé à ne pas être diffusée : on n'insiste pas.
    if (r["statut_diffusion"] !== "O") continue;

    // ── 2. Elle est cessée.
    if (r["etat_administratif"] !== "A") continue;

    // ── 3. Personne physique : sa raison sociale est le nom de quelqu'un.
    const nature = typeof r["nature_juridique"] === "string" ? r["nature_juridique"] : "";
    if (nature.startsWith("1")) continue;

    const nom = typeof r["nom_complet"] === "string" ? r["nom_complet"].trim() : "";
    if (nom === "") continue;

    // ── 4. L'établissement RÉELLEMENT apparié, et lui seul. Voir l'en-tête : le siège peut se
    //       trouver à l'autre bout du pays, et l'établissement trouvé peut être fermé.
    const apparies = Array.isArray(r["matching_etablissements"])
      ? (r["matching_etablissements"] as Record<string, unknown>[])
      : [];
    const etablissement =
      apparies.find((e) => e["etat_administratif"] === "A") ??
      // Sans critère géographique, l'API ne renvoie pas d'appariement : le siège fait foi.
      (apparies.length === 0 ? (r["siege"] as Record<string, unknown> | undefined) : undefined);

    if (etablissement === undefined) continue;
    if (etablissement["etat_administratif"] !== undefined && etablissement["etat_administratif"] !== "A") continue;

    const siret = typeof etablissement["siret"] === "string" ? etablissement["siret"] : null;
    if (siret === null) continue;

    trouvees.push({
      reference: siret,
      nom,
      secteur: typeof r["activite_principale"] === "string" ? r["activite_principale"] : null,
      commune:
        typeof etablissement["libelle_commune"] === "string"
          ? etablissement["libelle_commune"]
          : null,
      codePostal:
        typeof etablissement["code_postal"] === "string" ? etablissement["code_postal"] : null,
    });
  }

  return trouvees;
}

/** L'annuaire public de l'État. */
export class AnnuaireDeLEtat implements AnnuaireDEntreprises {
  constructor(
    private readonly base = "https://recherche-entreprises.api.gouv.fr",
    private readonly fetchImpl: typeof fetch = fetch,
    /** Au-delà, on rend la main : une recherche n'est jamais urgente au point de bloquer un pas. */
    private readonly delaiMs = 12_000,
  ) {}

  async chercher(criteres: CriteresDeRecherche): Promise<readonly EntrepriseTrouvee[]> {
    const params = new URLSearchParams({
      q: criteres.quoi,
      // ⚠️ Borné des deux côtés. L'API plafonne à 25 par page ; demander plus la ferait échouer,
      // et demander 0 ferait un appel pour rien.
      per_page: String(Math.min(Math.max(criteres.limite, 1), 25)),
      page: "1",
      // Les entreprises cessées ne sont même pas rendues : moins de bruit à écarter ensuite.
      etat_administratif: "A",
    });
    if (criteres.codePostal !== undefined && criteres.codePostal !== "") {
      params.set("code_postal", criteres.codePostal);
    }

    const abandon = AbortSignal.timeout(this.delaiMs);
    let reponse: Response;
    try {
      reponse = await this.fetchImpl(`${this.base}/search?${params.toString()}`, {
        signal: abandon,
        headers: { accept: "application/json" },
      });
    } catch (erreur) {
      throw new AnnuaireIndisponible(
        `L'annuaire des entreprises n'a pas répondu : ${(erreur as Error).message}`,
      );
    }

    if (!reponse.ok) {
      // ⚠️ Le corps n'est pas recopié : il peut être volumineux, et il n'apprend rien qu'un code
      // ne dise déjà.
      throw new AnnuaireIndisponible(`L'annuaire des entreprises a répondu ${reponse.status}.`);
    }

    return lireLaReponseDeLAnnuaire(await reponse.json());
  }
}
