// ════════════════════════════════════════════════════════════════════
// Server Action du diagnostic public — un aller-retour de conversation
// à la fois, comme onboarding-actions.ts. Différence de nature : ce
// n'est pas l'agent d'accueil qui configure un compte, c'est le
// diagnostic qui calibre une RECOMMANDATION, via @sentio/domain
// (packages/vitrine-core/src/diagnostic). Rien n'est écrit en base tant
// que le visiteur n'a pas recruté — voir apps/vitrine/migrations/0011
// pour la seule table que ce module touche (le plafond d'usage, pas la
// conversation elle-même).
// ════════════════════════════════════════════════════════════════════

"use server";

import { pool } from "@/lib/db";
import { checkDiagnosticRateLimit, resolveDiagnosticVisitor } from "@/lib/diagnostic-rate-limit";
import {
  buildDiagnosticGateway,
  createModelConverse,
  createModelPresent,
  presentEmployee,
  stepDiagnostic,
  ENVELOPE_EXHAUSTED_MESSAGE,
  EnvelopeExhausted,
  PostgresEnvelopeLedger,
  type DiagnosticMessage,
  type EmployeePresentation,
} from "@sentio/vitrine-core/diagnostic";

export type { DiagnosticMessage, EmployeePresentation };

export type DiagnosticTurnResult =
  | { readonly kind: "message"; readonly reply: string }
  | {
      readonly kind: "presentation";
      readonly presentation: EmployeePresentation;
      /**
       * Le profil qui a produit cette employée.
       *
       * ⚠️ Il fait l'aller-retour par le navigateur, et il n'autorise RIEN par lui-même : au
       * recrutement, le serveur rejoue la composition à partir de lui plutôt que de croire ce
       * qui revient (`recrutement-actions.ts`). Sans ce transport, il faudrait garder l'état de
       * chaque conversation côté serveur, et deux visiteurs simultanés partageraient un jour le
       * même — exactement ce que le fondateur redoute le plus.
       */
      readonly profil: unknown;
    }
  | { readonly kind: "hors_perimetre"; readonly reason: string }
  | { readonly kind: "limite"; readonly message: string }
  | { readonly kind: "panne"; readonly message: string };

const LIMITE_VISITEUR =
  "Nous avons échangé longuement aujourd'hui. Revenez demain pour continuer : rien n'est perdu.";
const LIMITE_ADRESSE =
  "Beaucoup d'échanges sont partis de votre réseau aujourd'hui. Réessayez un peu plus tard.";
const PANNE = "Nous n'avons pas pu vous répondre à l'instant. Réessayez dans un moment.";

async function runTurn(history: DiagnosticMessage[]): Promise<DiagnosticTurnResult> {
  const { visitorId, ipHash } = await resolveDiagnosticVisitor();
  const verdict = await checkDiagnosticRateLimit(pool, visitorId, ipHash);
  if (!verdict.allowed) {
    return { kind: "limite", message: verdict.reason === "visiteur" ? LIMITE_VISITEUR : LIMITE_ADRESSE };
  }

  // ACQUIS-18 — le plafond GLOBAL de l'enveloppe `public_diagnostic`, en plus du plafond par
  // visiteur vérifié juste au-dessus. Les deux comptent des choses différentes : ce qu'un
  // visiteur consomme, et ce que tout le monde consomme ensemble.
  const gateway = buildDiagnosticGateway(new PostgresEnvelopeLedger(pool));
  const step = await stepDiagnostic(history, { converse: createModelConverse(gateway) });

  if (step.stage === "conversation") {
    return { kind: "message", reply: step.reply };
  }

  const { decision } = step;
  if (decision.status === "hors_perimetre") {
    return { kind: "hors_perimetre", reason: decision.reason };
  }
  if (decision.status === "incomplet") {
    // stepDiagnostic gère déjà ce cas en interne (relance avec indice) — ce n'est donc pas
    // censé remonter jusqu'ici. Filet de sécurité si son comportement change un jour : on
    // continue la conversation plutôt que de laisser échapper un état interne.
    return { kind: "message", reply: "Précisons encore un point avant de pouvoir vous répondre." };
  }

  const presentation = await presentEmployee(decision, { present: createModelPresent(gateway) });
  return { kind: "presentation", presentation, profil: step.profil };
}

/**
 * ⚠️ Cette fonction ne laisse JAMAIS une exception atteindre le client. Une expérience qui se
 * veut « l'une des plus différenciantes de Sentio » ne peut pas se terminer par l'écran d'erreur
 * générique de Next.js — panne réseau, base indisponible, clé manquante : tout devient un
 * message sobre, jamais un détail technique (même principe que `diagnostic/handler.ts`,
 * `respond()`). L'erreur réelle part au journal serveur, jamais au visiteur.
 */
export async function diagnosticTurn(history: DiagnosticMessage[]): Promise<DiagnosticTurnResult> {
  try {
    return await runTurn(history);
  } catch (error) {
    // L'enveloppe pleine n'est PAS une panne : rien n'a échoué, une règle a fermé la porte
    // (ACQUIS-18). La confondre avec une panne ferait chercher un incident là où il n'y en a
    // pas, et priverait la surveillance du seul signal qui dit que le plafond a mordu.
    if (error instanceof EnvelopeExhausted) {
      console.warn(
        JSON.stringify({ route: "diagnostic-vitrine", raison: "enveloppe_epuisee", detail: error.detail }),
      );
      return { kind: "limite", message: ENVELOPE_EXHAUSTED_MESSAGE };
    }
    console.error(JSON.stringify({ route: "diagnostic-vitrine", error: String(error) }));
    return { kind: "panne", message: PANNE };
  }
}
