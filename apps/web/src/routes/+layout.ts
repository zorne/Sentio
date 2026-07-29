/**
 * La vitrine est **prérendue** : elle est construite une fois, servie partout, et ne touche aucune
 * donnée ([`adr/0021`](../../../../docs/adr/0021-execution-serveur-en-ue.md), règle 1).
 *
 * L'espace privé, lui, désactivera le prérendu sur son propre groupe de routes — il n'est ni
 * public, ni référencé, et il n'a rien à faire dans un fichier statique.
 */
export const prerender = true;
