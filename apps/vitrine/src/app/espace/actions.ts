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
