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
 * ══ ⚠️ AUCUN MOTEUR MÉTIER N'EST ENREGISTRÉ AUJOURD'HUI ══
 *
 * `moteursMetier` est vide par défaut, et c'est **délibéré**, pas un oubli :
 *
 *   · `envoyer_un_message` exige un service d'expédition réel. Le brancher ici rendrait un worker
 *     capable d'écrire à de vraies entreprises dès qu'une clé traîne dans l'environnement — avant
 *     que le compte d'envoi, le domaine en UE et la clé hors dépôt ne soient en place
 *     (`docs/adr/0018`). Ce n'est pas une décision à prendre par défaut.
 *   · les autres moteurs (`qualifier_un_prospect`, `trouver_des_prospects`,
 *     `relancer_un_prospect`) n'existent pas encore, et les deux qui existent attendent une entrée
 *     que le contrat déclaré ne fournit pas — il manque une couche d'adaptation entre ce que le
 *     modèle propose et ce que le moteur consomme.
 *
 * Conséquence assumée, à ne pas découvrir en production : **une proposition d'action est refusée**
 * (`CapabilityUnavailable`) tant qu'aucun moteur n'est enregistré. Le worker approvisionne,
 * consomme la file, décide et journalise ; il n'agit pas encore. Le paramètre est le point
 * d'accroche : le jour venu, c'est une ligne.
 *
 * Réalise : EXEC-18
 */

import { ModelGateway, OpenAICompatibleProvider, PolicyEngine, type CapabilityEngine } from "@sentio/core";
import { createPostgresClient, type PostgresClient } from "@sentio/db";

import { PostgresApprovisionnementStore, RegistreDeGisementsParMetier } from "./adapters/approvisionnement.js";
import { PostgresApprovalStore } from "./adapters/approvals.js";
import { chargerLeRegistre } from "./adapters/capacites.js";
import { PostgresEffectLedger } from "./adapters/effects.js";
import { PostgresFileDeTravaux } from "./adapters/file-de-travaux.js";
import { PostgresJournalWriter } from "./adapters/journal.js";
import { PostgresUsageLedger } from "./adapters/ledger.js";
import { PostgresMoteurs } from "./adapters/moteurs.js";
import { approvisionnerLeJour } from "./battement.js";
import { executerLesTravauxDus } from "./boucle.js";
import { createHeartbeatHandler, type HeartbeatReport } from "./heartbeat/index.js";
import type { ConfigurationWorker } from "./configuration.js";

export interface WorkerMonte {
  /** Le point d'entrée, aux standards du web : `Request` → `Response`. Aucun cadre applicatif. */
  readonly battement: (request: Request) => Promise<Response>;
  /** Fermer le pool. Un pool non fermé retient le processus en vie. */
  readonly fermer: () => Promise<void>;
}

export interface OptionsDeComposition {
  /**
   * Les moteurs métier à enregistrer. **Vide par défaut** — voir l'en-tête de ce fichier. Ce
   * paramètre existe pour que les brancher soit un geste explicite, jamais un effet de bord.
   */
  readonly moteursMetier?: readonly CapabilityEngine[];
  /** Journalisation d'exploitation. Sortie standard en JSON par défaut, comme le battement. */
  readonly log?: (record: Record<string, unknown>) => void;
  /** Horloge, injectée pour les tests. */
  readonly maintenant?: () => Date;
}

/**
 * Monte le worker à partir d'une configuration **déjà validée**.
 *
 * Cette fonction ne valide rien et ne lit aucune variable : si elle recevait une configuration
 * douteuse, elle échouerait tard et mal. La validation est le travail de `lireLaConfiguration`,
 * qui rend tous les manquements d'un coup avant qu'une seule connexion ne s'ouvre.
 */
export function composerLeWorker(
  config: ConfigurationWorker,
  options: OptionsDeComposition = {},
): WorkerMonte {
  const sql: PostgresClient = createPostgresClient(config.databaseUrl);
  const journal = new PostgresJournalWriter(sql);
  const moteursMetier = options.moteursMetier ?? [];
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
        gisements: RegistreDeGisementsParMetier.commercial(sql),
        journal,
        reglages: config.reglages,
      },
      instant,
    );

    // 2. Le registre du battement : contrats relus en base, moteurs venus du code.
    const { registre, ecartees } = await chargerLeRegistre(sql, moteursMetier);
    const moteurs = new PostgresMoteurs(sql, registre);

    // ⚠️ L'instant est relu ICI, et pas réutilisé depuis l'approvisionnement. La raison est
    // concrète : une mission ouverte à l'étape 1 porte une échéance posée par la base au moment
    // de son insertion, donc APRÈS `instant`. Réutiliser l'ancien instant la rendrait « pas
    // encore due » — et le battement qui vient de l'ouvrir ne la prendrait pas. Le travail neuf
    // aurait attendu un jour entier, ce qui est exactement ce que l'ordre des deux étapes existe
    // pour éviter. Trouvé par le test de bout en bout, pas à la relecture.
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
      { prisPar: config.nomDeLExecutant, maintenant: maintenant() },
    );

    options.log?.({
      route: "battement",
      approvisionnement,
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
    await sql.close();
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
