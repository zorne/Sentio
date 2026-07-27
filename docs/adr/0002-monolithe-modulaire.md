# ADR-0002 — Monolithe modulaire, pas de services séparés

**Date :** 2026-07-27
**Statut :** acceptée

## Contexte

La cible long terme est un système modulaire capable d'ajouter des modèles, des outils et des
capacités sans toucher aux employés existants. La tentation est de découper en services dès le
départ « pour que ce soit scalable ».

## Décision

Un seul dépôt, un seul déploiement. Des **modules à frontières explicites**
([`../02-architecture.md`](../02-architecture.md)), pas des services séparés.

`packages/domain` ne fait aucune entrée/sortie. `apps/worker` ne communique avec `apps/web` que
par la base et la file, jamais par un appel direct.

## Pourquoi

Des services séparés signifient plusieurs hébergements, donc du coût et de l'exploitation —
incompatibles avec le budget €0 et avec un fondateur seul. Or la scalabilité ne vient pas du
découpage physique : elle vient de **frontières propres**. Des frontières propres donnent le
découpage futur sans en payer le prix aujourd'hui.

## Compromis assumé

Tout partage le même processus et les mêmes limites de ressources : un pic sur l'interface et
l'exécution des employés se concurrencent. Le découpage futur, s'il n'est pas discipliné dès
maintenant, deviendra impossible sans réécriture — la discipline des frontières remplace ici une
contrainte que l'architecture physique aurait imposée d'elle-même.

## Quand revisiter

Quand l'exécution des employés subit une contrainte de charge qui lui est propre. C'est
toujours le premier module à saturer, et il est déjà isolé pour ça.
