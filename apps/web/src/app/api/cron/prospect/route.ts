// ════════════════════════════════════════════════════════════════════
// Cycle de prospection automatique — appelé par un scheduler externe
// (GitHub Actions, voir .github/workflows/prospect-cron.yml) toutes les
// ~20 min, car Vercel Hobby limite son propre cron à 1x/jour.
//
// Un seul tenant actif par invocation (le moins récemment lancé, jamais
// deux fois le même jour) : rotation équitable, aucun risque de timeout,
// pas besoin de verrou (les invocations sont espacées, chaque run dure
// quelques secondes).
// ════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { launchSalesRunInternal } from "@/lib/agent-actions";
import { DEMO_TENANT_ID } from "@employes-ia/core/wiring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await db.connect();
  try {
    // `is_active` vaut true par défaut pour TOUT agent_instance (dès
    // l'onboarding) — on ne le prend comme "prospection activée" que
    // combiné à la présence de prospectingCriteria (posé uniquement par
    // "Valider et commencer"). Le tenant démo est exclu explicitement.
    const { rows } = await db.query<{ agent_instance_id: string; tenant_id: string }>(
      `select ai.id as agent_instance_id, ai.tenant_id
       from agent_instance ai
       where ai.is_active = true
         and ai.config ? 'prospectingCriteria'
         and ai.tenant_id <> $1
         and not exists (
           select 1 from task t
           where t.agent_instance_id = ai.id and t.created_at::date = now()::date
         )
       order by (select max(t.created_at) from task t where t.agent_instance_id = ai.id) asc nulls first
       limit 1`,
      [DEMO_TENANT_ID]
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ ranFor: null, reason: "rien à faire" });

    const { taskId } = await launchSalesRunInternal(db, row.tenant_id, row.agent_instance_id);
    return NextResponse.json({ ranFor: row.tenant_id, taskId });
  } finally {
    await db.end();
  }
}
