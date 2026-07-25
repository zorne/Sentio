// ════════════════════════════════════════════════════════════════════
// POST /api/advisor — seul point d'entrée du conseiller.
//
// La clé Groq est lue côté serveur uniquement, via variable
// d'environnement, et n'est jamais transmise au navigateur. Le client
// n'envoie qu'une conversation et reçoit du texte.
//
// Défenses appliquées ici :
//   · validation stricte de la forme et des tailles
//   · limitation de débit par IP, fenêtre glissante
//   · messages d'erreur génériques côté client, détail en journal serveur
//   · aucun détail d'implémentation (provider, modèle) exposé
// ════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { buildAdvisorGateway, answer, type AdvisorMessage } from "@employes-ia/core/advisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 1000;
const MAX_MESSAGES = 20;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

/** Limitation en mémoire : suffisante pour une instance unique et sans
 *  dépendance externe. À remplacer par un compteur partagé (Redis, ou la
 *  base) le jour où l'application tourne sur plusieurs instances —
 *  l'interface de `allow()` ne changera pas. */
const hits = new Map<string, number[]>();

function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);

  // Purge opportuniste : évite que la table grossisse indéfiniment sans
  // imposer une tâche de fond.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return true;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Valide la forme ET les tailles. Toute entrée non conforme est rejetée
 *  avant d'atteindre le fournisseur d'IA. */
function parseMessages(raw: unknown): AdvisorMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;

  const out: AdvisorMessage[] = [];
  for (const m of raw) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_CHARS) return null;
    out.push({ role, content: trimmed });
  }
  if (out[out.length - 1]?.role !== "user") return null;
  return out;
}

export async function POST(req: Request) {
  if (!allow(clientIp(req))) {
    return NextResponse.json(
      { error: "Trop de messages. Patientez une minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const messages = parseMessages((body as { messages?: unknown })?.messages);
  if (!messages) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    // Journalisé côté serveur, jamais détaillé au client.
    console.error("[advisor] GROQ_API_KEY absente");
    return NextResponse.json({ error: "Le conseiller est indisponible." }, { status: 503 });
  }

  const gateway = buildAdvisorGateway();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of answer(gateway, messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[advisor]", err instanceof Error ? err.message : err);
        // Le flux a pu commencer : on termine par un message lisible
        // plutôt que de couper net sur une erreur muette.
        controller.enqueue(
          encoder.encode("\n\nJe ne parviens pas à répondre pour le moment. Réessayez dans un instant.")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
