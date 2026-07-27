# 00 — Vision

> À lire si tu travailles sur : n'importe quoi. C'est le point de départ.
> Source brute : [`../projet.md`](../projet.md) (écrit par le fondateur, prioritaire sur le *quoi*).

---

## La mission

Sentio n'est pas un logiciel d'intelligence artificielle. C'est un **cabinet de recrutement
d'employés numériques autonomes**.

Le dirigeant n'achète jamais un outil. Il recrute un collaborateur spécialisé qui travaille
dans son entreprise pour atteindre un objectif précis :

> « Je souhaite augmenter mon chiffre d'affaires de 5 000 € par mois. »

Sentio analyse l'entreprise et crée l'employé numérique le plus pertinent.

## La philosophie

Le client ne doit jamais avoir l'impression d'utiliser une IA. Il doit avoir l'impression :
- de **recruter** un collaborateur,
- de **suivre** ses performances,
- de voir son **équipe grandir**.

Le vocabulaire n'est pas cosmétique, c'est le produit. Voir [`17-lexique.md`](17-lexique.md).

---

## Les règles produit qui contraignent l'architecture

Chacune de ces règles a une conséquence technique directe, indiquée à droite.

| Règle produit | Conséquence technique |
|---|---|
| Le client ne choisit **jamais** son employé, Sentio recommande | moteur de règles déterministe, pas un choix du modèle → [`07`](07-parcours-produit.md) |
| Chaque employé a une identité unique, **jamais réutilisée** | réservoir d'identités avec réservation atomique → [`03`](03-modele-de-donnees.md) |
| Un commercial reste commercial, **toujours** | ADN immuable + verrou de capacité → [`04`](04-contextes-memoire.md) |
| Les employés **évoluent seuls**, mais dans leur métier uniquement | apprentissage écrit dans la mémoire d'entreprise, jamais dans l'ADN → [`08`](08-evolution-apprentissage.md) |
| Le client ne voit jamais les futurs employés ni un catalogue | pas de page « nos agents », recommandation unique et contextuelle |
| Un nouvel employé n'est proposé que si un **nouveau blocage** est détecté | la recommandation naît d'une mesure, pas d'un calendrier commercial |
| Le dashboard ne montre **jamais** la complexité technique | pas de modèle, pas d'outil, pas de workflow visible côté client |
| Le dashboard montre CA, temps économisé, conversion, ROI | modèle d'attribution honnête obligatoire → [`09`](09-metriques-roi.md) |
| Le client ne retourne **jamais** sur la vitrine après connexion | deux zones étanches → [`02`](02-architecture.md) |
| Trois formules (Start / Growth / Scale), **une seule vendue en V1** | quotas en données dès le jour 1 → [`06`](06-scalabilite.md) |
| Un changement de formule ne recrée aucun employé, ne perd aucune mémoire | l'abonnement change l'environnement, jamais l'employé |
| Une mise à jour ne casse jamais un employé déjà vendu | ADN versionné + migrations sans interruption → [`06`](06-scalabilite.md) |
| L'employé utilise des **capacités**, pas des outils | contrat stable, moteur remplaçable → [`06`](06-scalabilite.md) |

---

## Les trois types de notification (§17 de la vision)

| Type | Exemple | Condition d'émission |
|---|---|---|
| **Recrutement** | « Bienvenue. Carter rejoint officiellement votre entreprise. » | à la création de l'employé |
| **Travail** | « Carter a signé trois nouveaux prospects. » | événement mesuré au journal |
| **Évolution** | « Carter a amélioré sa stratégie commerciale. » | **uniquement si une ligne `strategy_change` existe** |

La troisième condition est un invariant, pas un détail : voir
[`08-evolution-apprentissage.md`](08-evolution-apprentissage.md).

---

## Ce que la V1 fait, et ce qu'elle ne fait pas

**Fait :** diagnostic, recommandation, recrutement, un métier réel qui travaille seul,
dashboard avec mesures réelles, paiement, notifications, formule Start.

**Ne fait pas (préparé, pas construit) :** collaboration entre plusieurs employés (Phase 2),
formules Growth et Scale (activées par une donnée, pas par du code), capacités premium (Phase 3).

**Ne fera jamais :** du ré-entraînement de modèle. L'apprentissage passe par la mémoire, jamais
par les poids.
