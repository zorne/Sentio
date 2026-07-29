# ADR-0020 — L'ordre des lots devient `0 → 1 → 2 → 4 → 5 → 6 → 3` (D10 rouverte)

**Date :** 2026-07-29
**Statut :** acceptée — remplace l'ordre canonique retenu par [`20-plan-action.md`](../20-plan-action.md)

## Contexte

L'ordre canonique — `0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8` — plaçait l'**exécution autonome** (lot 3)
avant tout ce qui rend le produit visible. Il avait une logique : automatiser complètement avant
de vendre, pour ne jamais servir un client à la main.

Le lot 2 vient d'en montrer la limite. Trois de ses tâches restantes butent sur la même absence :

- le **lien d'opposition** des messages doit atterrir sur une page — qui n'existe pas ;
- le **retour du service d'expédition** a besoin d'un point d'entrée signé — qui n'existe pas ;
- le **diagnostic** attend l'interface pour être éprouvé sur autre chose que des tests.

Autrement dit, le lot 2 ne peut pas être *fini* tant que le lot 4 n'a pas commencé, alors qu'il
peut être fini côté moteur. Continuer dans l'ordre canonique reviendrait à empiler des moteurs
qu'aucun bout à bout n'aurait jamais exercés — exactement ce que la roadmap reproche à un lot aval
construit sur un lot amont incomplet.

## Décision

**L'ordre devient `0 → 1 → 2 → 4 → 5 → 6 → 3`, puis `7` et `8`.**

L'objectif est un **produit cohérent de bout en bout** plutôt qu'un moteur isolé terminé : un
visiteur arrive, est diagnostiqué, recrute un employé, paie, et voit son espace — avant que la
mécanique du battement autonome soit construite.

Ce que cela change concrètement :

1. Le lot 4 (Acquisition) débloque d'un coup la page d'opposition, le point d'entrée des retours
   d'expédition et le diagnostic réel.
2. Le lot 3 (Exécution autonome) passe **après** le dashboard. D'ici là, un run se déclenche à la
   main ou par une commande, et le **premier client est servi de près** — ce que le plan d'action
   recommandait déjà en phase 10.5.
3. Rien d'autre ne bouge : les lots 0 à 2 restent des prérequis durs, le lot 8 reste la condition
   de l'encaissement, et le lot 7 garde ses trois tâches P0 avant la vente.

## Pourquoi

Parce que ce qui n'a jamais tourné de bout en bout n'est pas fini, quelle que soit la couverture
de tests. Chaque bout à bout de ce projet a révélé quelque chose qu'aucun test unitaire n'avait
vu : trois bugs sous vingt-deux tests verts, trois failles d'isolation sous des tests de schéma
verts, un plafond manquant, un identifiant de message absent. Rapprocher le moment du premier
parcours complet est donc la décision la plus rentable disponible.

Et parce que le risque réel du projet est commercial : un produit qu'on peut montrer arrive
beaucoup plus tôt dans cet ordre, ce qui rapproche aussi les premières conversations de vente.

## Compromis assumé

**1. Le premier client ne sera pas servi par un employé pleinement autonome.** Le battement
planifié, la reprise après interruption et la priorité par formule arrivent après. Concrètement :
il faudra déclencher le travail, surveiller, et intervenir — pour un ou deux clients, c'est
tenable ; à dix, ce ne le serait plus. Le lot 3 devient donc bloquant pour le **troisième** client,
pas pour le premier.

**2. L'idempotence et la reprise sont construites avant d'être éprouvées en conditions réelles.**
Elles existent déjà (clé déterministe, réservation avant envoi, trace reconstructible), mais leur
vraie mise à l'épreuve — une panne au milieu d'un run — n'aura lieu qu'au lot 3. Le risque est
accepté parce que les garde-fous sont posés à la base, pas dans le code appelant.

**3. On accepte une dette temporaire d'exploitation :** pas de battement, donc pas d'alerte
« tâche en attente depuis trop longtemps », et une surveillance à faire à la main. À ne pas
laisser durer au-delà du premier client payant.

## Quand revisiter

- **Au deuxième client payant** — c'est le seuil où servir à la main commence à coûter plus cher
  que de construire le lot 3.
- **Si le lot 4 révèle que le diagnostic exige un run persistant** (conversation longue, reprise),
  une partie du lot 3 remonterait avant le lot 5.
- **Si un client exige un engagement de disponibilité** avant le lot 3 : la réponse est non, et
  l'ordre ne change pas pour autant.
