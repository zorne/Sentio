// ════════════════════════════════════════════════════════════════════════════════════════════
// L'EMAIL DE PRÉSENTATION — le seul document que le client garde.
//
// ══ POURQUOI IL EXISTE, ET POURQUOI C'EST UN EMAIL ══
//
// Le dirigeant vient de confier une partie de son travail à quelqu'un qu'il n'a jamais vu. La
// page d'arrivée le lui montre une fois ; l'email, lui, reste. C'est le document qu'il rouvrira
// dans trois semaines quand il se demandera ce qu'il a acheté, celui qu'il fera suivre à son
// associé, celui qu'il relira le jour où il hésitera à élargir l'autonomie.
//
// Il porte donc ce qui RASSURE, et ce qui rassure n'est pas la liste de ce qu'elle sait faire.
// C'est la liste de ce qu'elle ne fera JAMAIS. Le premier reproche fait aux produits
// concurrents, dans les avis publics, n'est pas qu'ils en font trop peu : c'est qu'on ne sait
// pas ce qu'ils vont faire.
//
// ══ CE QU'IL NE CONTIENT PAS, ET C'EST UNE DÉCISION ══
//
// ⛔ AUCUN MOT DE PASSE. Un mot de passe envoyé par email reste dans une boîte pour toujours,
//    part dans les transferts, dort sur les serveurs d'une messagerie et dans ses sauvegardes.
//    Le client pose le sien lui-même, une fois, sur une page à lui.
//
// ⛔ AUCUN CHIFFRE QUI NE SOIT PAS MESURÉ. Pas de « vous gagnerez X heures », pas de promesse de
//    résultat. Ce qui est écrit ici est ce que la base contient : son prénom, son rôle, ses
//    priorités, l'objectif que le dirigeant a lui-même énoncé.
//
// ⚠️ Le lien qu'il contient est à USAGE UNIQUE et il expire. Ce n'est pas un identifiant : c'est
//    une porte qui se referme derrière celui qui la passe. La distinction compte, parce que la
//    règle « aucun identifiant dans un document qu'on garde » reste entière — un lien mort ne
//    donne accès à rien, un mot de passe recopié donne accès à tout.
//
// ══ POURQUOI CE FICHIER EST DANS LE DOMAINE ══
//
// Il ne fait aucune entrée/sortie : il reçoit des faits, il rend du texte. C'est ce qui permet
// de l'éprouver sans messagerie, et surtout de vérifier par un test que le lexique et la
// typographie sont tenus — plutôt que de les relire à chaque modification.
// ════════════════════════════════════════════════════════════════════════════════════════════

import { DONNEES_EN_DEUX_PHRASES } from "./promesse-sur-les-donnees.js";

/** Ce que la base sait de l'employée au moment où on présente son arrivée. */
export interface PresentationDeLEmployee {
  /** Le prénom réservé par `reserve_identity()`. Jamais réutilisé entre deux employées. */
  readonly prenom: string;
  /** Le nom de l'entreprise du client, tel qu'il l'a donné. */
  readonly entreprise: string;
  /** Le rôle composé par le diagnostic, en toutes lettres. Ex. « prospection ». */
  readonly role: string;
  /** Ce sur quoi elle se concentre, tel que la configuration l'a écrit. */
  readonly priorites: readonly string[];
  /** L'objectif que le dirigeant a énoncé, en une phrase déjà lisible. */
  readonly objectif: string;
  /** L'adresse de la page où le client crée son accès. À usage unique, elle expire. */
  readonly lienDAcces: string;
  /** L'adresse permanente de connexion, sans aucun secret. C'est celle qu'il gardera. */
  readonly adresseDeConnexion: string;
}

export interface EmailRedige {
  readonly objet: string;
  readonly texte: string;
  readonly html: string;
}

/**
 * Ce qu'elle ne fera jamais.
 *
 * ⚠️ CES QUATRE LIGNES NE SONT PAS DU MARKETING : chacune correspond à une garantie tenue par la
 * base, pas par une intention. Les écrire ici sans qu'elles soient vraies serait exactement le
 * mensonge que ce produit ne peut pas se permettre.
 *
 *   1. l'accord avant tout envoi          → `standing_approval` + le cliquet d'autonomie ;
 *   2. seul le dirigeant élargit          → déclencheur : rien ne peut la rendre plus libre ;
 *   3. jamais de changement de rôle seule → une réévaluation publie une version INACTIVE ;
 *   4. étanchéité entre entreprises       → `verify_tenant_isolation`, `adr/0014`.
 */
const CE_QU_ELLE_NE_FERA_JAMAIS: readonly string[] = [
  "Aucun message ne part sans votre accord. Chaque envoi vous est soumis avant, avec son texte exact et le nom de l'entreprise à qui il s'adresse.",
  "Cette autonomie ne s'élargit jamais toute seule. N'importe quoi peut la restreindre ; vous seul pouvez l'ouvrir, et ça se retire aussi vite que ça se donne.",
  "Le métier ne change jamais sans vous. Si les résultats suggèrent autre chose, la proposition vous est soumise et rien ne bouge tant que vous n'avez pas répondu.",
  "Rien de ce qui appartient à quelqu'un d'autre n'est visible ici. Aucune donnée d'une entreprise n'atteint une autre entreprise, jamais, même agrégée.",
];

/**
 * Ce que ses données deviennent, dit dans le document qu'il garde.
 *
 * ⚠️ C'est ici que ça compte le plus. Une page se relit quand on la cherche ; cet email est
 * rouvert le jour où le doute arrive, souvent des semaines après. La promesse doit y être.
 */
const CE_QUE_DEVIENNENT_VOS_DONNEES = DONNEES_EN_DEUX_PHRASES;

/** Le garde-fou du silence, dit au client avant qu'il ait à s'en inquiéter. */
const LE_SILENCE =
  "Et après quarante entreprises approchées sans la moindre réponse, le travail s'arrête de lui-même et vous êtes prévenu. Un collaborateur qui continue de parler dans le vide vous coûte votre réputation, pas seulement son temps.";

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rédige l'email de présentation.
 *
 * Le texte brut n'est pas une politesse : beaucoup de messageries d'entreprise affichent la
 * version texte, et un email qui n'en a pas est plus souvent classé en indésirable.
 */
export function redigerLaPresentation(faits: PresentationDeLEmployee): EmailRedige {
  const { prenom, entreprise, role, priorites, objectif, lienDAcces, adresseDeConnexion } = faits;

  const objet = `${prenom} rejoint ${entreprise}`;

  const listeDesPriorites = priorites;

  const texte = [
    `${prenom} rejoint ${entreprise}.`,
    "",
    `Le travail commence aujourd'hui. Métier : ${role}.`,
    `Ce que vous avez demandé d'atteindre : ${objectif}.`,
    "",
    listeDesPriorites.length > 0 ? "Ce sur quoi le travail se concentre :" : "",
    ...listeDesPriorites.map((p) => `  · ${p}`),
    "",
    "CE QUI N'ARRIVERA JAMAIS",
    "",
    ...CE_QU_ELLE_NE_FERA_JAMAIS.map((ligne) => `  · ${ligne}`),
    "",
    LE_SILENCE,
    "",
    CE_QUE_DEVIENNENT_VOS_DONNEES,
    "",
    "CRÉER VOTRE ACCÈS",
    "",
    "Choisissez votre mot de passe ici. Ce lien ne fonctionne qu'une fois, et il expire :",
    lienDAcces,
    "",
    `Ensuite, vous vous connectez à tout moment sur ${adresseDeConnexion}, avec cette adresse email et le mot de passe que vous aurez choisi.`,
    "",
    "Sentio",
  ]
    .filter((ligne, index, toutes) => !(ligne === "" && toutes[index - 1] === ""))
    .join("\n");

  // Une puce dessinée, pas une liste HTML : les messageries traitent `ul` et `li` chacune à leur
  // façon, et une marge par défaut différente suffit à décaler tout le bloc. Deux cellules,
  // c'est laid à écrire et identique partout.
  const puce = (contenu: string): string =>
    `<tr>` +
    `<td style="padding:0 12px 14px 0;vertical-align:top;color:#b4b0a6;font-size:15px;line-height:1.6;width:8px;">&bull;</td>` +
    `<td style="padding:0 0 14px 0;vertical-align:top;color:#3a3a38;font-size:15px;line-height:1.6;">${contenu}</td>` +
    `</tr>`;

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(objet)}</title></head>
<body style="margin:0;padding:0;background:#f4f3f0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f0;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid #e3e1dc;">

<tr><td style="padding:36px 40px 0 40px;">
  <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8a877f;">Sentio</div>
</td></tr>

<tr><td style="padding:26px 40px 0 40px;">
  <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.25;font-weight:400;color:#16150f;">
    ${echapper(prenom)} rejoint ${echapper(entreprise)}.
  </h1>
</td></tr>

<tr><td style="padding:20px 40px 0 40px;color:#3a3a38;font-size:15px;line-height:1.65;">
  <p style="margin:0 0 10px 0;">Le travail commence aujourd'hui. Métier : <strong style="color:#16150f;">${echapper(role)}</strong>.</p>
  <p style="margin:0;">Ce que vous avez demandé d'atteindre : <strong style="color:#16150f;">${echapper(objectif)}</strong>.</p>
</td></tr>

${
  listeDesPriorites.length > 0
    ? `<tr><td style="padding:26px 40px 0 40px;">
  <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8a877f;padding-bottom:12px;">Ce sur quoi le travail se concentre</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${listeDesPriorites.map((p) => puce(echapper(p))).join("\n    ")}
  </table>
</td></tr>`
    : ""
}

<tr><td style="padding:14px 40px 0 40px;"><div style="height:1px;background:#e3e1dc;"></div></td></tr>

<tr><td style="padding:26px 40px 0 40px;">
  <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8a877f;padding-bottom:14px;">Ce qui n'arrivera jamais</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${CE_QU_ELLE_NE_FERA_JAMAIS.map((ligne) => puce(echapper(ligne))).join("\n    ")}
  </table>
  <p style="margin:6px 0 0 0;color:#5c5a53;font-size:14px;line-height:1.65;">${echapper(LE_SILENCE)}</p>
  <p style="margin:14px 0 0 0;color:#5c5a53;font-size:14px;line-height:1.65;">${echapper(CE_QUE_DEVIENNENT_VOS_DONNEES)}</p>
</td></tr>

<tr><td style="padding:30px 40px 0 40px;"><div style="height:1px;background:#e3e1dc;"></div></td></tr>

<tr><td style="padding:28px 40px 0 40px;">
  <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8a877f;padding-bottom:12px;">Créer votre accès</div>
  <p style="margin:0 0 20px 0;color:#3a3a38;font-size:15px;line-height:1.65;">
    Choisissez votre mot de passe. Ce lien ne fonctionne qu'une fois, et il expire.
  </p>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="background:#16150f;">
      <a href="${echapper(lienDAcces)}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:15px;text-decoration:none;">Choisir mon mot de passe</a>
    </td>
  </tr></table>
  <p style="margin:20px 0 0 0;color:#8a877f;font-size:13px;line-height:1.6;">
    Ensuite, vous vous connectez quand vous voulez sur
    <a href="${echapper(adresseDeConnexion)}" style="color:#3a3a38;">${echapper(adresseDeConnexion)}</a>,
    avec cette adresse email et le mot de passe que vous aurez choisi.
  </p>
</td></tr>

<tr><td style="padding:32px 40px 36px 40px;">
  <div style="color:#a5a29a;font-size:12px;line-height:1.6;">Sentio · hébergement européen</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { objet, texte, html };
}
