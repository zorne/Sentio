# ADR-0012 — Rétention du journal d'exécution : 30 jours

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

[`../15-decisions-ouvertes.md`](../15-decisions-ouvertes.md) listait D9 comme bloquante pour le
schéma du Lot 0 (`FOND-37`) : `execution_event` est le journal en ajout seul, source de vérité de
tout ce qui s'est passé ([`../02-architecture.md`](../02-architecture.md)). Sans durée de
rétention tranchée, le champ ne pouvait pas être écrit dans la migration.

La documentation recommandait 12 mois puis anonymisation, en arbitrage entre volume de base
gratuite et preuve réglementaire. Le fondateur a tranché différemment.

## Décision

**`execution_event.retention = 30 jours`**, en stockage principal.

Une évolution est déjà prévue, pas décidée dans cette ADR : archiver plus tard certains
événements (incidents, métriques, historique client) dans un stockage séparé à rétention plus
longue. Cette ADR ne couvre que la V1.

## Pourquoi

Le fondateur privilégie une base simple pendant le lancement : 30 jours suffisent au débogage, à
l'analyse des erreurs et au suivi des exécutions pendant la phase de démarrage, et limitent la
croissance de la base gratuite ([`../01-contraintes.md`](../01-contraintes.md), €0 strict).

## Compromis assumé

**La fenêtre de preuve réglementaire est courte.** Le journal est aussi la preuve d'une décision
automatisée en cas de litige ou de contrôle ([`../10-securite-rgpd.md`](../10-securite-rgpd.md),
AI Act — [`ADR-0009`](0009-fournisseur-inference-ue.md) pour le précédent d'arbitrage similaire).
À 30 jours, un événement plus ancien que la fenêtre n'est plus démontrable — la recommandation
initiale de 12 mois existait précisément pour cette raison. C'est un risque assumé, pas ignoré :
si un incident ou une demande d'audit portant sur une exécution vieille de plus de 30 jours
survient, il n'y aura pas de trace.

## Quand revisiter

- **Avant le Lot 8 (Conformité et lancement)** — vérifier que 30 jours reste défendable au regard
  du registre des traitements et de l'analyse d'impact sur les décisions automatisées.
- **Si un contrôle ou un litige révèle le besoin d'une fenêtre plus longue** — traiter comme un
  signal fort, pas comme un cas isolé.
- **Au passage à l'archivage différé évoqué ci-dessus** — cette ADR sera remplacée, pas juste
  amendée.
