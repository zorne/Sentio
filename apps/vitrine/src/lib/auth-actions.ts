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

/** Rattache l'utilisateur qui vient de se connecter à tout tenant créé à
 *  son adresse email pendant l'onboarding (agent_instance.config.contactEmail)
 *  et pas encore réclamé. Un seul lien magique suffit donc à accéder à SON
 *  tableau de bord — pas de compte séparé à créer côté onboarding. */
export async function claimTenantsForCurrentUser(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  const { rows } = await pool.query<{ tenant_id: string }>(
    `select distinct tenant_id from agent_instance where config->>'contactEmail' = $1`,
    [user.email]
  );

  for (const row of rows) {
    await pool.query(
      `insert into tenant_member (tenant_id, user_id, role) values ($1, $2, 'owner')
       on conflict (tenant_id, user_id) do nothing`,
      [row.tenant_id, user.id]
    );
  }

  // ── Le cœur, à côté de l'héritage ────────────────────────────────────
  //
  // Les deux générations coexistent (ADR-0025) : la boucle ci-dessus sert
  // l'ancienne, cet appel sert la nouvelle. Ce sont deux sources d'attente
  // distinctes, et les confondre reviendrait à faire dépendre un
  // rattachement du cœur d'une table condamnée.
  //
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
