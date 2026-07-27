# ADR-0004 — Un run est une machine à états persistée

**Date :** 2026-07-27
**Statut :** acceptée

## Contexte

Les employés doivent travailler seuls, en arrière-plan. Le budget €0 n'offre aucun processus
permanent : pas de worker, pas de serveur applicatif dédié. Par ailleurs, certaines actions
doivent pouvoir s'interrompre pour attendre l'accord d'un humain, parfois pendant des jours.

## Décision

Un run n'est pas une boucle en mémoire mais une **machine à états persistée**. Chaque battement
planifié exécute un pas borné, enregistre l'état complet en base, et rend la main. Rien n'est
conservé entre deux pas ; l'état se reconstruit depuis le journal.

Toute action à effet extérieur porte une **clé d'idempotence**.

## Pourquoi

Ce modèle résout trois problèmes d'un seul coup :
- il ne demande aucun processus permanent, donc il tient à €0 ;
- une tâche en attente d'accord humain n'est qu'un état persisté de plus, donc la reprise est
  gratuite et résiste à un redémarrage ;
- passer de 1 à 50 exécutants en parallèle ne change pas le modèle, seulement le nombre de
  consommateurs de la file.

L'idempotence n'est pas optionnelle : sans elle, la première panne réelle envoie deux fois le
même email à un prospect, et le client perd confiance dans son employé.

## Compromis assumé

**Les employés travaillent par battements, pas en continu.** Il faut l'assumer dans le discours
client : « Carter travaille chaque jour » est vrai, promettre du temps réel serait faux.

Le code est aussi plus verbeux qu'une boucle simple : chaque pas doit être explicitement
persistable et reprenable, ce qui interdit certains raccourcis naturels.

## Quand revisiter

Si un budget permet un processus permanent, la machine à états reste valable et devient
simplement plus rapide — il n'y aura rien à réécrire. C'est précisément l'intérêt du modèle.
