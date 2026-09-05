"use server";

// ════════════════════════════════════════════════════════════════════
// Les deux gestes que le dirigeant pose depuis son espace.
//
// ⚠️ LECTURES ET ÉCRITURES NE PASSENT PAS PAR LE MÊME CHEMIN, ET C'EST VOULU.
//
// Les lectures de l'espace utilisent le client à SESSION : RLS s'applique,
// donc l'isolation entre entreprises est une propriété de l'accès, pas une
// discipline de ce fichier. C'est la règle du cœur (`docs/02-architecture.md`),
// et elle diffère du reste de la vitrine, qui lit par un pool de service.
//
// Les écritures ci-dessous appellent des fonctions `security definer`
// révoquées au public : ouvrir ou retirer un pouvoir à un employé n'est pas
// un geste que le navigateur peut déclencher. L'appartenance est donc
// vérifiée AVANT, explicitement.
// ════════════════════════════════════════════════════════════════════

import { demander, lireLaQuestion } from "@sentio/domain";
import { revalidatePath } from "next/cache";

import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isAuthorizedForTenant } from "@/lib/tenant-access";

/** Les trois niveaux, tels que la base les accepte. Une valeur inventée est refusée en base. */
export type NiveauDAutonomie = "confirm" | "confirm_once" | "auto";

export async function reglerLAutonomie(
  tenantId: string,
  employeeId: string,
  niveau: NiveauDAutonomie,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) {
    return { ok: false, message: "Vous n'avez pas accès à cette entreprise." };
  }

  try {
    // ⚠️ Ceci ne modifie pas une colonne : la fonction PUBLIE une version de configuration, avec
    // le déclencheur « demande_client ». C'est ce qui permettra de dire, dans six mois, qui a
    // autorisé cet employé à agir seul — et quand (`20260815120011`).
    await pool.query("select regler_l_autonomie($1, $2, $3, $4)", [
      tenantId,
      employeeId,
      niveau,
      "Réglé depuis l'espace client.",
    ]);
    revalidatePath("/espace");
    return { ok: true };
  } catch {
    // Le détail reste au serveur : un message de base de données décrit le schéma à qui le lit.
    return { ok: false, message: "Le réglage n'a pas pu être enregistré." };
  }
}

/**
 * Trancher une action mise en attente.
 *
 * Celle-ci passe par le client à SESSION : `approval` porte une politique d'écriture pour le
 * client (`20260729120017`). Rien n'a besoin d'un privilège de service ici — et l'utiliser
 * quand même retirerait à RLS la garde qu'il exerce déjà.
 */
export async function trancherUneAction(
  approvalId: string,
  decision: "granted" | "refused",
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("approval")
    .update({ state: decision, resolved_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("state", "requested");

  if (error) return { ok: false, message: "La décision n'a pas pu être enregistrée." };

  revalidatePath("/espace");
  return { ok: true };
}

/**
 * Autoriser une capacité UNE FOIS POUR TOUTES.
 *
 * ⚠️ CE GESTE ÉLARGIT L'AUTONOMIE, DONC IL EST LE PLUS SURVEILLÉ DE CET ÉCRAN.
 *
 * C'est le cliquet : n'importe quoi peut rendre l'employé plus prudent, rien ne peut le rendre
 * plus libre à la place du dirigeant. L'appartenance est donc vérifiée ici, explicitement, avant
 * d'appeler une fonction `security definer` révoquée au public.
 *
 * ⚠️ ET C'EST PAR CAPACITÉ, JAMAIS GLOBALEMENT. Autoriser « mettre à jour une fiche » pour
 * toujours n'autorise pas « écrire à un prospect ». C'est ce qui permet d'ouvrir ce qui est
 * réversible en gardant la main sur ce qui sort de l'entreprise.
 */
export async function accorderDefinitivement(
  tenantId: string,
  employeeId: string,
  capaciteCle: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) {
    return { ok: false, message: "Vous n'avez pas accès à cette entreprise." };
  }

  try {
    await pool.query("select accorder_definitivement($1, $2, $3)", [
      tenantId,
      employeeId,
      capaciteCle,
    ]);
    revalidatePath("/espace");
    return { ok: true };
  } catch {
    return { ok: false, message: "Cet accord n'a pas pu être enregistré." };
  }
}

/**
 * Reprendre une autorisation permanente.
 *
 * ⚠️ CE GESTE DOIT ÊTRE AUSSI FACILE QUE L'AUTRE, JAMAIS PLUS DIFFICILE. Un produit où l'on donne
 * sa confiance en un clic et où on la reprend en trois a choisi son camp. Ici, même chemin, même
 * nombre de gestes.
 *
 * Il ne détruit rien : la base date la révocation. Qu'une confiance ait existé, et quand, fait
 * partie de l'histoire de cet employé.
 */
export async function retirerLAccord(
  tenantId: string,
  employeeId: string,
  capaciteCle: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) {
    return { ok: false, message: "Vous n'avez pas accès à cette entreprise." };
  }

  try {
    await pool.query("select retirer_l_accord($1, $2, $3)", [tenantId, employeeId, capaciteCle]);
    revalidatePath("/espace");
    return { ok: true };
  } catch {
    return { ok: false, message: "Cet accord n'a pas pu être retiré." };
  }
}

/**
 * Répondre à une proposition de son employé.
 *
 * ⚠️ C'est LE geste que §10 de la vision réserve au dirigeant. Une réévaluation a beau être
 * mesurée, chiffrée et justifiée, elle ne prend effet que si une personne dit oui. Sans ce
 * chemin, la proposition resterait une notification sans porte de sortie — et le produit se
 * reconfigurerait un jour tout seul, faute de mieux.
 */
export async function repondreALaProposition(
  tenantId: string,
  configurationId: string,
  reponse: "accepter" | "refuser",
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) {
    return { ok: false, message: "Vous n'avez pas accès à cette entreprise." };
  }

  const fonction =
    reponse === "accepter" ? "accepter_la_configuration" : "refuser_la_configuration";

  try {
    await pool.query(`select ${fonction}($1, $2)`, [tenantId, configurationId]);
    revalidatePath("/espace");
    return { ok: true };
  } catch {
    return { ok: false, message: "Votre réponse n'a pas pu être enregistrée." };
  }
}

/**
 * Arrêter son employé, ou le reprendre.
 *
 * ⚠️ C'est le geste que le dirigeant doit pouvoir poser sans réfléchir, à n'importe quelle heure.
 * Il ne demande aucune confirmation et ne pose aucune question : un arrêt qu'on doit négocier
 * n'est pas un arrêt. Reprendre, en revanche, est une décision — et elle reste toujours la sienne,
 * rien ne se relance tout seul.
 */
export async function arreterOuReprendre(
  tenantId: string,
  employeeId: string,
  geste: "arreter" | "reprendre",
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) {
    return { ok: false, message: "Vous n'avez pas accès à cette entreprise." };
  }

  try {
    if (geste === "arreter") {
      await pool.query("select mettre_en_pause($1, $2, $3)", [
        tenantId,
        employeeId,
        "Arrêté depuis l'espace client.",
      ]);
    } else {
      await pool.query("select reprendre_le_travail($1, $2)", [tenantId, employeeId]);
    }
    revalidatePath("/espace");
    return { ok: true };
  } catch {
    return { ok: false, message: "L'action n'a pas pu être enregistrée." };
  }
}

/**
 * Poser une question à son employée.
 *
 * ⚠️ **Aucun modèle n'intervient.** La question est rapprochée d'une intention connue
 * (`@sentio/domain`, `demander`), puis la réponse est un gabarit rempli avec des comptes **lus en
 * base**. Brancher un modèle ici marcherait presque toujours — et le jour où il se tromperait
 * d'une unité, il l'affirmerait avec le même aplomb. Un dirigeant à qui l'on annonce « 12
 * réponses » quand il y en a 9 ne refait pas confiance aux 49 chiffres suivants.
 *
 * Les lectures passent par le pool de service parce qu'elles appellent des fonctions
 * `security definer` révoquées au public ; l'appartenance est donc vérifiée AVANT, explicitement.
 */
export async function demanderALEmployee(
  tenantId: string,
  employeeId: string,
  question: string,
): Promise<{ ok: boolean; phrase?: string; suggestions?: readonly string[]; message?: string }> {
  if (!(await isAuthorizedForTenant(tenantId))) {
    return { ok: false, message: "Vous n'avez pas accès à cette entreprise." };
  }

  // Une question n'est pas un document. La borne protège la base de lectures inutiles et le
  // rapprochement d'un texte qui n'en est pas un.
  const dit = question.slice(0, 400);

  try {
    const { debut, fin } = fenetreDe(dit);

    // ⚠️ L'EMPLOYÉE EST NOMMÉE, JAMAIS REDÉCOUVERTE. Cette action cherchait la sienne avec un
    // « limit 1 » sans « order by », indépendamment de celle que la page affichait : le dirigeant
    // pouvait lire la fiche de l'une et interroger l'état de l'autre, avec une attribution qui
    // changeait d'un rechargement au suivant. C'est la règle 7 du dépôt, un cran plus bas — une
    // garantie qui protège d'autrui ne protège pas de soi-même.
    //
    // Le filtre porte les DEUX identifiants : nommer l'employée sans nommer l'entreprise
    // laisserait un identifiant deviné atteindre l'employée de quelqu'un d'autre.
    const [employe] = await pool
      .query<{ en_pause_depuis: string | null; role: string | null; prenom: string | null }>(
        `select e.en_pause_depuis,
                (select c.role from lady_configuration c
                  where c.employee_id = e.id and c.active) as role,
                (select i.first_name from identity i where i.id = e.identity_id) as prenom
           from employee e
          where e.tenant_id = $1 and e.id = $2`,
        [tenantId, employeeId],
      )
      .then((r) => r.rows);

    if (employe === undefined) {
      return { ok: false, message: "Cette employée n'est pas la vôtre." };
    }

    const [travail] = await pool.query<{
      missions_ouvertes: number;
      missions_agies: number;
      messages_envoyes: number;
      reponses: number;
      rendez_vous: number;
      ventes: number;
      chiffre_affaires: string;
    }>("select * from travail_sur_la_periode($1, $2, $3, $4)", [
      tenantId,
      debut,
      fin,
      employeeId,
    ]).then((r) => r.rows);

    const [avancement] = await pool
      .query<{
        metrique: string;
        cible: string;
        realise: string;
        jours_ecoules: number;
        horizon_jours: number;
        rythme_requis: string;
        rythme_observe: string;
      }>("select * from avancement_vers_l_objectif($1)", [tenantId])
      .then((r) => r.rows);

    // Les entreprises qui ont donné une suite : le même compte que celui du tableau de bord.
    const [bilan] = await pool
      .query<{ entreprises_engagees: number }>(
        "select entreprises_engagees from bilan_de_l_employe($1, $2, $3)",
        [tenantId, 30, employeeId],
      )
      .then((r) => r.rows);

    const reponse = demander(dit, {
      prenom: employe.prenom ?? "",
      travail: {
        missionsOuvertes: Number(travail?.missions_ouvertes ?? 0),
        missionsAgies: Number(travail?.missions_agies ?? 0),
        messagesEnvoyes: Number(travail?.messages_envoyes ?? 0),
        reponses: Number(travail?.reponses ?? 0),
        rendezVous: Number(travail?.rendez_vous ?? 0),
        ventes: Number(travail?.ventes ?? 0),
        chiffreAffaires: Number(travail?.chiffre_affaires ?? 0),
      },
      avancement:
        avancement === undefined
          ? null
          : {
              metrique: avancement.metrique,
              cible: Number(avancement.cible),
              realise: Number(avancement.realise),
              joursEcoules: Number(avancement.jours_ecoules),
              horizonJours: Number(avancement.horizon_jours),
              rythmeRequis: Number(avancement.rythme_requis),
              rythmeObserve: Number(avancement.rythme_observe),
            },
      entreprisesEngagees: Number(bilan?.entreprises_engagees ?? 0),
      role: employe?.role ? motDuRolePourElle(employe.role) : null,
      arretee: employe?.en_pause_depuis !== null && employe?.en_pause_depuis !== undefined,
    });

    // ⚠️ LES DEUX TOURS SONT CONSERVÉS ENSEMBLE, ET APRÈS LA RÉPONSE. Écrire la question avant de
    // savoir répondre laisserait, à la première panne, une question sans réponse dans le fil : le
    // dirigeant croirait avoir été ignoré. Une seule instruction, donc, ou aucune.
    //
    // Un échec d'écriture ne fait PAS échouer la réponse : elle est déjà juste, et la perdre pour
    // une histoire de mémoire serait punir le dirigeant d'un défaut qui n'est pas le sien.
    try {
      await pool.query(
        `insert into conversation_message (tenant_id, employee_id, auteur, texte)
         values ($1, $2, 'dirigeant', $3), ($1, $2, 'employee', $4)`,
        [tenantId, employeeId, dit, reponse.phrase],
      );
    } catch {
      // Rien à dire au dirigeant : sa réponse arrive, seule la trace manque.
    }

    return reponse.statut === "repond"
      ? { ok: true, phrase: reponse.phrase }
      : { ok: true, phrase: reponse.phrase, suggestions: reponse.suggestions };
  } catch {
    return { ok: false, message: "Je n'ai pas pu aller chercher la réponse." };
  }
}

/**
 * Le fil déjà échangé avec CETTE employée.
 *
 * ⚠️ L'APPARTENANCE EST VÉRIFIÉE ICI, ET CE N'EST PAS UNE PRÉCAUTION DÉCORATIVE.
 *
 * Cette fonction est exportée d'un fichier `"use server"` : c'est donc un point d'entrée
 * atteignable depuis le navigateur, pas une fonction interne de la page. Ses deux identifiants
 * viennent de l'appelant, et la lecture passe par le pool de service, dont le rôle porte
 * `rolbypassrls` — **RLS ne la borne pas**. Sans le contrôle ci-dessous, deux identifiants
 * suffisaient à lire le fil privé entre un dirigeant et son employée, dans n'importe quelle
 * entreprise. C'est l'invariant 2 (`adr/0014`), celui qui ne se négocie pas.
 *
 * Elle passait à travers les règles 7 et 8 des frontières parce que celles-ci vérifient qu'une
 * lecture NOMME son entreprise et son employée — pas qu'elle a le DROIT de les lire. La règle 9
 * comble ce trou pour tout le fichier.
 *
 * ⚠️ Un refus rend le même vide qu'une conversation inexistante. Distinguer les deux dirait à
 * qui essaie si l'entreprise visée existe — une réponse qui ne lui appartient pas.
 *
 * ⚠️ Les deux identifiants filtrent, jamais un seul. Une entreprise peut avoir plusieurs
 * employées ; ne nommer que l'entreprise mêlerait leurs conversations, et chacune paraîtrait se
 * souvenir de ce qu'on a dit à l'autre.
 *
 * ⚠️ Bornée aux derniers échanges. Un fil sans borne finit par charger des années de conversation
 * pour afficher les trois dernières lignes.
 */
export async function filDeLaConversation(
  tenantId: string,
  employeeId: string,
): Promise<readonly { auteur: "dirigeant" | "employee"; texte: string }[]> {
  if (!(await isAuthorizedForTenant(tenantId))) return [];

  try {
    const { rows } = await pool.query<{ auteur: "dirigeant" | "employee"; texte: string }>(
      `select auteur, texte
         from (select auteur, texte, created_at
                 from conversation_message
                where tenant_id = $1 and employee_id = $2
                order by created_at desc, id desc
                limit 40) dernier
        order by created_at asc`,
      [tenantId, employeeId],
    );
    return rows;
  } catch {
    // Une mémoire indisponible ouvre une conversation vide ; elle ne casse pas la page.
    return [];
  }
}

/**
 * La fenêtre de temps, calculée ICI — c'est-à-dire dans le fuseau du serveur, pas en UTC dans la
 * base.
 *
 * ⚠️ La base ne doit pas décider quand commence « hier » : un dirigeant qui demande à 8 h ce qui
 * s'est passé la veille recevrait une réponse décalée d'un jour, sans que rien ne le signale.
 * C'est aussi pourquoi `travail_sur_la_periode` prend deux instants et pas une date.
 */
function fenetreDe(question: string): { debut: Date; fin: Date } {
  const q = lireLaQuestion(question);
  const debutDuJour = new Date();
  debutDuJour.setHours(0, 0, 0, 0);

  const finDuJour = new Date(debutDuJour);
  finDuJour.setDate(finDuJour.getDate() + 1);

  switch (q?.fenetre) {
    case "hier": {
      const hier = new Date(debutDuJour);
      hier.setDate(hier.getDate() - 1);
      return { debut: hier, fin: debutDuJour };
    }
    case "semaine": {
      const debut = new Date(debutDuJour);
      debut.setDate(debut.getDate() - 7);
      return { debut, fin: finDuJour };
    }
    case "periode": {
      // « Depuis le début » : large, mais borné — une fenêtre ouverte scannerait tout l'historique
      // pour répondre à une question de conversation.
      const debut = new Date(debutDuJour);
      debut.setFullYear(debut.getFullYear() - 1);
      return { debut, fin: finDuJour };
    }
    default:
      return { debut: debutDuJour, fin: finDuJour };
  }
}

/** Le rôle est une clé technique ; elle en parle comme d'un travail. */
function motDuRolePourElle(role: string): string {
  const mots: Record<string, string> = {
    prospection: "aller chercher de nouvelles entreprises",
    qualification: "ne retenir que les bonnes entreprises",
    relation_client: "reprendre vos demandes entrantes",
    administration_commerciale: "tenir vos fiches à jour",
    administration: "vos tâches administratives",
    suivi: "surveiller vos échéances",
    pilotage: "vous rendre compte de ce qui avance",
  };
  return mots[role] ?? role;
}
