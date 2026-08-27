// ════════════════════════════════════════════════════════════════════
// Les drapeaux, lus depuis l'environnement du serveur.
//
// ⚠️ FERMÉS PAR DÉFAUT, ET FERMÉS SUR TOUTE VALEUR AUTRE QUE « true ».
//
// Un drapeau qui s'ouvre sur « 1 », « oui », « yes » ou une chaîne non
// vide finit par s'ouvrir sur une valeur laissée par erreur. On exige la
// chaîne exacte : c'est ce que fait déjà la fonction serveur du
// diagnostic, et deux façons de lire un drapeau dans le même produit
// finiraient par diverger.
//
// Ces drapeaux ne sont JAMAIS exposés au navigateur : ils n'ont pas de
// préfixe « NEXT_PUBLIC_ », donc Next ne les livre pas au client. Un
// drapeau lisible depuis la page serait un drapeau modifiable par
// quiconque sait ouvrir les outils de développement.
// ════════════════════════════════════════════════════════════════════

/**
 * Le recrutement sans paiement, depuis le diagnostic.
 *
 * ⚠️ CE DRAPEAU DONNE LE PRODUIT. Ouvert, n'importe quel visiteur qui termine une conversation
 * repart avec une entreprise, une employée et un accès. Il existe pour que le fondateur traverse
 * son propre parcours exactement comme un client, sans passer par l'achat.
 *
 * Il doit rester fermé en ligne. `docs/33-le-parcours-gratuit.md` explique quoi faire à la place.
 */
export function peutRecruterSansPaiement(): boolean {
  return process.env["SENTIO_RECRUTEMENT_SANS_PAIEMENT"] === "true";
}
