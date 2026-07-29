/**
 * METIER-21 — la surveillance des rebonds et des plaintes, et la suspension automatique.
 *
 * ⚠️ C'est la condition qui rend la garde d'envoi honnête. `peut_envoyer()` refuse déjà d'émettre
 * depuis un domaine suspendu — encore faut-il que quelque chose suspende. Sans ce module, la
 * condition « aucune suspension en cours » ne se déclencherait jamais, et la promesse de
 * `docs/adr/0017` serait décorative.
 *
 * La règle est volontairement brutale : **on suspend tôt, on reprend à la main**. Un domaine
 * suspendu par erreur coûte une journée d'envois ; un domaine brûlé coûte des mois au client, sur
 * l'outil dont dépend le reste de son activité.
 */

import { DELIVERABILITY_THRESHOLDS } from "@sentio/config";

export interface DeliveryTally {
  /** Messages envoyés sur la fenêtre observée. */
  readonly sent: number;
  readonly bounced: number;
  readonly complained: number;
}

export type ReputationVerdict =
  | { readonly suspend: false; readonly note: string }
  | { readonly suspend: true; readonly reason: string };

/**
 * Décide s'il faut suspendre. Fonction pure : aucune lecture, aucune écriture — elle se teste
 * seule et elle se rejoue à l'identique sur un incident passé.
 */
export function evaluateReputation(tally: DeliveryTally): ReputationVerdict {
  if (tally.sent < DELIVERABILITY_THRESHOLDS.minimumVolume) {
    // Sous ce volume, un seul rebond suffirait à dépasser tous les seuils. On ne conclut rien —
    // c'est précisément le moment de la montée en charge, où les volumes sont les plus faibles.
    return {
      suspend: false,
      note: `volume insuffisant pour conclure (${tally.sent} message(s))`,
    };
  }

  const complaintRate = tally.complained / tally.sent;
  if (complaintRate > DELIVERABILITY_THRESHOLDS.complaintRate) {
    return {
      suspend: true,
      reason:
        `taux de plaintes de ${percent(complaintRate)} sur ${tally.sent} messages, ` +
        `au-dessus de la limite de ${percent(DELIVERABILITY_THRESHOLDS.complaintRate)}`,
    };
  }

  const bounceRate = tally.bounced / tally.sent;
  if (bounceRate > DELIVERABILITY_THRESHOLDS.bounceRate) {
    return {
      suspend: true,
      reason:
        `taux de rebonds de ${percent(bounceRate)} sur ${tally.sent} messages, ` +
        `au-dessus de la limite de ${percent(DELIVERABILITY_THRESHOLDS.bounceRate)}`,
    };
  }

  return {
    suspend: false,
    note: `rebonds ${percent(bounceRate)}, plaintes ${percent(complaintRate)} — sous les limites`,
  };
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(".", ",")} %`;
}

/**
 * Ce qu'un retour du service d'expédition doit produire, en plus du comptage.
 *
 * Un rebond définitif et une plainte se traitent de la même façon côté destinataire : **on
 * n'écrit plus jamais à cette adresse**. Une plainte est un refus exprimé ; un rebond définitif
 * est une adresse morte qui, réessayée, abîme la réputation à chaque tentative.
 */
export function suppressionFor(event: {
  kind: "bounce" | "complaint" | "unsubscribe";
  email: string;
}): { pattern: string; kind: "rebond" | "plainte" | "desinscription"; reason: string } {
  const pattern = event.email.trim().toLowerCase();
  switch (event.kind) {
    case "bounce":
      return { pattern, kind: "rebond", reason: "adresse injoignable" };
    case "complaint":
      return { pattern, kind: "plainte", reason: "le destinataire a signalé le message" };
    case "unsubscribe":
      return { pattern, kind: "desinscription", reason: "opposition exprimée par le destinataire" };
  }
}
