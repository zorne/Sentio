# ADR-0007 — Périmètre métier de la V1 : Commercial + Support

**Date :** 2026-07-27
**Statut :** acceptée — tranche la décision D1

## Contexte

La vision impose que Sentio recommande **un seul** employé, jamais un catalogue (§13). Avec un
seul métier possible au lancement, cette recommandation est un théâtre : quel que soit le
diagnostic, la conclusion est toujours la même. La documentation initiale recommandait de
lancer avec un seul métier réel (Commercial), pour concentrer l'effort sur un employé qui
produit du chiffre d'affaires mesurable plutôt que sur plusieurs vitrines superficielles.

Le fondateur a tranché en faveur de deux métiers.

## Décision

**Deux métiers réels au lancement : Commercial et Support.**

Chacun a sa propre entrée `employee_definition` version 1, ses propres capacités, ses propres
outils, ses propres garde-fous — deux définitions indépendantes, pas une définition commune
avec des variantes internes (voir [`../04-contextes-memoire.md`](../04-contextes-memoire.md) :
l'ADN est par métier, jamais partagé entre métiers).

Le moteur de recommandation déterministe ([`../07-parcours-produit.md`](../07-parcours-produit.md))
doit donc réellement discriminer entre deux issues possibles, pas une seule.

## Pourquoi

Une recommandation à choix unique est un mensonge silencieux : elle prétend diagnostiquer alors
qu'elle ne fait que confirmer. Avec deux métiers, la recommandation devient une vraie décision,
et le produit peut démontrer honnêtement ce que la vision promet (§3, Étape 3 : *« le client ne
choisit jamais, Sentio recommande »*).

Commercial et Support sont aussi le duo le plus proche d'une collaboration inter-employés
crédible (§15 de la vision) : un commercial qui qualifie, un support qui répond aux objections
— sans pour autant l'activer en V1 (Phase 2, voir [`../08-evolution-apprentissage.md`](../08-evolution-apprentissage.md)
et [`../12-roadmap.md`](../12-roadmap.md)).

## Compromis assumé

**Le lot 2 double de volume.** Deux ADN à concevoir et faire relire, deux jeux de capacités et
d'outils, deux jeux de garde-fous, deux fois plus de conversations de référence pour le
diagnostic ([`../13-verification.md`](../13-verification.md)). Le premier lot qui prouve que le
produit existe prend plus de temps avant le premier client.

**Deux décisions ouvertes supplémentaires apparaissent**, propres au métier Support :
- **D12** — canal d'entrée des demandes (aucun canal défini dans la vision) ;
- D6 (déjà ouverte) s'étend maintenant aux deux métiers, pas seulement au Commercial.

**Le quota d'inférence partagé (€0 strict, [`../16-compromis.md`](../16-compromis.md) C1) est
consommé par deux métiers au lieu d'un.** À capacité totale égale, le nombre de clients actifs
servable diminue d'autant. Si le budget doit être rompu en premier lieu quelque part, ce choix
en rapproche l'échéance.

**Aucune règle métier ou technique ne doit accoupler les deux métiers.** Un employé Support ne
doit jamais dépendre d'un employé Commercial pour fonctionner (et réciproquement) tant que la
collaboration (Phase 2) n'est pas activée — sinon un client qui n'a recruté qu'un seul des deux
se retrouve avec un employé dégradé.

## Quand revisiter

Si, après quelques clients réels, le Support s'avère systématiquement moins recommandé que le
Commercial (diagnostic déséquilibré), documenter l'écart avant d'envisager un troisième métier
plutôt que de forcer artificiellement l'équilibre du moteur de recommandation.
