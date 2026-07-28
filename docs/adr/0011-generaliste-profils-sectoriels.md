# ADR-0011 — Sentio reste généraliste ; la niche est celle du client

**Date :** 2026-07-28
**Statut :** acceptée

## Contexte

L'étude [`../22-niche-et-verticalisation.md`](../22-niche-et-verticalisation.md) montre qu'un produit
vertical retient 3 à 5 fois mieux qu'un produit horizontal, et recommandait de restreindre Sentio à
une niche unique (décision D15).

Le fondateur tranche autrement : **Sentio n'a pas de niche.** Il accepte tous les secteurs, et c'est
l'IA du diagnostic qui adapte l'employé au secteur **du client**. La verticalisation ne se fait pas au
niveau du produit, elle se fait **par client, au moment du calibrage**.

Ce choix préserve la vision d'origine — un cabinet de recrutement qui conseille le bon employé, quel
que soit le dirigeant qui se présente — et il reste compatible avec
[`0010`](0010-diagnostic-calibrage.md) : le diagnostic calibre aujourd'hui, et recommandera vraiment
le jour où un deuxième métier existera.

Mais il ouvre un problème que le dépôt interdit de résoudre par l'apprentissage.
[`../08-evolution-apprentissage.md`](../08-evolution-apprentissage.md) pose une **ligne rouge** :
*« une entreprise ne doit jamais bénéficier des données d'une autre »*. Sans mécanisme, le dixième
client d'un secteur repart donc exactement de zéro comme le premier : **la connaissance sectorielle
ne s'accumule jamais**, et l'avantage vertical est perdu sans être remplacé.

## Décision

**Sentio reste généraliste. La spécialisation sectorielle passe par des profils sectoriels écrits
par Sentio, jamais appris des clients.**

Une nouvelle table globale, `sector_profile`, sur le modèle de `employee_definition` : **commune à
toutes les entreprises, versionnée, jamais modifiée en place**. Elle contient, pour un secteur donné,
ce qu'un bon commercial de ce secteur doit savoir — vocabulaire, interlocuteurs types, cycle d'achat,
objections courantes, angles d'accroche, exclusions habituelles.

Le parcours devient :

1. le diagnostic identifie le secteur du client ;
2. le moteur de règles déterministe sélectionne le `sector_profile` correspondant ;
3. au recrutement, ce profil est injecté dans l'initialisation du contexte entreprise, avec les
   éléments propres au client.

**Origine des profils, non négociable :** ils sont **rédigés par Sentio** à partir de connaissances
publiques, de son propre travail de terrain et des retours que le fondateur obtient en vendant.
**Jamais dérivés des données d'un client pour servir un autre.** La ligne rouge tient : ce n'est pas
de l'apprentissage inter-entreprises, c'est de la connaissance métier éditoriale, au même titre que
l'ADN.

**Secteur inconnu :** aucun profil ne correspond → l'employé travaille sur l'ADN générique seul, et
c'est dit au client. On ne fabrique jamais un profil sectoriel à la volée pour faire illusion.

## Pourquoi

Parce que c'est la seule façon de capter une partie de l'avantage vertical sans renoncer au produit
que le fondateur veut vendre. Chaque profil écrit rend Sentio meilleur sur un secteur **pour tous ses
futurs clients de ce secteur**, sans qu'aucune donnée client ne circule.

Parce que l'effort est cumulatif et sous contrôle : un profil sectoriel est un document, pas du code.
Il s'écrit en quelques heures, se corrige, se versionne, et ne demande aucun déploiement — c'est
exactement le principe « ce qui change vit en base ou en configuration ».

Et parce que cela transforme la faiblesse du généraliste en trajectoire : au début Sentio est moyen
partout ; au fil des ventes, il devient bon sur les secteurs où il a réellement travaillé.

## Compromis assumé

**1. Sentio est moyen partout avant d'être bon quelque part.** C'est l'inverse d'une stratégie de
niche : la rétention supérieure du vertical n'est pas acquise, elle se construit profil par profil.
Les premiers clients seront servis par un employé générique, et il faut le savoir en les vendant.

**2. La distribution reste à inventer.** Une niche unique donne un canal — une fédération
professionnelle, un salon, une liste. Un produit généraliste n'a pas ce canal, et la phase 10 du plan
d'action est donc plus difficile. **C'est le vrai coût de cette décision, et il est commercial, pas
technique.**

**3. Un profil sectoriel mal écrit est pire que pas de profil.** Il fait parler l'employé avec
assurance dans un vocabulaire qu'il maîtrise mal — une panne silencieuse. D'où l'obligation de dire
au client quand aucun profil ne correspond, plutôt que d'improviser.

**4. La charge éditoriale est permanente.** Chaque secteur ajouté est un document à écrire et à
maintenir. À budget zéro et à une personne, cela plafonne le nombre de secteurs réellement couverts —
il vaut mieux trois profils solides que douze approximatifs.

## Quand revisiter

- **Si un secteur représente une majorité des clients** : la question de la niche se repose, mais par
  les faits plutôt que par le pari.
- **Si les clients d'un secteur sans profil résilient plus vite** que ceux d'un secteur couvert : le
  profil devient un préalable à la vente, pas un bonus.
- **Si la charge d'écriture des profils empêche de construire le produit** : réduire le nombre de
  secteurs acceptés, jamais la qualité des profils.
