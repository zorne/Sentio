# 22 — Niche et verticalisation

> À lire si tu travailles sur : l'ADN du métier, le diagnostic, les capacités, ou le choix de la
> cible commerciale.
>
> **Vérifié le 2026-07-28.** Document **interne**. Les chiffres de marché sont périssables.

Ce fichier répond à une question simple : **faut-il un employé générique ou un employé de niche ?**
Les données ne sont pas ambiguës, et elles remettent en cause une décision déjà actée.

---

## Le vertical écrase l'horizontal

| Mesure | Vertical (niche) | Horizontal (générique) |
|---|---|---|
| Rétention | **3 à 5× supérieure** | référence |
| Revenu net à l'échéance | 110-130 % | 90-95 % |
| Produit encore utile à 6 mois | **71 %** | 32 % |
| Retour sur investissement moyen | **2,3×** | référence |
| Croissance du segment | 36,5 %/an | 18,9 %/an |

Ces écarts ne sont pas des marges d'erreur, ce sont des ordres de grandeur. Un produit horizontal
perd son client dans l'année ; un produit vertical le garde et lui vend davantage.

**La raison est structurelle :** l'avantage défendable se forme à la **couche donnée métier**, pas à
la couche modèle. Le vocabulaire d'un secteur, ses cycles, ses objections, ses interlocuteurs, ses
obligations — tout cela se réplique lentement. Un modèle se remplace en une ligne de configuration.

**Et le segment est libre :** les éditeurs financés vendent tous vers le haut et laissent les TPE et
les indépendants ouverts. Des produits verticaux sur des métiers étroits atteignent 10 K$ de revenu
mensuel **sans équipe commerciale**, par la distribution via les fédérations professionnelles. C'est
exactement le profil accessible à un fondateur seul sans budget.

---

## Ce que ça dit du périmètre actuel

[`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md) retient un métier : **Commercial**. Or la
prospection commerciale est le même travail pour tout le monde — **c'est la définition d'un produit
horizontal**, celui que les données placent à 90-95 % de revenu net et 32 % d'utilité à six mois.
C'est aussi le terrain où Sentio affronte des acteurs financés.

**Ce n'est pas une raison d'abandonner le métier Commercial.** C'en est une de le restreindre : non
pas « un commercial », mais **« un commercial pour telle niche »** — qui connaît le vocabulaire du
secteur, ses cycles d'achat, ses objections types et ses interlocuteurs réels.

Concrètement, la niche ne change ni l'architecture, ni les capacités, ni le modèle de données. Elle
change **le contenu de l'ADN** (`METIER-01`), la liste des prospects pertinents, et le discours.
C'est le changement le moins coûteux techniquement et le plus rentable commercialement.

---

## Où sont les niches, au 2026-07

**Déjà encombrées par des acteurs financés** — à éviter pour un fondateur seul : juridique, santé,
support client, assurance, et la voix pour les métiers techniques du bâtiment. Ces segments ont vu
émerger des acteurs à plusieurs centaines de millions de revenu annuel et des valorisations en
milliards. On n'y entre pas sans capital.

**Encore ouvertes** — première place encore prenable : gestion de cabinets vétérinaires, conformité
des sous-traitants du bâtiment, analyse d'investissement immobilier, pompes funèbres, experts
d'assurance indépendants.

**La règle qui structure le choix :** *rester plus étroit que ce que les acteurs financés acceptent
d'être.* Un marché de 5 à 50 K$ de revenu mensuel est invisible pour un éditeur levé — et
parfaitement viable pour une personne seule.

### Grille de sélection

Une niche doit satisfaire **les six**, pas quatre :

| Critère | Pourquoi il est éliminatoire |
|---|---|
| **Tu peux atteindre les premiers clients** | sans réseau ni accès, la phase 10 du plan n'aboutit pas — c'est le critère n°1 pour un fondateur seul |
| Le blocage est commercial | Sentio vend un commercial : si le blocage est ailleurs, le produit ne sert à rien |
| Les clients sont identifiables et listables | sinon la capacité « trouver des prospects » n'a rien à traiter |
| Ils ont les moyens de payer un abonnement | une marge trop faible rend le prix impossible |
| Le vocabulaire est spécifique | c'est ce qui crée l'avantage défendable |
| Aucun acteur financé n'y est déjà | sinon la course est perdue d'avance |

> ⚠️ **Le critère d'accès prime sur la taille du marché.** Une niche parfaite sur le papier mais dont
> tu ne connais personne vaut moins qu'une niche moyenne où tu peux décrocher trois rendez-vous
> cette semaine. Le choix reste ouvert : **décision D15**.

---

## Ce que le client peut réellement demander

Le diagnostic doit rester une vraie conversation qui interroge la situation du client, mais il faut
être précis sur ce qu'il produit — sinon on promet ce que l'employé ne tiendra pas.

| Couche | Adaptable au client ? | Contenu |
|---|---|---|
| **ADN** (`employee_definition`) | ❌ **jamais** | le métier, ses limites, ses règles, sa manière de raisonner. Commun à tous les clients de la niche, versionné, immuable |
| **Contexte entreprise** (`company_profile`) | ✅ **oui, largement** | objectifs, produits, processus, préférences, cible, ton, arguments, exclusions |
| **Capacités actives** (`employee_capability`) | ✅ oui, dans les limites de l'ADN | ce que cet employé fait réellement pour ce client |
| **Faits appris** (`learned_fact`) | ✅ oui, par l'usage | ce qui fonctionne sur ce marché précis |

« Le produit s'adapte au client » signifie donc : **la couche contexte entreprise est riche, et le
diagnostic la remplit sérieusement.** Cela ne signifie jamais un ADN modifiable — l'invariant 1 tient,
et c'est lui qui permet d'améliorer l'employé pour tous les clients d'un coup.

**La dette à surveiller :** chaque attente exprimée pendant le diagnostic est une promesse. Plus le
diagnostic laisse le client formuler de demandes, plus l'employé doit tenir. Les demandes hors
périmètre doivent être dites comme telles au moment où elles sont formulées, pas découvertes après la
vente.

---

## Conséquence sur le diagnostic

Le diagnostic ne recommande plus un métier — il **calibre** l'employé. Voir
[`adr/0010`](adr/0010-diagnostic-calibrage.md), qui remplace le compromis C7 par une décision réelle.
