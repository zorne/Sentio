/**
 * La surveillance — ce qui vient chercher l'exploitant quand il y a quelque chose à faire.
 *
 *     pnpm run surveiller
 *
 * ══ CE QUE FAIT SON CODE DE SORTIE ══
 *
 * **0** rien à signaler · **1** au moins une alerte · **2** la surveillance elle-même est en panne.
 *
 * Ce n'est pas un détail : posé sur une tâche programmée, un code non nul EST la notification.
 * Tous les ordonnanceurs savent prévenir quand une tâche échoue ; aucun ne sait lire une sortie
 * standard. Tant que le service d'envoi n'est pas branché (`docs/29`, partie II), c'est ce qui
 * rend la surveillance réelle plutôt qu'annoncée.
 *
 * Le **2** est délibérément distinct du **1**. Une surveillance qui ne peut pas joindre la base
 * ne dit pas « tout va bien » : elle dit qu'elle ne sait pas, et c'est une alerte d'un autre
 * genre — celle qu'on oublie de traiter parce qu'elle ressemble à du silence.
 *
 * ══ CE QU'IL NE FAIT PAS ══
 *
 * Il n'écrit rien, nulle part. `etat_de_sante()` constate ; ce script rapporte. Aucun des deux ne
 * répare : réparer sans qu'une personne l'ait décidé transformerait une panne visible en panne
 * masquée.
 *
 * Réalise : CONF-07
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executer = promisify(execFile);

const BASE = process.env["SENTIO_SURVEILLANCE_URL"] ?? process.env["DATABASE_URL"] ?? "";

/**
 * La lecture passe par du JSON, pas par des colonnes séparées.
 *
 * Un séparateur — tabulation, barre verticale, virgule — finit toujours par apparaître dans un
 * message. Le jour où un détail contiendra le caractère choisi, la ligne se coupera en deux et la
 * surveillance rapportera n'importe quoi. Une seule ligne JSON par signal ne pose pas la question.
 */
const REQUETE =
  "select coalesce(json_agg(row_to_json(s)), '[]'::json) from (" +
  "select gravite, sujet, detail, mesure from etat_de_sante() order by gravite desc, sujet" +
  ") s";

function rapporter(signaux) {
  const alertes = signaux.filter((s) => s.gravite === "alerte");
  const avertissements = signaux.filter((s) => s.gravite === "avertissement");

  for (const signal of [...alertes, ...avertissements]) {
    const marque = signal.gravite === "alerte" ? "ALERTE " : "à voir  ";
    console.log(`${marque} ${signal.sujet} — ${signal.detail}`);
  }
  return { alertes: alertes.length, avertissements: avertissements.length };
}

async function principal() {
  if (BASE === "") {
    console.error(
      "Aucune base à surveiller : renseigne SENTIO_SURVEILLANCE_URL (ou DATABASE_URL).",
    );
    process.exitCode = 2;
    return;
  }

  let signaux;
  try {
    const { stdout } = await executer("psql", ["-tA", "-d", BASE, "-c", REQUETE]);
    signaux = JSON.parse(stdout.trim() || "[]");
  } catch (erreur) {
    // ⚠️ Une surveillance injoignable ne dit pas « tout va bien ». Elle dit qu'elle ne sait pas —
    // et c'est l'alerte qu'on oublie de traiter, parce qu'elle ressemble à du silence.
    console.error(
      `La surveillance n'a pas pu interroger la base : ${String(erreur).split("\n")[0]}`,
    );
    process.exitCode = 2;
    return;
  }

  if (signaux.length === 0) {
    console.log("Rien à signaler.");
    return;
  }

  const { alertes, avertissements } = rapporter(signaux);
  console.log(
    `\n${alertes} alerte(s), ${avertissements} avertissement(s).` +
      (alertes > 0 ? " Quelqu'un doit intervenir." : " À regarder sans urgence."),
  );

  // Un avertissement seul ne réveille personne : il se lit au prochain passage. Réveiller pour un
  // quota à 85 % apprendrait à ignorer les réveils.
  if (alertes > 0) process.exitCode = 1;
}

principal();
