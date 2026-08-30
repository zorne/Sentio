/**
 * EXEC-18 — la racine de composition : le seul endroit du worker où l'on assemble.
 *
 * ══ CE QUE « RACINE DE COMPOSITION » VEUT DIRE ICI ══
 *
 * Tout le reste du dépôt déclare des **ports** et reçoit ses dépendances. Personne n'instancie
 * personne. Il faut bien qu'un fichier le fasse : c'est celui-ci, et c'est le seul. La propriété
 * qu'on protège n'est pas esthétique — c'est elle qui rend le noyau testable sans infrastructure
 * et l'hébergeur remplaçable sans réécriture (`docs/02-architecture.md`).
 *
 * Conséquence à tenir : **aucun `new Postgres…` ailleurs que dans ce fichier**, et aucun
 * `process.env` ailleurs que dans `configuration.ts`.
 *
 * ══ CE QUI EST CONSTRUIT UNE FOIS, ET CE QUI EST RECONSTRUIT À CHAQUE BATTEMENT ══
 *
 * | Une fois (au démarrage) | À chaque battement |
 * |---|---|
 * | le pool de connexions, les adaptateurs, le Gateway | le **registre des capacités** |
 *
 * Le registre est relu à chaque battement parce que les contrats vivent en base : un contrat
 * corrigé ou une capacité retirée doivent prendre effet au battement suivant, pas au prochain
 * redéploiement. C'est la même règle que l'autonomie et les capacités activées, relues à chaque
 * pas (`next-step.ts`).
 *
 * ══ QUELS MOTEURS SONT MONTÉS, ET LESQUELS NE LE SONT PAS ══
 *
 * Montés par défaut, parce que leurs effets sont **internes et réversibles** :
 *
 *   · `rechercher.prospect`    — inscrit des entreprises tirées de l'annuaire PUBLIC de l'État ;
 *   · `qualifier.prospect`     — décide si un prospect correspond à ce que le client vend ;
 *   · `mettre_a_jour.prospect` — consigne l'état de la relation.
 *
 * ⚠️ **Pas montés, et ce n'est pas un oubli** : `envoyer.prospect` et `relancer.prospect`. Leur
 * moteur écrit à une vraie entreprise. Les brancher ici rendrait un worker capable d'écrire à de
 * vraies personnes dès qu'une clé traîne dans l'environnement — avant que le compte d'envoi, le
 * domaine en UE et la clé hors dépôt ne soient en place (`docs/adr/0018`). Ce n'est pas une
 * décision à prendre par défaut. `moteursMetier` est le point d'accroche : le jour venu, c'est
 * une ligne, et elle sera écrite exprès.
 *
 * ⚠️ **Le verrou est ici, dans cette liste** — pas dans l'absence d'un attelage. `attelage.ts`
 * sait traduire une proposition d'envoi ; ce qui manque volontairement, c'est le moteur qui
 * expédierait. Une capacité proposée sans moteur est refusée (`CapabilityUnavailable`) :
 * l'employé le dit, il ne travaille pas à moitié.
 *
 * Réalise : EXEC-18
 */

import {
  AnnuaireDeLEtat,
  QualifierProspectCapability,
  RechercherProspectsCapability,
  UpdateFicheCapability,
} from "@sentio/capabilities";
import { ModelGateway, OpenAICompatibleProvider, PolicyEngine, type CapabilityEngine } from "@sentio/core";

import { PostgresApprovisionnementStore, RegistreDeGisementsEnMemoire } from "./adapters/approvisionnement.js";
import {
  JournalDesFiches,
  PostgresFichesAQualifier,
  PostgresLeadStatusStore,
  RegistreDeProspectsPostgres,
} from "./adapters/prospects.js";
import { PostgresApprovalStore } from "./adapters/approvals.js";
import { chargerLeRegistre } from "./adapters/capacites.js";
import { PostgresEffectLedger } from "./adapters/effects.js";
import { PostgresFileDeTravaux } from "./adapters/file-de-travaux.js";
import { PostgresJournalWriter } from "./adapters/journal.js";
import { PostgresUsageLedger } from "./adapters/ledger.js";
import { PostgresMoteurs } from "./adapters/moteurs.js";
import { approvisionnerLeJour } from "./battement.js";
import { faireProgresserLesEmployes } from "./progression.js";
import { reevaluerLesEmployes } from "./reevaluation.js";
import { executerLesTravauxDus } from "./boucle.js";
import { createHeartbeatHandler, type HeartbeatReport } from "./heartbeat/index.js";
import type { TransactionalSqlClient } from "@sentio/db";

import type { ConfigurationWorker } from "./configuration.js";

export interface ExecutantMonte {
  /** Le point d'entrée, aux standards du web : `Request` → `Response`. Aucun cadre applicatif. */
  readonly battement: (request: Request) => Promise<Response>;
  /** Fermer ce que l'hôte a ouvert. Un pool non fermé retient des connexions. */
  readonly fermer: () => Promise<void>;
}

export interface OptionsDeComposition {
  /**
   * Le client de base, **fourni par l'hôte**. C'est la seule chose que les deux hôtes ne
   * partagent pas : `pg` sous Node, le pilote Deno en fonction serveur. Le reste — Gateway,
   * politique, file, journal, boucle — est monté identiquement des deux côtés, et c'est ce qui
   * rend la parité vérifiable au lieu d'être espérée (`adr/0028`).
   */
  readonly sql: TransactionalSqlClient;
  /**
   * Combien de travaux ce battement traite au maximum. Un hôte à durée bornée en met **un** ;
   * un processus long peut en mettre davantage. C'est un réglage d'hôte, pas de métier.
   */
  readonly travauxMaxParBattement?: number;
  /**
   * Les moteurs métier à enregistrer. **Vide par défaut** — voir l'en-tête de ce fichier. Ce
   * paramètre existe pour que les brancher soit un geste explicite, jamais un effet de bord.
   */
  readonly moteursMetier?: readonly CapabilityEngine[];
  /** Journalisation d'exploitation. Sortie standard en JSON par défaut, comme le battement. */
  readonly log?: (record: Record<string, unknown>) => void;
  /** Horloge, injectée pour les tests. */
  readonly maintenant?: () => Date;
  /** Ce que l'hôte doit refermer à l'arrêt — son pool, que lui seul connaît. */
  readonly fermerLaBase?: () => Promise<void>;
}

/**
 * Monte le worker à partir d'une configuration **déjà validée**.
 *
 * Cette fonction ne valide rien et ne lit aucune variable : si elle recevait une configuration
 * douteuse, elle échouerait tard et mal. La validation est le travail de `lireLaConfiguration`,
 * qui rend tous les manquements d'un coup avant qu'une seule connexion ne s'ouvre.
 */
/**
 * Les moteurs dont les effets ne sortent pas de l'entreprise — ceux qui sont montés par défaut.
 *
 * ⚠️ PUBLIQUE PARCE QU'UN TEST LA COMPARE À LA BASE. `capability.disponible` annonce au client ce
 * qui s'exécute vraiment ; cette liste est ce qui s'exécute vraiment. Un test d'intégration exige
 * qu'elles disent la même chose, sinon l'interface promettrait ce que le runtime refuse — c'est
 * le constat P0-3 de `docs/35`.
 *
 * Le critère n'est pas « simple à brancher », c'est **réversible**. Une qualification erronée se
 * corrige d'un clic ; un message parti ne se rattrape pas.
 */
export function moteursMontesParDefaut(sql: TransactionalSqlClient): readonly CapabilityEngine[] {
  return [
    // ⚠️ Le premier maillon de toute la chaîne : sans lui, `lead` reste vide et aucune mission ne
    // peut s'ouvrir. Il lit une base PUBLIQUE de l'État et écrit chez le client — rien ne sort de
    // chez lui, et une entreprise inscrite à tort s'écarte d'un clic. Constat P0-1 de `docs/35`.
    new RechercherProspectsCapability(new AnnuaireDeLEtat(), new RegistreDeProspectsPostgres(sql)),
    new QualifierProspectCapability(new PostgresFichesAQualifier(sql)),
    new UpdateFicheCapability(new PostgresLeadStatusStore(sql), new JournalDesFiches(sql)),
  ];
}

export function composerLExecutant(
  config: ConfigurationWorker,
  options: OptionsDeComposition,
): ExecutantMonte {
  const sql = options.sql;
  const journal = new PostgresJournalWriter(sql);
  // Les moteurs internes sont montés par défaut. Un hôte peut en fournir d'autres — c'est ainsi
  // que les moteurs d'envoi entreront, explicitement, le jour où l'expédition sera réelle.
  const moteursMetier = options.moteursMetier ?? moteursMontesParDefaut(sql);
  const maintenant = options.maintenant ?? (() => new Date());

  // ⚠️ L'ordre de cette liste EST la chaîne de repli, et il vient de la configuration
  // (`docs/19-fournisseurs-modeles.md`). Le Gateway n'en franchit jamais la frontière de classe
  // de données : sur une donnée réelle, si le conforme est épuisé, la tâche est reportée.
  const gateway = new ModelGateway({
    providers: config.fournisseurs.map(
      (fournisseur) =>
        new OpenAICompatibleProvider({
          key: fournisseur.key,
          baseUrl: fournisseur.baseUrl,
          model: fournisseur.model,
          apiKey: fournisseur.apiKey,
          dataPolicy: fournisseur.dataPolicy,
        }),
    ),
    ledger: new PostgresUsageLedger(sql),
    journal,
    flags: config.flags,
  });

  const policy = new PolicyEngine(new PostgresApprovalStore(sql), journal);
  const file = new PostgresFileDeTravaux(sql, config.reglages.bailDuVerrouMinutes);
  const ledger = new PostgresEffectLedger(sql);

  async function executerLesTravauxDusMonte(): Promise<HeartbeatReport> {
    const instant = maintenant();

    // 1. Ouvrir le travail neuf du jour. AVANT de vider la file : une mission ouverte ici est due
    //    immédiatement, donc traitée dans le même battement (`battement.ts`).
    const approvisionnement = await approvisionnerLeJour(
      {
        store: new PostgresApprovisionnementStore(sql),
        gisements: RegistreDeGisementsEnMemoire.commercial(sql),
        journal,
        reglages: config.reglages,
      },
      instant,
    );

    // 2. Le registre du battement : contrats relus en base, moteurs venus du code.
    const { registre, ecartees } = await chargerLeRegistre(sql, moteursMetier);
    const moteurs = new PostgresMoteurs(sql, registre);

    // ⚠️ AUCUN INSTANT N'EST PASSÉ : LA BASE EST L'HORLOGE.
    //
    // Il y avait ici un `maintenant: maintenant()`, relu exprès plutôt que réutilisé depuis
    // l'approvisionnement. Le commentaire disait pourquoi : « une mission ouverte à l'étape 1
    // porte une échéance posée par la base, donc APRÈS `instant` ; réutiliser l'ancien instant la
    // rendrait pas encore due ». Le raisonnement était juste, et le remède ne l'était qu'à moitié.
    //
    // Relire l'horloge du PROCESSUS ne rattrape pas le fond : `next_run_at` vient de Postgres, en
    // microsecondes, et un `Date` JS n'a que la milliseconde. Le même travail restait manquable
    // quand les deux tombaient dans la même milliseconde — une fois sur quatre, mesuré.
    //
    // La comparaison se fait désormais en SQL (`PostgresFileDeTravaux.prendre`). Ne pas passer
    // d'instant n'est donc pas un oubli : c'est le correctif.
    const travaux = await executerLesTravauxDus(
      {
        sql,
        file,
        journal,
        gateway,
        policy,
        registry: registre,
        ledger,
        moteurPour: (tenantId, capabilityKey) => moteurs.pour(tenantId, capabilityKey),
        reglages: config.reglages,
      },
      {
        prisPar: config.nomDeLExecutant,
        // ⚠️ Explicite, et venant de la CONFIGURATION — jamais d'un défaut au fond de `boucle.ts`.
        // Avant, ce champ n'était pas passé du tout : la production tournait en `real` par un `??`
        // que personne ne voyait en lisant ce montage. Le défaut était bon, son invisibilité non.
        dataClass: config.classeDeDonnees,
        ...(options.travauxMaxParBattement !== undefined && {
          maxTravaux: options.travauxMaxParBattement,
        }),
      },
    );

    // 3. Relire les résultats et, s'il y a lieu, PROPOSER une version suivante. En dernier, et
    //    pas par commodité : les mesures doivent porter sur du travail déjà fait, pas sur les
    //    missions que ce battement vient d'ouvrir. ⚠️ Rien ne s'applique ici — la proposition
    //    naît inactive et attend le dirigeant (§10 de la vision).
    const reevaluation = await reevaluerLesEmployes({ sql, journal }, instant);

    // 4. Retenir ce qui marche CHEZ CE CLIENT (EVOL-04). Contrairement à la réévaluation, ceci
    //    s'applique seul : le rôle ne bouge pas, seule la manière change — et chaque changement
    //    est annoncé, adossé à sa preuve.
    const progression = await faireProgresserLesEmployes({ sql, journal }, instant);

    options.log?.({
      route: "battement",
      // ⚠️ À CHAQUE CYCLE, PAS SEULEMENT AU DÉMARRAGE. Un exécutant en « synthetic » traite des
      // données d'essai et n'oppose plus la garde d'opt-out du Gateway : c'est un réglage
      // d'ABAISSEMENT, et un réglage d'abaissement qu'on ne voit qu'au démarrage est un réglage
      // qu'on oublie posé. Ici, il ne peut pas tourner six mois en silence — il est dans chaque
      // ligne de journal, à côté de ce qu'il a fait.
      classeDeDonnees: config.classeDeDonnees,
      approvisionnement,
      reevaluation,
      progression,
      // Une capacité écartée du registre est un contrat illisible en base : ça se voit, ça ne se
      // devine pas.
      capacitesEcartees: ecartees,
    });

    return travaux;
  }

  // ⚠️ Idempotent, comme l'arrêt du serveur : fermer un pool deux fois lève. Un arrêt demandé
  // deux fois — un signal reçu pendant un arrêt manuel — doit être un non-événement, pas un
  // incident au moment précis où l'on essaie de s'arrêter proprement.
  let ferme = false;
  const fermer = async (): Promise<void> => {
    if (ferme) return;
    ferme = true;
    await options.fermerLaBase?.();
  };

  return {
    battement: createHeartbeatHandler({
      // Relu à chaque appel, jamais capturé : une rotation de secret ne doit pas exiger un
      // redéploiement (`heartbeat/index.ts`).
      secret: () => config.secretDuBattement,
      clock: { now: maintenant, sleep: async () => undefined },
      executerLesTravauxDus: executerLesTravauxDusMonte,
      ...(options.log !== undefined && { log: options.log }),
    }),
    fermer,
  };
}
