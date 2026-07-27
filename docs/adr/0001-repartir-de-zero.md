# ADR-0001 — Repartir de zéro

**Date :** 2026-07-27
**Statut :** acceptée

## Contexte

Un code antérieur du même fondateur couvrait déjà une partie du besoin : noyau d'orchestration
de modèles, moteur de politique, mémoire, interface web, base avec isolation, paiement par lien,
envoi d'emails. Il portait aussi de la dette : authentification différée puis rebranchée à
moitié, métiers partiellement simulés, décisions produit contradictoires accumulées.

## Décision

Sentio repart d'un dépôt neuf. Aucun code n'est repris.

## Pourquoi

Le produit change de nature, pas seulement de nom : recommandation à la place du choix par le
client, deux contextes de mémoire, formules pilotées par les données, honnêteté des métriques
comme contrainte de conception. Greffer ces exigences sur une base construite autrement coûte
plus cher que de repartir, et laisse des chemins d'accès obsolètes qu'on découvre trop tard.

## Compromis assumé

**Trois à quatre semaines de reconstruction de choses qui fonctionnaient déjà.** C'est du temps
pris sur la recherche du premier client — le risque réel du projet n'est pas technique, il est
commercial.

Mitigation : le code antérieur reste une **référence gratuite**. Ses décisions documentées
recensent des incidents déjà vécus (encodage des appels d'outils en texte libre, quota épuisé
pendant la réflexion d'après-run, repli entre fournisseurs). Les relire avant d'écrire
l'équivalent évite de repayer les mêmes erreurs.

## Quand revisiter

Si à mi-parcours du lot 3 la reconstruction dépasse largement l'estimation, reprendre
sélectivement des modules éprouvés de l'ancien code plutôt que de tenir le dogme.
