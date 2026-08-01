// ════════════════════════════════════════════════════════════════════
// Notification de validation humaine — appelée partout où une tâche
// passe à `waiting_human` (launchSalesRunInternal, decideOnTask). Crée
// une ligne `notification` (consommée par /decisions) et tente un email
// via Resend, best-effort (dégradation propre comme Groq/Apollo si
// RESEND_API_KEY ou l'email de contact manquent).
// ════════════════════════════════════════════════════════════════════

"use server";

import { Client } from "pg";
import { Resend } from "resend";

export async function notifyWaitingHuman(
  db: Client,
  params: { tenantId: string; taskId: string; agentInstanceId: string }
): Promise<void> {
  const ins = await db.query(
    `insert into notification (tenant_id, task_id, agent_instance_id)
     values ($1, $2, $3)
     on conflict (task_id) do nothing
     returning id`,
    [params.tenantId, params.taskId, params.agentInstanceId]
  );
  if (ins.rowCount === 0) return; // déjà notifié pour cette tâche

  const cfgRes = await db.query(
    `select config->>'contactEmail' as email from agent_instance where id = $1`,
    [params.agentInstanceId]
  );
  const contactEmail = cfgRes.rows[0]?.email as string | undefined;
  if (!contactEmail || !process.env.RESEND_API_KEY) return;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Sentio <onboarding@resend.dev>",
      to: contactEmail,
      subject: "Votre employé numérique a besoin de votre validation",
      text: `Une tâche attend votre décision : ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/tasks/${params.taskId}`,
    });
    await db.query(`update notification set email_sent_at = now() where task_id = $1`, [params.taskId]);
  } catch (err) {
    console.error("Échec envoi email notification (Resend) :", err);
  }
}
