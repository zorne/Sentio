# ADR-0005 — Clés de la plateforme + routage par classe de données

**Date :** 2026-07-27
**Statut :** acceptée

## Contexte

Deux options s'opposaient pour payer l'inférence :
1. **Clé fournie par le client** — dépense nulle pour la plateforme, mais le client doit créer
   un compte chez un fournisseur de modèles et coller une clé à l'inscription ;
2. **Clés de la plateforme** — le client ne voit jamais un modèle, mais la plateforme absorbe
   le coût et le quota.

La vision tranche implicitement : *« le client ne doit jamais avoir l'impression d'utiliser une
IA »* (§2) et *« le tarif est totalement indépendant des modèles IA, des APIs, des outils »*
(§26). Demander une clé au client casse les deux en une seule minute d'inscription.

## Décision

**Clés de la plateforme.** Le client ne fournit jamais de clé, ne voit jamais un nom de modèle.

Le Model Gateway est le point de passage unique de tout appel, et applique un **routage par
classe de données** : une requête portant des données réelles d'un client ne peut pas partir
vers un fournisseur qui n'est pas contractuellement « sans entraînement ». Le fournisseur
incompatible est **sauté**, pas tenté.

Le Gateway compte chaque appel (par entreprise et par fournisseur) et applique des plafonds
durs, avec trois enveloppes séparées : clients / vitrine / interne.

## Pourquoi

C'est la seule option cohérente avec le produit vendu. Le routage par classe de données est ce
qui permet d'utiliser un fournisseur gratuit pour la démonstration sans jamais y exposer un
client réel — la règle est appliquée par construction, pas par vigilance.

## Compromis assumé

**La capacité totale du produit devient un quota partagé par tous les clients.** Avec des
tiers gratuits, l'ordre de grandeur réaliste est de quelques dizaines de runs par jour, tous
clients confondus. Voir [`../16-compromis.md`](../16-compromis.md), C1 et C2.

Le fournisseur de secours gratuit ne peut servir que la démonstration : **la capacité réelle
est celle du seul fournisseur conforme**, sans filet.

S'ajoute une zone grise juridique : l'usage commercial d'un tier gratuit d'inférence est au
mieux mal couvert par les conditions d'utilisation. À vérifier avant d'encaisser.

## Quand revisiter

Dès que le quota journalier dépasse 60-70 % de consommation, ou dès le premier client payant.
C'est le meilleur endroit où rompre le €0 : quelques euros par mois multiplient la capacité par
un ordre de grandeur et sortent de la zone grise.
