/**
 * Point d'entrée de la fonction `diagnostic`. Il branche, il ne traite pas.
 *
 * Tout le traitement est dans [`handler.ts`](handler.ts), et tout le domaine est dans
 * `packages/domain`. Ce fichier est, littéralement, la seule ligne qui dépend de Deno — c'est-à-dire
 * la seule que la migration vers un hébergeur européen classique aura à jeter
 * ([`adr/0021`](../../../docs/adr/0021-execution-serveur-en-ue.md)).
 */

import { respond } from "./handler.ts";

Deno.serve(respond);
