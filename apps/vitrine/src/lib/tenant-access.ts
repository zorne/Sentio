// ════════════════════════════════════════════════════════════════════
// A-t-on le droit d'agir sur cette entreprise ?
//
// ══ CE QUI A DISPARU ICI, ET POURQUOI C'EST UNE BONNE NOUVELLE ══
//
// Il y avait deux niveaux : une session suffisait pour le locataire de
// DÉMONSTRATION, et il fallait une appartenance réelle pour tout autre.
// L'exception se défendait tant que le site montrait une démonstration à
// des visiteurs.
//
// Elle ne se défend plus, pour deux raisons qui suffisent chacune :
//
//   · les pages qui l'utilisaient ont été retirées (`adr/0030`) ;
//   · l'audit avait relevé ce qu'elle coûtait (constat B10 de
//     `docs/32`) : n'importe quel visiteur inscrit pouvait lancer un
//     vrai cycle sur ce locataire, et LIRE ce que les autres visiteurs
//     y avaient fait. Le journal porte les entrées et sorties d'outils,
//     donc les entreprises consultées et les messages rédigés.
//
// La garantie tenait à une seule ligne de code, celle qui décidait que
// ce locataire ne contenait « que du test ». Elle n'existe plus : il
// n'y a maintenant qu'une seule règle, et elle ne connaît aucune
// exception.
//
// ⚠️ Une exception d'accès qui survit à la fonctionnalité qui la
// justifiait n'est plus une exception : c'est un trou.
// ════════════════════════════════════════════════════════════════════

import { redirect } from "next/navigation";

import { pool } from "./db";
import { createSupabaseServerClient } from "./supabase-server";

/**
 * Vrai si le compte connecté appartient réellement à cette entreprise.
 *
 * ⚠️ L'appartenance est lue en base, jamais déduite de l'URL. Un identifiant d'entreprise qui
 * voyage dans une adresse est un identifiant qu'on peut changer à la main.
 */
export async function isAuthorizedForTenant(tenantId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { rows } = await pool.query(
    `select 1 from tenant_member where tenant_id = $1 and user_id = $2`,
    [tenantId, user.id],
  );
  return rows.length > 0;
}

/** Pour une page : rediriger vaut mieux que laisser fuiter l'entreprise de quelqu'un d'autre. */
export async function requireTenantAccess(tenantId: string): Promise<void> {
  if (!(await isAuthorizedForTenant(tenantId))) redirect("/login");
}
