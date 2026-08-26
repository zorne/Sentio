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
import { timingSafeEqual } from "node:crypto";
import { Client } from "pg";
import { launchSalesRunInternal } from "@/lib/agent-actions";
import { DEMO_TENANT_ID } from "@sentio/vitrine-core/wiring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // ⚠️ ÉCHOUER FERMÉ, JAMAIS OUVERT.
  //
  // Cette comparaison se faisait directement contre `process.env.CRON_SECRET`. Quand la variable
  // manque, l'expression vaut la chaîne « Bearer undefined » — qu'un inconnu envoie comme
  // n'importe quel autre en-tête. Le contrôle s'ouvrait donc précisément dans le cas où il
  // aurait dû se fermer : celui où personne n'a posé le secret.
  //
  // Ce que la route déclenche derrière n'est pas une lecture : un cycle de prospection complet
  // sur une entreprise réelle, donc de vrais emails vers de vraies entreprises.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET absente : la route refuse de s'exécuter.");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Comparaison à temps constant : la durée d'un refus ne dit rien du secret attendu.
  const attendu = Buffer.from(`Bearer ${secret}`);
  const recu = Buffer.from(req.headers.get("authorization") ?? "");
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
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
