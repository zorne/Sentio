// ════════════════════════════════════════════════════════════════════
// La connexion du client : son adresse email, et le mot de passe qu'il a
// choisi lui-même.
//
// ══ POURQUOI UN MOT DE PASSE, ALORS QUE LE LIEN MAGIQUE SUFFISAIT ══
//
// Décision du fondateur. Un dirigeant qui confie son travail à Sentio
// veut une porte à lui, pas un lien à retrouver dans sa boîte chaque
// fois qu'il ouvre son espace. Le lien magique reste utilisé là où il
// est irremplaçable : PROUVER qu'une adresse appartient à celui qui
// clique, à la première arrivée et pour un mot de passe oublié.
//
// ⚠️ CE QUE SENTIO N'ENVOIE JAMAIS PAR EMAIL : un mot de passe. Le
// client pose le sien sur `/acces`, depuis une session déjà ouverte.
// Un mot de passe expédié reste dans une boîte pour toujours, part dans
// les transferts, et dort dans les sauvegardes d'une messagerie.
//
// Les actions ci-dessous sont appelées UNIQUEMENT par un clic explicite,
// jamais au chargement d'une page — voir /auth/callback/page.tsx pour le
// pourquoi (les scanners d'emails préchargent les liens).
// ════════════════════════════════════════════════════════════════════

"use server";

import { createSupabaseServerClient } from "./supabase-server";
import { pool } from "./db";

/**
 * Ce qu'on dit quand la connexion échoue.
 *
 * ⚠️ LE MÊME MESSAGE POUR UNE ADRESSE INCONNUE ET UN MAUVAIS MOT DE PASSE, et c'est délibéré.
 * Deux messages différents transforment le formulaire en annuaire : on y teste des adresses
 * jusqu'à savoir lesquelles sont clientes de Sentio. C'est une information qui appartient à nos
 * clients, pas à celui qui tape.
 */
const REFUS = "Adresse ou mot de passe incorrect.";

/** Huit caractères : le plancher de Supabase. En dessous, l'erreur viendrait du serveur, en
 *  anglais, après l'envoi — autant le dire avant. */
const LONGUEUR_MINIMALE = 8;

export async function connecterAvecMotDePasse(
  email: string,
  motDePasse: string,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: motDePasse,
  });
  if (error) return { error: REFUS };

  // Le rattachement se rejoue à chaque connexion : il ne consomme son attente qu'une fois, et
  // ça couvre le cas d'un client dont l'entreprise a été créée APRÈS sa première venue.
  await claimTenantsForCurrentUser();
  return { error: null };
}

/**
 * Le mot de passe que le client choisit, sur une session déjà ouverte.
 *
 * ⚠️ Aucun mot de passe actuel n'est demandé, et ce n'est pas un oubli : on arrive ici par un
 * lien à usage unique reçu sur SA boîte, ce qui est la même preuve que celle qu'un « mot de
 * passe actuel » apporterait. En exiger un rendrait la première arrivée impossible, puisqu'il
 * n'y en a pas encore.
 */
export async function definirLeMotDePasse(
  motDePasse: string,
): Promise<{ error: string | null }> {
  if (motDePasse.length < LONGUEUR_MINIMALE) {
    return { error: `Choisissez un mot de passe d'au moins ${LONGUEUR_MINIMALE} caractères.` };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Votre lien a expiré ou a déjà été utilisé. Demandez-en un nouveau depuis la page de connexion.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) return { error: "Ce mot de passe n'a pas pu être enregistré. Réessayez." };

  await claimTenantsForCurrentUser();
  return { error: null };
}

/**
 * Le mot de passe oublié.
 *
 * ⚠️ ON RÉPOND PAREIL, QUE L'ADRESSE SOIT CONNUE OU NON. Même raison que `REFUS` : sinon cette
 * page devient le moyen de savoir qui est client de Sentio.
 */
export async function demanderUnNouveauMotDePasse(email: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { origin } = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${origin}/auth/callback?next=/acces`,
  });
}

export async function confirmMagicLink(code: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return { error: error?.message ?? null };
}

/** Rattache l'utilisateur qui vient de se connecter à l'entreprise créée à son adresse pendant
 *  le recrutement, et pas encore réclamée. Un seul lien magique suffit donc à accéder à SON
 *  espace — pas de compte séparé à créer.
 *
 *  ══ CE QUI A ÉTÉ RETIRÉ ICI, ET POURQUOI ÇA CASSAIT LA CONNEXION ══
 *
 *  Cette fonction interrogeait d'abord `agent_instance`, en cherchant les entreprises par
 *  `config->>'contactEmail'`. **Cette table n'existe pas dans la base.** Elle appartient au
 *  schéma de la vitrine d'avant la fusion (`apps/vitrine/migrations/0001`), qui n'a jamais été
 *  appliqué à ce projet Supabase — le schéma vivant est `supabase/migrations`, et lui seul
 *  (`adr/0025`, `adr/0030`).
 *
 *  La requête levait donc `relation "agent_instance" does not exist`, sans `try/catch`, sur les
 *  trois chemins d'entrée : mot de passe, définition du mot de passe, et lien magique. Comme elle
 *  sort plus haut quand personne n'est connecté, elle ne cassait QUE lorsque l'authentification
 *  venait de réussir — c'est-à-dire à chaque connexion aboutie, et jamais dans un test.
 *
 *  Le commentaire retiré affirmait que « les deux générations coexistent » et que la boucle
 *  servait l'ancienne. C'était vrai de l'intention, faux de la réalité : l'ancienne génération
 *  n'a aucune table dans cette base, donc la boucle ne pouvait rien rattacher — elle ne pouvait
 *  que lever. Un chemin de compatibilité vers un schéma absent n'est pas de la compatibilité.
 *
 *  Il ne reste donc qu'une source d'attente, celle du cœur, et c'est `recruter()` qui l'alimente
 *  (elle insère dans `rattachement_attendu`). Rien n'est perdu.
 */
export async function claimTenantsForCurrentUser(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  // ⚠️ Le rapprochement se fait sur une adresse PROUVÉE : le lien magique
  // atteste que celui qui vient de cliquer lit cette boîte. C'est ce qui
  // rend l'opération sûre — et c'est pour ça qu'elle a lieu ICI, après
  // l'échange du code, et nulle part ailleurs (`20260815120013`).
  //
  // L'attente ne se consomme qu'une fois : une adresse partagée, ou
  // récupérée après un changement de propriétaire, ne rattache pas un
  // second compte.
  await pool.query("select rattacher_par_email($1, $2)", [user.id, user.email]);
}
