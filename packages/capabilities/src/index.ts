/**
 * `@sentio/capabilities` — les adaptateurs concrets d'une capacité.
 *
 * Une capacité est un **contrat** (déclaré en base, lu par le registre du noyau) ; ce paquet en
 * fournit les **moteurs**, remplaçables (`docs/adr/0006`). Rien ici n'est nommé par le métier :
 * l'ADN dit « écrire à un prospect », il ne dit jamais quel service expédie.
 */

export * from "./email/provider.js";
export * from "./email/resend.js";
export * from "./email/send-message.js";
