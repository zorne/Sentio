// ════════════════════════════════════════════════════════════════════════════════════════════
// CE QU'ON DIT AU CLIENT SUR SES DONNÉES — écrit une fois, repris partout.
//
// ══ POURQUOI UN SEUL ENDROIT ══
//
// Demande du fondateur le 2026-08-27 : rassurer sur les données **à presque chaque écran**. Une
// promesse répétée à six endroits, rédigée six fois, diverge en trois mois : une page dira
// « jamais partagées », une autre « jamais vendues », et le client qui lit les deux se demandera
// laquelle est vraie. Une seule formulation, reprise, ne peut pas se contredire.
//
// ══ POURQUOI ELLE DIT AUSSI À QUOI ELLES SERVENT ══
//
// « Nous ne vendons pas vos données » est ce que tout le monde écrit, et personne ne le lit. Ce
// qu'un dirigeant veut savoir est plus simple et plus précis : **à quoi elles servent, et
// jusqu'où elles vont**. Alors on le dit dans cet ordre : elles servent à son employé, elles le
// rendent meilleur avec le temps, et elles ne sortent pas de chez lui.
//
// ⚠️ CHAQUE MOT EST TENU PAR QUELQUE CHOSE.
//
//   · « pour que votre employé travaille »   → `company_profile`, `learned_fact`, assemblés à
//                                              chaque mission par le contexte à trois couches ;
//   · « il s'améliore avec le temps »        → la réflexion d'après-mission, les variantes de
//                                              stratégie, les préférences retenues par entreprise ;
//   · « rien ne sort de chez vous »          → `verify_tenant_isolation`, la clé étrangère par
//                                              entreprise, la ligne qui ne change pas d'entreprise.
//                                              `adr/0014`, et ce n'est pas négociable.
//
// Si l'une des trois cessait d'être vraie, c'est ce fichier qu'il faudrait corriger en premier.
// ════════════════════════════════════════════════════════════════════════════════════════════

/**
 * La version courte, pour un écran où le client vient de donner quelque chose.
 *
 * Une phrase. À cet instant précis il attend une réponse, pas un paragraphe : un long texte de
 * réassurance juste après une saisie donne le sentiment qu'il y a quelque chose à se faire
 * pardonner.
 */
export const DONNEES_EN_UNE_PHRASE =
  "Ce que vous nous dites sert à votre employé, et à lui seul. Rien ne sort de votre entreprise.";

/**
 * La version d'accompagnement, quand il y a la place de dire pourquoi.
 *
 * Deux phrases : ce que les données font, et où elles s'arrêtent. Dans cet ordre, parce que
 * commencer par l'interdit ferait croire qu'on se défend.
 */
export const DONNEES_EN_DEUX_PHRASES =
  "Ce que vous confiez à votre employé lui sert à travailler, et à mieux travailler au fil des " +
  "semaines. Rien n'en sort : aucune donnée de votre entreprise n'atteint une autre entreprise, " +
  "jamais, même agrégée.";

/**
 * La version longue, pour la page d'accueil, là où le visiteur décide s'il fait confiance.
 *
 * ⚠️ Elle nomme ce que l'employé apprend, parce que « il s'améliore » sans dire de quoi se lit
 * comme une formule creuse. Et elle dit ce qui reste vrai même si on nous le demandait : c'est le
 * seul engagement de cette page qu'un client ne peut pas vérifier lui-même, donc celui qu'il faut
 * formuler le plus précisément.
 */
export const DONNEES_EXPLIQUEES = {
  titre: "Vos données servent à votre employé, et s'arrêtent là",
  corps:
    "Ce que vous lui dites de votre activité, de vos clients et de ce qui marche chez vous, il " +
    "s'en sert pour travailler. Il en retient ce qui donne des résultats et laisse tomber le " +
    "reste, donc il s'ajuste au fil des semaines.",
  limite:
    "Et ça s'arrête à votre entreprise. Aucune donnée ne circule vers un autre client, jamais, " +
    "même agrégée, même anonymisée, même si on nous le demandait.",
} as const;
