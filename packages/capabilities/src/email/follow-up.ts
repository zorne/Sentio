/**
 * METIER-12 — la capacité « relancer un prospect ».
 *
 * Une relance est un envoi, donc tout ce qui vaut pour `send-message.ts` vaut ici : la garde
 * répond avant qu'on compose, la clé d'idempotence est prise AVANT l'envoi, le service
 * d'expédition n'est jamais nommé. Ces quatre pas ne sont pas recopiés par goût de la symétrie —
 * ils sont recopiés parce qu'aucun ne peut être sauté, et qu'un moteur qui en sauterait un
 * enverrait deux fois le même message à quelqu'un qui n'a rien demandé.
 *
 * CE QUI DIFFÈRE VRAIMENT, et c'est le contenu de cette tâche :
 *
 * 1. **La garde n'est pas la même.** `peut_relancer` ajoute trois conditions que l'envoi initial
 *    n'a pas à connaître — réponse déjà reçue, rang épuisé, espacement insuffisant. Elles vivent
 *    en base, avec les sept autres, et ne sont pas réécrites ici.
 *
 * 2. **Le pied de message n'est pas le même.** L'origine de la donnée est due au PREMIER contact
 *    (article 14, `docs/adr/0016`) : la répéter à chaque relance n'ajoute aucun droit et alourdit
 *    un message qui doit rester court. Le moyen d'opposition, lui, reste OBLIGATOIRE sur chaque
 *    message sans exception (METIER-10) — c'est la différence entre une information due une fois
 *    et un droit exerçable à tout moment.
 *
 * Réalise : METIER-12
 */

import type { EmailAddress, EmailProvider } from "./provider.js";
import type { OutboundMessageStore } from "./send-message.js";
import { MessageIncomplete } from "./send-message.js";

/**
 * Réponse de la garde de relance — `public.peut_relancer()` côté base.
 *
 * Le rang vient de la garde et non de l'appelant : il se déduit des messages déjà partis, et
 * laisser l'appelant l'annoncer, c'est accepter qu'il l'annonce faux.
 */
export type FollowUpVerdict =
  | { readonly allowed: true; readonly recipient: EmailAddress; readonly rang: number }
  | { readonly allowed: false; readonly reason: string };

export interface FollowUpGuard {
  check(input: { tenantId: string; leadId: string; sendingDomainId: string }): Promise<FollowUpVerdict>;
}

export interface FollowUpInput {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly leadId: string;
  readonly sendingDomainId: string;
  readonly from: EmailAddress;
  readonly replyTo?: EmailAddress;
  readonly subject: string;
  readonly body: string;
  /** Le lien d'opposition — obligatoire sur CHAQUE message, relance comprise (METIER-10). */
  readonly optOutUrl: string;
  readonly senderCompany: string;
  /** Adresse à laquelle exercer ses droits. */
  readonly rightsContact: string;
  readonly idempotencyKey: string;
}

export type FollowUpResult =
  | { readonly status: "envoye"; readonly providerMessageId: string; readonly rang: number }
  | { readonly status: "deja_envoye" }
  | { readonly status: "refuse"; readonly reason: string };

/**
 * Compose la relance : le texte de l'employé, puis un pied allégé mais jamais vide.
 *
 * L'origine de la donnée n'y figure pas — elle a été dite au premier message et n'a pas à être
 * redite. Ce qui reste est ce qui doit rester exerçable à tout instant : qui écrit, comment
 * refuser tout nouvel envoi, comment exercer ses droits.
 */
export function composeFollowUp(input: FollowUpInput): string {
  if (input.body.trim() === "") {
    throw new MessageIncomplete("Relance vide : rien ne part.");
  }
  if (input.optOutUrl.trim() === "" || input.rightsContact.trim() === "") {
    throw new MessageIncomplete(
      "Une relance sans moyen d'opposition ni contact pour exercer ses droits ne peut pas être " +
        "envoyée. L'obligation vaut pour chaque message, pas seulement pour le premier.",
    );
  }

  return [
    input.body.trim(),
    "",
    "—",
    `Ce message vous est adressé par ${input.senderCompany}.`,
    `Vous pouvez refuser tout nouvel envoi en un clic : ${input.optOutUrl}`,
    `Pour consulter, corriger ou faire effacer vos informations : ${input.rightsContact}`,
  ].join("\n");
}

export class FollowUpCapability {
  /** Le moteur de base, celui que la migration 0039 lie aux trois formules. */
  readonly engineKey = "base";
  readonly capabilityKey = "relancer_un_prospect";

  constructor(
    private readonly guard: FollowUpGuard,
    private readonly store: OutboundMessageStore,
    private readonly provider: EmailProvider,
  ) {}

  async execute(input: FollowUpInput): Promise<FollowUpResult> {
    if (input.idempotencyKey.trim() === "") {
      throw new MessageIncomplete(
        "Relance sans clé d'idempotence : un rejeu relancerait deux fois le même prospect.",
      );
    }

    // 1. Demander. Les dix conditions vivent en base ; on ne les recopie pas.
    const verdict = await this.guard.check({
      tenantId: input.tenantId,
      leadId: input.leadId,
      sendingDomainId: input.sendingDomainId,
    });
    if (!verdict.allowed) return { status: "refuse", reason: verdict.reason };

    // 2. Composer. Une relance incomplète lève : elle ne part pas « en mieux que rien ».
    const text = composeFollowUp(input);

    // 3. Réserver AVANT d'envoyer. Si la clé est déjà prise, la relance est déjà partie.
    const claimed = await this.store.claim({
      tenantId: input.tenantId,
      leadId: input.leadId,
      employeeId: input.employeeId,
      sendingDomainId: input.sendingDomainId,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
    });
    if (!claimed) return { status: "deja_envoye" };

    // 4. Envoyer.
    const sent = await this.provider.send({
      from: input.from,
      to: verdict.recipient,
      ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
      subject: input.subject,
      text,
      idempotencyKey: input.idempotencyKey,
      headers: {
        "List-Unsubscribe": `<${input.optOutUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Auto-Submitted": "auto-generated",
      },
    });

    await this.store.confirm({
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
      providerMessageId: sent.providerMessageId,
    });

    return { status: "envoye", providerMessageId: sent.providerMessageId, rang: verdict.rang };
  }
}
