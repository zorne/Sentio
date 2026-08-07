/**
 * Le processus. C'est le seul fichier qui touche `process` : environnement, signaux, code de
 * sortie.
 *
 * ══ L'ORDRE DU DÉMARRAGE, ET CE QU'IL PROTÈGE ══
 *
 *   1. lire et **valider** tout l'environnement — avant qu'une seule connexion ne s'ouvre ;
 *   2. monter les adaptateurs ;
 *   3. écouter.
 *
 * Un service qui ouvrirait sa base avant de savoir s'il est correctement configuré laisserait des
 * connexions derrière lui à chaque redémarrage raté. Et un service qui démarrerait à moitié
 * configuré répondrait, aurait l'air vivant, et ne ferait rien.
 *
 * ⚠️ **Rien de ce qui est journalisé ici ne contient de secret** — ni la chaîne de connexion, ni
 * les clés de fournisseur. Les journaux d'un hébergeur sont lus par des humains et conservés par
 * des tiers.
 *
 * Réalise : EXEC-18
 */

import { ConfigurationInvalide, lireLaConfiguration } from "./configuration.js";
import { composerLeWorker } from "./composition.js";
import { ROUTE_DU_BATTEMENT, demarrerLeServeur, type ServeurEnMarche } from "./serveur.js";

function journaliser(record: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

/**
 * Démarre le processus. Rend le serveur en marche, ou `null` si la configuration est refusée.
 *
 * Rendre le serveur plutôt que de ne rien rendre n'est pas une facilité de test : c'est ce qui
 * permet de **vérifier que le démarrage marche** sans lancer un processus séparé. « Ça compile »
 * et « ça démarre » sont deux propriétés différentes, et la seconde ne se découvre autrement
 * qu'en production.
 */
export async function demarrer(): Promise<ServeurEnMarche | null> {
  let config;
  try {
    config = lireLaConfiguration(process.env);
  } catch (erreur) {
    if (erreur instanceof ConfigurationInvalide) {
      // Tous les manquements d'un coup : découvrir le second après un redéploiement coûte une
      // demi-journée. Le message ne cite que des NOMS de variables.
      journaliser({ evenement: "demarrage_refuse", manquements: erreur.manquements });
      // ⚠️ On ne touche PAS à `process.exitCode` ici. Une fonction qui mute l'état du processus
      // ne peut plus être appelée par autre chose qu'un processus — y compris par un test, qui
      // hériterait du code de sortie et ferait échouer toute la suite. Le code de sortie est la
      // responsabilité du point d'entrée, en bas de ce fichier, et de lui seul.
      return null;
    }
    throw erreur;
  }

  const worker = composerLeWorker(config, { log: journaliser });
  const serveur = await demarrerLeServeur(worker.battement, {
    port: config.port,
    log: journaliser,
  });

  journaliser({
    evenement: "demarre",
    port: serveur.port,
    route: ROUTE_DU_BATTEMENT,
    executant: config.nomDeLExecutant,
    fournisseurs: config.fournisseurs.map((f) => `${f.key}:${f.dataPolicy}`),
    // Ce que ce worker s'autorise à faire, en clair dans le journal de démarrage : sans preuve
    // d'opt-out, aucune donnée réelle ne part vers un modèle (invariant 5).
    optOutProuve: config.flags.inferenceOptOutProven,
  });

  // Un arrêt propre rend le pool et laisse le battement en cours se terminer. Un `kill -9` reste
  // survivable : le bail sur `locked_at` rend les travaux repris au battement suivant.
  const fermerTout = async (signal: string | null): Promise<void> => {
    if (signal !== null) journaliser({ evenement: "arret", signal });
    await serveur.arreter();
    await worker.fermer();
  };

  const surSigterm = () => void fermerTout("SIGTERM");
  const surSigint = () => void fermerTout("SIGINT");
  process.once("SIGTERM", surSigterm);
  process.once("SIGINT", surSigint);

  return {
    port: serveur.port,
    arreter: async () => {
      // Les écouteurs de signal sont retirés AVANT de fermer : sans ça, un signal reçu après un
      // arrêt manuel relancerait la fermeture d'un serveur et d'un pool déjà fermés. Les deux
      // sont idempotents, mais on ne s'appuie pas sur cette tolérance pour laisser traîner un
      // écouteur qui ne sert plus.
      process.removeListener("SIGTERM", surSigterm);
      process.removeListener("SIGINT", surSigint);
      await fermerTout(null);
    },
  };
}

// Démarre seulement si ce fichier est le point d'entrée du processus — jamais à l'import, ce qui
// ferait écouter un port pendant les tests.
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  void demarrer().then((serveur) => {
    // EX_CONFIG : la convention pour « configuration inexploitable ». Un hébergeur qui relance en
    // boucle doit pouvoir distinguer « mal configuré » de « planté ».
    if (serveur === null) process.exitCode = 78;
  });
}
