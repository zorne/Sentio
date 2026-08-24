// ════════════════════════════════════════════════════════════════════
// Server Action de connexion — appelée UNIQUEMENT par un clic explicite
// de l'utilisateur (jamais au chargement d'une page). Voir
// /auth/callback/page.tsx pour le pourquoi (protection anti-scanner
// d'emails type Apple Mail Privacy Protection).
// ════════════════════════════════════════════════════════════════════

"use server";

import { createSupabaseServerClient } from "./supabase-server";
import { pool } from "./db";

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
