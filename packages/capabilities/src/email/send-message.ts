/**
 * METIER-09 — la capacité « écrire à un prospect », et ses garde-fous.
 *
 * ⚠️ C'est le seul endroit du produit qui produit un effet **irréversible chez un tiers**. La
 * contrainte du fondateur ([`docs/adr/0017`]) s'applique ici et nulle part ailleurs avec autant
 * de force : *ne jamais délivrer un message qui pourrait brûler la réputation du client*.
 *
 * Traduction : cette classe est écrite pour **ne pas pouvoir** envoyer quand une condition
 * manque. Elle demande l'autorisation à la garde, elle compose le message avec ses obligations,
 * elle réserve la clé d'idempotence, et seulement alors elle appelle le service d'expédition.
 * Aucun de ces quatre pas n'est facultatif, et l'ordre compte :
 *
 *   1. **demander** — la garde en base répond « ok » ou dit pourquoi non ;
 *   2. **composer** — un message sans moyen d'opposition ni information due n'existe pas ;
 *   3. **réserver** — la clé d'idempotence est prise AVANT l'envoi, jamais après. Une panne
 *      entre l'envoi et l'enregistrement ne doit pas produire un second message : mieux vaut un
 *      message perdu qu'un prospect contacté deux fois ;
 *   4. **envoyer**.
 *
 * Le service d'expédition n'est jamais nommé ici : il arrive par l'interface `EmailProvider`.
 */

import type { EmailAddress, EmailProvider } from "./provider.js";

/** Réponse de la garde d'envoi — `public.peut_envoyer()` côté base. */
export type SendingVerdict =
  | { readonly allowed: true; readonly recipient: EmailAddress }
  | { readonly allowed: false; readonly reason: string };

export interface SendingGuard {
  check(input: {
    tenantId: string;
    leadId: string;
    sendingDomainId: string;
  }): Promise<SendingVerdict>;
}

export interface OutboundMessageStore {
  /**
   * Réserve la clé d'idempotence. Renvoie `false` si elle est déjà prise — le message est alors
   * **déjà parti**, et le rejeu doit s'arrêter là.
   */
  claim(input: {
    tenantId: string;
    leadId: string;
    employeeId: string;
    sendingDomainId: string;
    subject: string;
    idempotencyKey: string;
  }): Promise<boolean>;

  /**
   * Note l'identifiant rendu par le service, une fois le message parti.
   *
   * C'est lui — et lui seul — que le service renverra en cas de rebond ou de plainte. Sans ce
   * rattachement, un retour arrive sans qu'on puisse dire de quel message il parle, donc sans
   * qu'on puisse fermer l'adresse ni suspendre le domaine (migration 0040).
   */
  confirm(input: {
    tenantId: string;
    idempotencyKey: string;
    providerMessageId: string;
  }): Promise<void>;
}

export interface SendMessageInput {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly leadId: string;
  readonly sendingDomainId: string;
  /** L'expéditeur : le prénom de l'employé, au nom de l'entreprise cliente. */
  readonly from: EmailAddress;
  /** Où arrivent les réponses — une adresse réelle du client, jamais une boîte sans issue. */
  readonly replyTo?: EmailAddress;
  readonly subject: string;
  readonly body: string;
  /** Le lien d'opposition, obligatoire, en un clic. */
  readonly optOutUrl: string;
  /** Nom de l'entreprise cliente : c'est **elle** l'émettrice du message. */
  readonly senderCompany: string;
  /** D'où vient la donnée du prospect — dû par l'article 14 dès le premier message. */
  readonly dataSource: string;
  /** Adresse à laquelle exercer ses droits. */
  readonly rightsContact: string;
  readonly idempotencyKey: string;
}

export type SendMessageResult =
  | { readonly status: "envoye"; readonly providerMessageId: string }
  | { readonly status: "deja_envoye" }
  | { readonly status: "refuse"; readonly reason: string };

export class MessageIncomplete extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageIncomplete";
  }
}

/**
 * Compose le message final : le texte de l'employé, puis le pied obligatoire.
 *
 * Le pied n'est pas une formalité juridique recopiée : il porte ce que le prospect a le droit de
 * savoir **au premier message**, puisqu'il n'a jamais parlé ni au client ni à Sentio — qui écrit,
 * d'où vient son adresse, comment s'y opposer, comment exercer ses droits
 * (`docs/25-conformite-legale.md`, §2.2).
 */
export function composeMessage(input: SendMessageInput): string {
  if (input.body.trim() === "") {
    throw new MessageIncomplete("Message vide : rien ne part.");
  }
  if (input.optOutUrl.trim() === "" || input.rightsContact.trim() === "") {
    throw new MessageIncomplete(
      "Un message sans moyen d'opposition ni contact pour exercer ses droits ne peut pas être " +
        "envoyé. Ce n'est pas une consigne de rédaction : la capacité refuse.",
    );
  }
  if (input.dataSource.trim() === "") {
    throw new MessageIncomplete(
      "L'origine de la donnée est obligatoire dans le premier message (docs/adr/0016).",
    );
  }

  return [
    input.body.trim(),
    "",
    "—",
    `Ce message vous est adressé par ${input.senderCompany} dans le cadre d'une prospection ` +
      `professionnelle. Vos coordonnées proviennent de : ${input.dataSource}.`,
    `Vous pouvez refuser tout nouvel envoi en un clic : ${input.optOutUrl}`,
    `Pour consulter, corriger ou faire effacer vos informations : ${input.rightsContact}`,
  ].join("\n");
}

export class SendMessageCapability {
  /** Le moteur de base, celui que la migration 0039 lie aux trois formules. */
  readonly engineKey = "base";
  readonly capabilityKey = "envoyer_un_message";

  constructor(
    private readonly guard: SendingGuard,
    private readonly store: OutboundMessageStore,
    private readonly provider: EmailProvider,
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.idempotencyKey.trim() === "") {
      throw new MessageIncomplete(
        "Envoi sans clé d'idempotence : un rejeu enverrait deux fois le même message.",
      );
    }

    // 1. Demander. La garde connaît les sept conditions ; on ne les recopie pas ici, sous peine
    //    d'en avoir deux versions divergentes.
    const verdict = await this.guard.check({
      tenantId: input.tenantId,
      leadId: input.leadId,
      sendingDomainId: input.sendingDomainId,
    });
    if (!verdict.allowed) return { status: "refuse", reason: verdict.reason };

    // 2. Composer. Un message incomplet lève : il ne part pas « en mieux que rien ».
    const text = composeMessage(input);

    // 3. Réserver AVANT d'envoyer. Si la clé est déjà prise, le message est déjà parti.
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
        // Désabonnement en un clic : exigé par les grandes messageries, et compté dans leur
        // évaluation de réputation (`docs/10-securite-rgpd.md`).
        "List-Unsubscribe": `<${input.optOutUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        // Marquage lisible par machine du contenu produit automatiquement (`docs/adr/0015`,
        // article 50 § 2). `Auto-Submitted` est la seule forme normalisée qui existe pour un
        // courrier (RFC 3834) : on l'emploie plutôt que d'inventer un en-tête à nous.
        "Auto-Submitted": "auto-generated",
      },
    });

    // 5. Rattacher l'identifiant du service. L'envoi a eu lieu : si cette écriture échoue, le
    //    message reste enregistré comme parti — on ne le renvoie pas pour autant.
    await this.store.confirm({
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
      providerMessageId: sent.providerMessageId,
    });

    return { status: "envoye", providerMessageId: sent.providerMessageId };
  }
}
