"use server";

// Server Action d'ajout de prospect — le geste le plus simple possible
// pour qu'un vrai client alimente son agent : un formulaire, pas un
// import CSV. Sans données ici, l'agent commercial n'a littéralement
// rien à relancer.

import { revalidatePath } from "next/cache";
import { pool } from "./db";
import { isAuthorizedForTenant } from "./tenant-access";

export interface NewLead {
  name: string;
  company: string;
  email: string;
  notes?: string;
}

export async function addLead(tenantId: string, lead: NewLead): Promise<void> {
  if (!(await isAuthorizedForTenant(tenantId))) throw new Error("Non autorisé.");
  if (!lead.name.trim() || !lead.company.trim() || !lead.email.trim()) {
    throw new Error("Nom, entreprise et email sont obligatoires.");
  }

  await pool.query(
    `insert into lead (tenant_id, name, company, email, notes) values ($1, $2, $3, $4, $5)`,
    [tenantId, lead.name.trim(), lead.company.trim(), lead.email.trim(), lead.notes?.trim() ?? ""]
  );

  revalidatePath("/dashboard");
}
