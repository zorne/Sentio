/**
 * Le contrat d'un service d'expédition.
 *
 * ⚠️ **Aucun module en dehors de l'adaptateur ne nomme le service retenu**
 * ([`docs/adr/0018`]). La capacité d'envoi parle à cette interface ; ajouter Brevo, Postmark ou
 * le SMTP du client sera une classe de plus, jamais une modification du métier.
 *
 * C'est le même motif que le Model Gateway pour l'inférence : le contrat est stable, le moteur
 * est remplaçable (`docs/adr/0006`).
 */

export interface EmailAddress {
  readonly address: string;
  /** Le prénom de l'employé et le nom de l'entreprise cliente — jamais l'inverse. */
  readonly name?: string;
}

export interface OutgoingEmail {
  readonly from: EmailAddress;
  readonly to: EmailAddress;
  readonly replyTo?: EmailAddress;
  readonly subject: string;
  readonly text: string;
  /**
   * La version mise en forme, quand le message en a une.
   *
   * ⚠️ ELLE NE REMPLACE JAMAIS `text`, ELLE S'AJOUTE. Beaucoup de messageries d'entreprise
   * affichent la version texte, et un message qui n'en a pas est plus souvent classé en
   * indésirable. Les deux partent ensemble, et la messagerie choisit.
   *
   * Les messages que l'employée envoie à des prospects n'en ont pas : un email commercial en
   * texte simple ressemble à un email écrit par une personne, ce qui est exactement le but. Elle
   * sert aux messages que SENTIO adresse à SON client, comme la présentation de son employée.
   */
  readonly html?: string;
  /**
   * Clé d'idempotence de l'action. Transmise au service quand il sait la lire : la déduplication
   * tient alors des deux côtés, pas seulement du nôtre.
   */
  readonly idempotencyKey: string;
  /**
   * En-têtes supplémentaires. Deux y sont **toujours** posés par la capacité d'envoi :
   * le désabonnement en un clic exigé par les messageries, et le marquage lisible par machine
   * du contenu produit automatiquement (`docs/adr/0015`, article 50).
   */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SentEmail {
  /** Identifiant rendu par le service — sert à rapprocher un rebond ou une plainte plus tard. */
  readonly providerMessageId: string;
}

export interface EmailProvider {
  readonly key: string;
  send(email: OutgoingEmail): Promise<SentEmail>;
}

/**
 * Erreur passagère : quota, limitation de débit, panne. Réessayer plus tard a un sens — mais
 * **jamais** en réessayant tout de suite, et jamais en changeant de service au milieu d'une
 * montée en charge (`docs/adr/0017`).
 */
export class EmailProviderUnavailable extends Error {
  constructor(
    readonly providerKey: string,
    message: string,
  ) {
    super(message);
    this.name = "EmailProviderUnavailable";
  }
}

/**
 * Erreur définitive : adresse invalide, domaine non vérifié chez le service, clé refusée.
 * Réessayer ne changera rien, et insister abîmerait la réputation du client.
 */
export class EmailRejected extends Error {
  constructor(
    readonly providerKey: string,
    message: string,
  ) {
    super(message);
    this.name = "EmailRejected";
  }
}
