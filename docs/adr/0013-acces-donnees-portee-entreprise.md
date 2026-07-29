# ADR-0013 — Accès aux données : la portée d'entreprise est obligatoire, pas implicite

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Le lot 0 a posé l'isolation par entreprise en base : RLS activée sur chaque table, politiques
adossées à `is_tenant_member()`, droits explicites, et une migration qui échoue le déploiement si
une table y échappe ([`../../supabase/README.md`](../../supabase/README.md)). `TEST-01` passe.

**Cette protection a un angle mort, et il est large.**

RLS s'applique aux rôles clients. Elle **ne s'applique pas** au rôle de service, celui avec lequel
tourne nécessairement `apps/worker` : un employé numérique travaille sans utilisateur connecté, il
n'a aucun jeton à présenter. Or c'est précisément ce composant qui lit et écrit le plus de données
client — mémoire, tâches, journal, résultats.

Autrement dit : sur le chemin le plus actif du produit, **l'isolation prouvée par `TEST-01`
n'existe pas**. Elle repose entièrement sur le fait qu'un `where tenant_id = …` ne soit jamais
oublié, dans du code écrit sur des mois par une personne seule. C'est exactement la situation que
[`10-securite-rgpd.md`](../10-securite-rgpd.md) décrit comme irrattrapable.

## Décision

**Tout accès aux données passe par un repository qui exige une portée d'entreprise à la
construction. Il n'existe aucune méthode permettant d'interroger une table client sans portée.**

1. Un `TenantScope` se construit à partir d'un `TenantId` et ne peut pas être vide.
2. Les repositories de tables client se construisent **avec** un scope ; chaque requête ajoute la
   condition d'entreprise elle-même, sans que l'appelant l'écrive.
3. Les tables globales (formules, capacités, ADN, réservoir d'identités) ont un type de repository
   **distinct**, en lecture seule, qui ne prend pas de scope — la distinction est portée par le
   type, donc vérifiée à la compilation.
4. Le pilote de base est derrière une interface `SqlClient`. Le code métier ne connaît ni
   Supabase, ni PostgREST, ni le pilote retenu.

La règle tient en une phrase : **oublier la portée d'entreprise doit être impossible, pas
déconseillé.**

## Pourquoi

C'est la même logique que le reste du lot 0. L'ADN n'est pas « à ne pas modifier », il est
immuable par trigger. Le journal n'est pas « à ne pas réécrire », il refuse l'écriture. Une
notification d'évolution ne peut pas mentir, la contrainte l'en empêche. Une règle qui dépend de
la vigilance finit toujours par céder un soir de correctif urgent.

Le point 4 découle de [`02-architecture.md`](../02-architecture.md) : l'application doit rester
**indépendante de l'hébergeur**, une migration étant probable dès le premier client payant. Un
pilote derrière une interface, c'est un fichier à réécrire au lieu de tout le code d'accès.

## Compromis assumé

**1. Deux couches qui font le même travail.** RLS et la portée applicative se recouvrent
largement, et cette redondance a un coût : une isolation exprimée à deux endroits peut diverger.
Le choix est assumé parce que les deux couches ne couvrent pas les mêmes chemins — RLS protège le
client, la portée applicative protège le rôle de service — et parce que la seule alternative
serait de renoncer à l'une des deux sur le chemin où elle est seule.

**2. Le confort de développement baisse.** Écrire une requête libre pour déboguer devient plus
lourd : il faut passer par le repository ou l'assumer explicitement. C'est le prix, et il est
faible comparé à une fuite entre deux clients.

**3. Ce n'est pas une garantie mécanique complète.** Un développeur pressé peut toujours ouvrir
une connexion et écrire du SQL à la main. La décision réduit fortement la surface, elle ne la
supprime pas — contrairement au trigger d'immuabilité de l'ADN, qui, lui, ne se contourne pas.
C'est la limite honnête de cette ADR.

## Quand revisiter

- **Si `apps/worker` devient un service séparé** — la portée devra voyager avec le message de la
  file, pas seulement avec l'objet en mémoire.
- **Si un second métier arrive** — vérifier que la portée reste par entreprise et ne devient pas
  par employé, ce qui relâcherait la garantie.
- **Au premier accès de rôle de service depuis `apps/web`** — c'est le moment où l'angle mort se
  déplacerait vers l'interface, aujourd'hui protégée par RLS.
