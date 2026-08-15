# ADR-0008 — Périmètre de la V1 : Commercial seul

**Date :** 2026-07-27
**Statut :** **remplacée par [ADR-0029](0029-noyau-lady-configure-dynamiquement.md)** (2026-08-15) —
remplaçait [ADR-0007](0007-perimetre-v1-commercial-support.md), retranchait la décision D1

> Le métier n'est plus une entrée du système. Le noyau est généraliste et sa configuration sort du
> diagnostic ([`0029`](0029-noyau-lady-configure-dynamiquement.md),
> [`../28-bibliotheque-et-creation-de-lady.md`](../28-bibliotheque-et-creation-de-lady.md)).
> Entrée conservée pour l'histoire : elle explique pourquoi le schéma porte encore
> `unique (profession, version)`.

## Contexte

ADR-0007, prise le même jour, avait ouvert la V1 à deux métiers (Commercial + Support) pour
que la recommandation du diagnostic soit une vraie décision entre deux issues, plutôt qu'un
théâtre à choix unique.

Le fondateur revient sur ce choix : **retour à un seul métier réel au lancement, Commercial.**

## Décision

La V1 lance avec **un seul métier réel : Commercial.**

Le registre de métiers (`employee_definition`) reste conçu pour en accueillir plusieurs — ADN
versionné, indépendant par métier ([`../04-contextes-memoire.md`](../04-contextes-memoire.md)) —
mais un seul est écrit et commercialisé au lancement.

## Pourquoi

Un métier qui produit réellement du chiffre d'affaires, mesurable et crédible, vaut mieux que
deux métiers construits en parallèle avec un budget et un temps de développement identiques.
Concentrer l'effort de la Phase 1 sur un seul employé maximise la probabilité qu'il soit
réellement bon avant le premier client, plutôt que deux employés à moitié aboutis.

## Compromis assumé

**Le théâtre de la recommandation revient** ([`../16-compromis.md`](../16-compromis.md), C7) :
avec un seul métier possible, le diagnostic conclut toujours pareil. Ce compromis n'est
acceptable qu'à une condition stricte, déjà actée : si le frein détecté sort du périmètre
disponible, le diagnostic **le dit** et propose une liste d'attente — il ne vend jamais un
employé incapable de faire le travail (recommandation R14).

**D12 (canal d'entrée du Support) redevient sans objet** — retirée de
[`../15-decisions-ouvertes.md`](../15-decisions-ouvertes.md) tant qu'un métier Support n'est
pas reconstruit. D6 (domaine d'envoi des emails) revient à ne concerner que le Commercial.

Le lot 2 revient à son volume initial : un seul ADN, un seul jeu de capacités, un seul jeu de
conversations de référence pour le diagnostic.

## Quand revisiter

Un deuxième métier — Support en priorité, pour les raisons déjà posées dans ADR-0007 — dès que
le Commercial produit des résultats mesurés chez au moins un client réel. Ajouter un métier au
registre est alors une nouvelle version d'ADN, jamais une refonte
([`../06-scalabilite.md`](../06-scalabilite.md)).
