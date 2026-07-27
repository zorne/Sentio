# ADR-0006 — Capacité (contrat) ≠ outil (moteur)

**Date :** 2026-07-27
**Statut :** acceptée

## Contexte

La vision l'exige explicitement (§21-22) : *« les employés utilisent des capacités, pas des
outils. Aujourd'hui : outil gratuit. Demain : outil premium. L'employé ne change jamais. On
remplace simplement le moteur derrière. »*

## Décision

Un employé déclare avoir besoin d'une **capacité** — un contrat stable, exprimé en termes
métier (« trouver des prospects »). Le **moteur** qui remplit cette capacité est une ligne de
`capability_binding` : il dépend du fournisseur disponible, de la formule du client, et d'une
priorité.

**À appliquer dès le premier outil, même s'il n'existe qu'un seul moteur.**

## Pourquoi

Sans cette séparation, offrir un meilleur moteur aux formules supérieures ou changer de
fournisseur oblige à toucher chaque employé — y compris ceux déjà vendus, ce que le §23
interdit.

C'est aussi ce qui rend crédible la promesse commerciale des formules : Growth et Scale ne
donnent pas d'autres employés, elles donnent de meilleures ressources aux mêmes employés.

## Compromis assumé

**Une indirection en plus dès le premier jour**, alors qu'il n'y aura qu'un seul moteur pendant
des mois. C'est du code qui ne sert à rien immédiatement et qui alourdit la première
implémentation.

C'est accepté parce que c'est le type d'abstraction qui ne se rattrape pas : l'ajouter après
coup oblige à modifier tous les employés existants, c'est-à-dire exactement l'opération que
l'abstraction sert à éviter.

## Quand revisiter

Jamais pour la supprimer. Éventuellement pour enrichir le contrat d'une capacité — auquel cas
c'est une nouvelle version de capacité, pas une modification en place.
