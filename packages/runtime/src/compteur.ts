/**
 * Le compteur — il constate qu'un travail n'aboutit pas, et il prévient **la bonne personne**.
 *
 * ══ CE QU'IL FERME ══
 *
 * L'étape précédente a rendu le compte rendu honnête : un battement dit désormais si quelque
 * chose a abouti. Mais personne ne le lisait. Un compte rendu juste que personne ne lit vaut le
 * compte rendu faux qu'il remplace — le silence est le même.
 *
 * Ici, le silence devient un fait compté, puis une notification.
 *
 * ══ TROIS RÈGLES, REPRISES DE `garde_du_silence` ══
 *
 *   · **le seuil est en base, par entreprise** (`garde_du_travail`) : on le desserre pour un
 *     client au rythme lent sans redéployer ;
 *   · **on ne prévient pas deux fois d'une même série** (`prevenu_le`) : une alerte qui se répète
 *     devient un bruit, et le dirigeant finit par ne plus la lire ;
 *   · **remise à zéro au premier cycle qui aboutit** : la série se referme d'elle-même, et la
 *     panne suivante sera dite comme une nouvelle.
 *
 * ══ ET LA RÈGLE QUI N'EN VIENT PAS : LE DESTINATAIRE ══
 *
 * `capacite_absente` recouvre deux manques. Une capacité non activée est du ressort du dirigeant ;
 * un moteur non monté est un défaut produit, et il n'y peut rien. Les lui envoyer tous les deux
 * lui apprendrait que ce canal ne le concerne pas.
 *
 * La séparation est décidée dans le noyau (`destinataireDuBlocage`, fonction pure et testée) ;
 * ici, on n'en tire que les conséquences.
 *
 * ⚠️ **ET LA LECTURE DE CE QU'IL PEUT ACTIVER SE FAIT ICI, UNE FOIS.** Dire « il vous manque tel
 * outil » exige de savoir ce que le dirigeant a le droit d'activer — le noyau de son employée et
 * la couverture de sa formule. Poser ces deux lectures à chaque pas les paierait des centaines de
 * fois pour n'en servir qu'une : le pas, lui, sait déjà qu'il est bloqué. C'est au moment d'ouvrir
 * la bouche qu'il faut savoir quoi dire.
 *
 * ⚠️ **CE QUE LA LECTURE PEUT RÉVÉLER, ET QUI CHANGE LE DESTINATAIRE.** Si le dirigeant n'a rien
 * à activer — l'outil n'est ni dans le noyau de son employée ni dans sa formule —, alors la
 * capacité « non activée » n'est pas la sienne à activer : le manque revient chez nous. Le noyau
 * ne pouvait pas le savoir ; c'est cette lecture qui tranche, et le dernier mot lui revient.
 */

import { releverParEmploye, type PasDuBattement, type ReleveDEmploye } from "@sentio/core";
import type { SqlClient } from "@sentio/db";
import { capaciteApplicableAuSujet } from "@sentio/domain";

import { jourUtc } from "./battement.js";

export interface CompteurDeps {
  readonly sql: SqlClient;
}

export interface RapportDuCompteur {
  /** Employés dont le cycle n'a rien fait aboutir. Un chiffre, pas un silence. */
  readonly muets: number;
  /** Séries refermées parce que le travail a repris. */
  readonly remisAZero: number;
  /** Dirigeants prévenus pendant ce battement. */
  readonly prevenus: number;
  /**
   * Employés bloqués au-delà du seuil pour une raison qui est de NOTRE ressort. Aucun message
   * n'est parti chez le client : c'est nous que ça regarde, et c'est le verdict qui le porte.
   */
  readonly aNotreCharge: number;
  /** Ce qui bloque, nommé, par cause. Jamais une donnée du client : des motifs, et rien d'autre. */
  readonly causes: Readonly<Record<string, number>>;
}

interface CycleMuet {
  readonly compte: number;
  readonly seuil: number;
  readonly deja_prevenu: boolean;
}

/**
 * Constate ce que ce battement a produit, employé par employé.
 *
 * **Un employé cassé n'arrête pas les autres** : même règle que l'approvisionnement et la boucle.
 * Le compteur est une surveillance ; une surveillance qui interrompt ce qu'elle surveille est
 * pire que pas de surveillance.
 */
export async function compterLeTravailQuiNAboutitPas(
  deps: CompteurDeps,
  entree: { readonly pas: readonly PasDuBattement[]; readonly maintenant: Date },
): Promise<RapportDuCompteur> {
  const jour = jourUtc(entree.maintenant);
  const causes: Record<string, number> = {};
  let muets = 0;
  let remisAZero = 0;
  let prevenus = 0;
  let aNotreCharge = 0;

  for (const employe of releverParEmploye(entree.pas)) {
    if (employe.aAbouti) {
      const [refermee] = await deps.sql.query<{ constater_un_cycle_abouti: boolean }>(
        "select constater_un_cycle_abouti($1, $2)",
        [employe.tenantId, employe.employeeId],
      );
      if (refermee?.constater_un_cycle_abouti === true) remisAZero += 1;
      continue;
    }

    muets += 1;

    // ⚠️ LE PREMIER BLOCAGE FAIT FOI. Le relevé les garde tous, mais un compteur porte UNE série :
    // mêler deux causes dans une même ligne rendrait le message illisible et le motif inexploitable.
    // Le premier est celui que la file a rencontré d'abord, donc le plus proche de la cause.
    const blocage = employe.blocages[0];
    const cause = blocage?.manque?.cause ?? null;
    causes[cause ?? blocage?.motif ?? "inconnu"] =
      (causes[cause ?? blocage?.motif ?? "inconnu"] ?? 0) + 1;

    const [constat] = await deps.sql.query<CycleMuet>(
      "select * from constater_un_cycle_muet($1, $2, $3, $4, $5)",
      [employe.tenantId, employe.employeeId, jour, blocage?.motif ?? null, cause],
    );

    if (constat === undefined || constat.compte < constat.seuil || constat.deja_prevenu) continue;

    if (await prevenirLeDirigeant(deps, employe, constat.compte)) {
      prevenus += 1;
    } else {
      // Personne d'autre que nous ne peut y faire quelque chose. Le dirigeant n'en saura rien, et
      // c'est le bon choix : lui annoncer une panne qu'il ne peut pas réparer ne lui apprendrait
      // qu'une chose, à ne plus lire ce canal.
      aNotreCharge += 1;
    }
  }

  return { muets, remisAZero, prevenus, aNotreCharge, causes };
}

interface CapaciteActivable {
  readonly cle: string;
  readonly nom: string;
}

/**
 * Prévient le dirigeant, **si et seulement si** quelque chose est à sa portée.
 *
 * Rend `false` quand il n'y a rien à lui dire : aucun blocage de son ressort, ou aucun outil qu'il
 * ait le droit d'activer. L'appelant en fait alors une affaire interne.
 */
async function prevenirLeDirigeant(
  deps: CompteurDeps,
  employe: ReleveDEmploye,
  cycles: number,
): Promise<boolean> {
  const aSaPortee = employe.blocages.find((blocage) => blocage.destinataire === "dirigeant");
  if (aSaPortee === undefined) return false;

  const activables = await deps.sql.query<CapaciteActivable>(
    "select cle, nom from capacites_activables($1, $2)",
    [employe.tenantId, employe.employeeId],
  );

  // ⚠️ LE FILTRE PAR SUJET VIENT DU DOMAINE, PAS DE LA REQUÊTE. « Quelle capacité pour quelle
  // nature de sujet » est déclaré une seule fois (`SUJET_EXIGE_PAR_CAPACITE`) ; le recopier en SQL
  // en ferait une seconde vérité, et le jour où elles divergeraient on annoncerait un outil qui ne
  // débloquerait rien.
  const sujet = aSaPortee.manque?.sujetKind ?? null;
  const utiles =
    sujet === null
      ? activables
      : activables.filter((capacite) => capaciteApplicableAuSujet(capacite.cle, sujet));

  if (utiles.length === 0) return false;

  const [identite] = await deps.sql.query<{ first_name: string }>(
    `select i.first_name
       from employee e join identity i on i.id = e.identity_id
      where e.tenant_id = $1 and e.id = $2`,
    [employe.tenantId, employe.employeeId],
  );

  await deps.sql.query(
    "insert into notification (tenant_id, employee_id, kind, message) values ($1, $2, 'travail', $3)",
    [employe.tenantId, employe.employeeId, message(identite?.first_name, cycles, utiles)],
  );
  await deps.sql.query("select marquer_le_dirigeant_prevenu($1, $2)", [
    employe.tenantId,
    employe.employeeId,
  ]);
  return true;
}

/**
 * Ce que le dirigeant lit.
 *
 * Trois exigences, et la troisième est la plus facile à perdre : dire ce qui se passe, dire ce
 * qu'il peut faire, et **ne rien lui reprocher**. Il n'a rien fait de mal : un outil n'a pas été
 * activé, voilà tout.
 *
 * Soumis au lexique (`docs/17-lexique.md`) : ni le vocabulaire interne, ni le nom des capacités
 * tel que le code les nomme. Le nom affiché vient de la base, c'est celui du produit.
 */
function message(
  prenom: string | undefined,
  cycles: number,
  utiles: readonly CapaciteActivable[],
): string {
  const qui = prenom ?? "Votre employée";
  const jours = cycles === 1 ? "depuis hier" : `depuis ${cycles} jours`;
  const outils = utiles.map((capacite) => `« ${capacite.nom} »`).join(" et ");
  const accord = utiles.length === 1 ? "n'est pas activé" : "ne sont pas activés";
  const geste = utiles.length === 1 ? "l'activer" : "les activer";

  return (
    `${qui} ne peut pas avancer sur son travail ${jours} : ${outils} ${accord}. ` +
    `Vous pouvez ${geste} depuis son espace, elle reprendra d'elle-même.`
  );
}
