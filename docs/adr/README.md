# Journal des décisions d'architecture (ADR)

Une entrée par décision structurante. **On n'en revient pas sans écrire une nouvelle entrée
qui explique pourquoi.**

---

## Format

Chaque fichier : `NNNN-titre-court.md`, avec exactement ces sections.

```
# ADR-NNNN — Titre

**Date :** AAAA-MM-JJ
**Statut :** proposée | acceptée | remplacée par ADR-XXXX

## Contexte
Ce qu'on savait, ce qui contraignait.

## Décision
Ce qu'on fait. Au présent, sans conditionnel.

## Pourquoi
La raison, pas la justification après coup.

## Compromis assumé
Ce qu'on perd. OBLIGATOIRE — une décision sans compromis écrit est une décision
qu'on n'a pas comprise.

## Quand revisiter
Le signal concret qui obligera à rouvrir le sujet.
```

La section **Compromis assumé** n'est jamais vide. Si tu n'en trouves pas, c'est que tu n'as
pas compris ce que la décision coûte — cherche encore.

---

## Entrées

| # | Décision | Statut |
|---|---|---|
| [0001](0001-repartir-de-zero.md) | Repartir de zéro plutôt que reprendre un code existant | acceptée |
| [0002](0002-monolithe-modulaire.md) | Monolithe modulaire, pas de services séparés | acceptée |
| [0003](0003-deux-contextes.md) | Deux contextes de mémoire, ADN immuable | acceptée |
| [0004](0004-run-machine-a-etats.md) | Un run est une machine à états persistée | acceptée |
| [0005](0005-cles-plateforme-classe-de-donnees.md) | Clés de la plateforme + routage par classe de données | acceptée |
| [0006](0006-capacite-vs-outil.md) | Capacité (contrat) ≠ outil (moteur) | acceptée |
| [0007](0007-perimetre-v1-commercial-support.md) | Périmètre V1 : deux métiers, Commercial + Support | acceptée |

---

## Quand écrire une entrée

- Un choix qui sera coûteux à défaire.
- Un choix qui surprendra quelqu'un qui arrive après.
- Un choix pris **contre** une recommandation de la documentation.
- Une décision de [`../15-decisions-ouvertes.md`](../15-decisions-ouvertes.md) qui vient
  d'être tranchée — **la retirer de cette liste et l'écrire ici**.

Pas besoin d'entrée pour : un choix de bibliothèque banal, une convention de nommage, un
détail réversible en dix minutes.
