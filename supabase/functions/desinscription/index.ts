/**
 * Point d'entrée de la fonction `desinscription`. Il branche, il ne traite pas — même principe
 * que [`diagnostic/index.ts`](../diagnostic/index.ts).
 */

import { createHandler } from "./handler.ts";
import { supabaseLeadLookup, supabaseSuppressionWriter } from "./supabase-store.ts";

const { respond } = createHandler({
  leads: supabaseLeadLookup,
  suppressions: supabaseSuppressionWriter,
  secret: () => Deno.env.get("SENTIO_OPTOUT_SECRET"),
});

Deno.serve(respond);
