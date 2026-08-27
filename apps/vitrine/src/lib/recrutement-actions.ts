"use server";

// ════════════════════════════════════════════════════════════════════════════════════════════
// DE LA CONVERSATION À L'EMPLOYÉE — le parcours réel, sans le paiement.
//
// ══ CE QUI MANQUAIT, ET POURQUOI PERSONNE NE L'AVAIT VU ══
//
// Le diagnostic fonctionnait de bout en bout : il extrait un profil, `recommend()` relève des
// constats, les pondère en besoins, et COMPOSE une configuration. Le visiteur voyait son employée
// se dessiner à l'écran.
//
// Puis il fermait l'onglet, et **tout disparaissait**. Rien n'était écrit. Or `recruter()` refuse
// de recruter sans recommandation enregistrée, et c'est une bonne règle : elle interdit de créer
// une employée dont personne ne saurait dire POURQUOI elle a été configurée ainsi.
//
// Il manquait donc exactement une chose entre « Lady a compris votre besoin » et « voici votre
// employée » : l'écrire.
//
// ══ CE QUI EST ÉCRIT, ET DANS QUEL ORDRE ══
//
//   1. `diagnostic_session` — le profil extrait, tel que la conversation l'a compris ;
//   2. `recommendation` — la configuration composée, et la justification lisible ;
//   3. `recruter()` — entreprise, identité, employée, abonnement, objectif, configuration, en UNE
//      transaction (`20260815120009`).
//
// ⚠️ La configuration enregistrée est celle que le MOTEUR a composée à partir des réponses du
// visiteur. Jamais une configuration écrite d'avance. C'est toute la différence entre le parcours
// réel et la commande `pnpm run inviter`, qui fabrique un diagnostic de convenance : ici, deux
// dirigeants qui répondent différemment reçoivent deux employées différentes.
// ════════════════════════════════════════════════════════════════════════════════════════════

import { randomUUID } from "node:crypto";

import { ResendEmailProvider } from "@sentio/capabilities";
import {
  parseDiagnosticProfile,
  recommend,
  redigerLaPresentation,
  type Calibration,
} from "@sentio/domain";

import { pool } from "@/lib/db";
import { peutRecruterSansPaiement } from "@/lib/drapeaux";

export type ResultatDuRecrutement =
  | { readonly kind: "recrute"; readonly prenom: string; readonly adresse: string }
  | { readonly kind: "refus"; readonly message: string };

/** Ce que le visiteur saisit à la fin de sa conversation. Rien de plus : tout le reste est déjà su. */
export interface CoordonneesDuDirigeant {
  readonly entreprise: string;
  readonly email: string;
}

/**
 * Ce que la conversation a compris du dirigeant. **Le profil, et rien d'autre.**
 *
 * ⚠️ LA CONFIGURATION N'EST PAS TRANSMISE PAR LE NAVIGATEUR, ET C'EST LE POINT.
 *
 * La première version de ce fichier acceptait la calibration composée pendant la conversation et
 * l'écrivait telle quelle. C'était une faille : tout ce qui passe par le navigateur peut être
 * réécrit avant de revenir. Un visiteur pouvait se donner des capacités qu'aucun constat ne
 * justifiait, ou naître en « agit seul ».
 *
 * Le serveur REJOUE donc `recommend()` sur le profil, au moment de recruter. La composition est
 * déterministe : le même profil rend la même configuration, celle que le visiteur a vue à
 * l'écran. Il ne perd rien, et il ne peut plus rien s'accorder.
 *
 * Le profil lui-même vient du navigateur, forcément : c'est ce que le dirigeant a raconté. Mais
 * il est revalidé par `parseDiagnosticProfile()`, et un profil mensonger ne produit qu'une
 * employée mal calibrée pour son propre auteur.
 */
export interface DossierDuDiagnostic {
  readonly profil: unknown;
}

const REFUS_GENERIQUE =
  "Nous n'avons pas pu créer votre espace à l'instant. Réessayez dans un moment.";

function valider(coordonnees: CoordonneesDuDirigeant): string | null {
  const entreprise = coordonnees.entreprise.trim();
  const email = coordonnees.email.trim();

  if (entreprise.length < 2 || entreprise.length > 120) {
    return "Indiquez le nom de votre entreprise.";
  }
  // Volontairement souple : un contrôle strict d'adresse refuse des adresses valides et n'arrête
  // aucun robot. Ce qui protège ici, c'est le plafond du diagnostic, pas cette expression.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return "Cette adresse ne semble pas valide.";
  }
  return null;
}

/**
 * Écrit le diagnostic, recrute, et envoie la présentation.
 *
 * ⚠️ FERMÉ PAR DÉFAUT. Sans le drapeau, cette action ne fait rien : elle ne crée pas
 * d'entreprise, n'écrit pas de diagnostic et n'envoie aucun message. Une page qui donne le
 * produit gratuitement est une porte ouverte sur internet, et le dépôt a déjà payé cette leçon
 * une fois (constat B4 de `docs/32`).
 */
export async function recruterDepuisLeDiagnostic(
  dossier: DossierDuDiagnostic,
  coordonnees: CoordonneesDuDirigeant,
): Promise<ResultatDuRecrutement> {
  if (!peutRecruterSansPaiement()) {
    return {
      kind: "refus",
      message:
        "Le recrutement en ligne n'est pas encore ouvert. Votre diagnostic est terminé, il ne " +
        "vous reste plus qu'à nous le dire.",
    };
  }

  const invalide = valider(coordonnees);
  if (invalide !== null) return { kind: "refus", message: invalide };

  // Le profil est revalidé, puis la configuration RECOMPOSÉE ici. Voir `DossierDuDiagnostic`.
  const lu = parseDiagnosticProfile(dossier.profil);
  if (!lu.ok) {
    return { kind: "refus", message: "Votre diagnostic est incomplet. Reprenons la conversation." };
  }
  const decision = recommend(lu.profile);
  if (decision.status !== "recommande") {
    return {
      kind: "refus",
      message:
        decision.status === "hors_perimetre"
          ? decision.reason
          : "Il manque encore un élément pour composer votre employée. Reprenons la conversation.",
    };
  }

  const entreprise = coordonnees.entreprise.trim();
  const email = coordonnees.email.trim().toLowerCase();

  let prenom: string;
  try {
    prenom = await ecrireEtRecruter(lu.profile, decision, entreprise, email);
  } catch (erreur) {
    // ⚠️ L'erreur réelle part au journal, jamais au visiteur : elle porte des noms de tables et
    // des contraintes, qui ne lui apprennent rien et en disent trop.
    console.error(JSON.stringify({ route: "recrutement", error: String(erreur) }));
    return { kind: "refus", message: REFUS_GENERIQUE };
  }

  // ⚠️ L'ENVOI VIENT APRÈS, ET SON ÉCHEC NE DÉFAIT RIEN. L'entreprise existe, l'employée aussi.
  // Un email qui ne part pas se renvoie ; un recrutement à moitié fait laisserait un dirigeant
  // avec une employée qu'il ne peut pas atteindre.
  try {
    await envoyerLaPresentation({ prenom, entreprise, email, profil: lu.profile, calibration: decision.calibration });
  } catch (erreur) {
    console.error(JSON.stringify({ route: "recrutement", etape: "email", error: String(erreur) }));
    return {
      kind: "refus",
      message:
        `${prenom} a bien rejoint ${entreprise}, mais l'email n'est pas parti. ` +
        `Passez par « mot de passe oublié » sur la page de connexion pour ouvrir votre accès.`,
    };
  }

  return { kind: "recrute", prenom, adresse: email };
}

/** Les trois écritures, dans une seule transaction : un diagnostic sans recrutement ne sert à rien. */
async function ecrireEtRecruter(
  profil: { readonly friction: string | null },
  decision: { readonly calibration: Calibration; readonly grounds: readonly string[] },
  entreprise: string,
  email: string,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: sessions } = await client.query<{ id: string }>(
      `insert into diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
       values ($1, $2::jsonb, $3)
       returning id`,
      [`diagnostic-${randomUUID()}`, JSON.stringify(profil), profil.friction],
    );

    // La traduction de ce que le moteur a composé vers ce que la base attend. Elle est mécanique,
    // et c'est le point : aucune décision ne se prend ici.
    const proposition = {
      role: decision.calibration.role,
      capacites: [...decision.calibration.capabilities],
      priorites: [...decision.calibration.priorities],
      // ⚠️ TOUJOURS « confirm », quelle que soit la composition. Un employé ne naît jamais en
      // « agit seul » : c'est le cliquet d'autonomie, et seul le dirigeant peut l'élargir ensuite.
      autonomie: "confirm",
    };

    const { rows: recos } = await client.query<{ id: string }>(
      `insert into recommendation (diagnostic_session_id, status, justification, configuration_proposee)
       values ($1, 'proposed', $2, $3::jsonb)
       returning id`,
      [
        sessions[0]!.id,
        // La justification est faite des CONSTATS qui ont conduit là, jamais d'une phrase
        // rédigée : elle doit rester vérifiable par le dirigeant, ligne à ligne.
        decision.grounds.join(" · "),
        JSON.stringify(proposition),
      ],
    );

    const { rows } = await client.query<{ employee_id: string }>(
      `select employee_id from recruter($1, $2, 'start', $3, $4)`,
      [recos[0]!.id, entreprise, `invitation:${randomUUID()}`, email],
    );

    const { rows: qui } = await client.query<{ prenom: string }>(
      `select i.first_name as prenom
         from employee e join identity i on i.id = e.identity_id
        where e.id = $1`,
      [rows[0]!.employee_id],
    );

    await client.query("commit");
    return qui[0]?.prenom ?? "Votre employée";
  } catch (erreur) {
    await client.query("rollback");
    throw erreur;
  } finally {
    client.release();
  }
}

async function envoyerLaPresentation(params: {
  prenom: string;
  entreprise: string;
  email: string;
  profil: unknown;
  calibration: Calibration;
}): Promise<void> {
  const cle = process.env["RESEND_API_KEY"];
  const expediteur = process.env["SENTIO_EMAIL_EXPEDITEUR"];
  if (!cle || !expediteur) throw new Error("Expédition non configurée.");

  const origine = (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
  const lien = await lienDAcces(params.email, origine);

  const objectif = lireLObjectif(params.profil);
  const email = redigerLaPresentation({
    prenom: params.prenom,
    entreprise: params.entreprise,
    role: params.calibration.role,
    priorites: params.calibration.priorities,
    objectif,
    lienDAcces: lien,
    adresseDeConnexion: `${origine}/login`,
  });

  const separateur = expediteur.lastIndexOf("<");
  const adresse =
    separateur === -1 ? expediteur : expediteur.slice(separateur + 1).replace(">", "").trim();
  const nom = separateur === -1 ? undefined : expediteur.slice(0, separateur).trim();

  await new ResendEmailProvider({ apiKey: cle }).send({
    from: nom === undefined ? { address: adresse } : { address: adresse, name: nom },
    to: { address: params.email },
    subject: email.objet,
    text: email.texte,
    html: email.html,
    // Deux envois pour la même entreprise ne partent pas deux fois si l'action est rejouée.
    idempotencyKey: `presentation:${params.email}:${params.entreprise}`,
  });
}

/** L'objectif, en une phrase lisible. Il vient du profil du visiteur, jamais d'un défaut. */
function lireLObjectif(profil: unknown): string {
  const p = profil as { objective?: { target?: unknown; metric?: unknown; horizon?: unknown } };
  const o = p?.objective;
  if (!o || o.target === undefined || o.metric === undefined) return "ce que vous lui avez demandé";
  const metrique = String(o.metric).replace(/_/g, " ");
  return `${String(o.target)} ${metrique} ${String(o.horizon ?? "")}`.trim();
}

/**
 * Le lien à usage unique, demandé à Supabase.
 *
 * On génère le lien plutôt que de laisser Supabase envoyer son propre email : le message qui
 * arrive au dirigeant doit être celui de Sentio, pas un gabarit par défaut en anglais.
 */
async function lienDAcces(email: string, origine: string): Promise<string> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !service) throw new Error("Création d'accès non configurée.");

  const reponse = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" },
    body: JSON.stringify({
      type: "invite",
      email,
      options: { redirect_to: `${origine}/auth/callback?next=/acces` },
    }),
  });

  if (!reponse.ok) {
    // Le corps peut contenir des détails du projet : on garde le code, jamais le corps.
    throw new Error(`Création du lien refusée (code ${reponse.status}).`);
  }

  const corps = (await reponse.json()) as {
    action_link?: string;
    properties?: { action_link?: string };
  };
  const lien = corps.action_link ?? corps.properties?.action_link;
  if (lien === undefined) throw new Error("Aucun lien rendu.");
  return lien;
}
