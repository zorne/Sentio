# 04 — Les deux contextes ⭐

> À lire si tu travailles sur : la mémoire, l'apprentissage, la création d'un employé,
> l'assemblage de contexte, ou **avant toute modification touchant un employé**.
>
> **C'est le fichier le plus important du dépôt.** L'exigence vient directement du fondateur.

---

## L'exigence, telle qu'elle a été formulée

Quand on crée un employé, il doit avoir **deux types de données différents, tous deux stockés
dans Supabase** :

1. **Le Contexte Général** — l'ADN de l'employé. **Le même pour toutes les entreprises** qui
   recrutent ce métier. **Non modifiable.**
2. **Le Contexte Entreprise** — ce que le client attend, son entreprise, ses objectifs.
   **Modifiable par le client et par l'auto-apprentissage.**

---

## Couche 1 — Contexte Général (l'ADN)

**Table :** `employee_definition`, **versionnée**.

**Contient :**
- le métier (commercial, support, comptable…)
- le rôle et les responsabilités
- les limites du périmètre
- la manière de raisonner
- les règles de fonctionnement
- les capacités autorisées
- le comportement attendu
- les contraintes de sécurité
- la personnalité professionnelle
- l'architecture interne de l'employé

**Caractéristiques :**

| | |
|---|---|
| Portée | **commun à toutes les entreprises** utilisant ce métier |
| Stockage | Supabase |
| Modifiable par le client | **non** |
| Modifiable par l'auto-apprentissage | **non, jamais** |
| Modifiable par Sentio | oui, **uniquement par publication d'une nouvelle version** |

C'est l'ADN de l'employé numérique. C'est lui qui garantit qu'un commercial restera toujours
un commercial et ne deviendra jamais un support ou un comptable.

**Jamais de modification en place.** Une amélioration crée une version `v2` ; les employés déjà
vendus restent figés sur `v1` jusqu'à une migration explicite et réversible.
Voir [`06-scalabilite.md`](06-scalabilite.md).

---

## Couche 2 — Contexte Entreprise (la mémoire métier)

**Tables :** `company_profile` et `learned_fact`.

**Contient :**
- les objectifs du client
- les informations sur l'entreprise
- les produits, les services
- les processus internes
- les préférences du dirigeant
- les documents fournis
- les KPI à atteindre
- les stratégies apprises
- les connaissances acquises
- les améliorations réalisées
- les retours d'expérience
- les habitudes de travail

**Caractéristiques :**

| | |
|---|---|
| Portée | **propre à chaque entreprise** |
| Stockage | Supabase |
| Modifiable par le client | **oui** |
| Modifiable par l'auto-apprentissage | **oui** |
| Modifiable par Sentio | oui, si nécessaire |

Cette mémoire évolue continuellement afin d'améliorer les performances de l'employé.

### Pourquoi deux tables pour une seule mémoire

La séparation est **technique, pas fonctionnelle** :

| Table | Nature | Volume |
|---|---|---|
| `company_profile` | un état structuré et stable (qui est l'entreprise, ce qu'elle vend, ce qu'elle vise) | peu de lignes, lues à chaque run |
| `learned_fact` | une accumulation produite par le travail (ce qui marche, ce qui a été tenté, les habitudes observées) | beaucoup de lignes, triées, expirables |

Les mélanger ferait exploser le coût et la taille du contexte au bout de quelques semaines
d'exploitation. **Fonctionnellement, le client comme l'apprentissage écrivent des deux côtés.**

### Traçabilité obligatoire

Chaque ligne des deux tables porte : **auteur** (`client` / `sentio` / `apprentissage`),
**date**, **tâche source**, **statut** (`proposé` / `actif` / `retiré`), **compteur
d'utilisation**.

Conséquences directes :
- l'apprentissage peut modifier le profil entreprise ; selon le réglage retenu (décision D8),
  la modification s'applique seule avec notification, ou attend un accord ;
- toute modification est **réversible ligne par ligne** : on sait toujours qui a écrit quoi,
  quand, et à partir de quelle tâche ;
- le client peut consulter, corriger et retirer n'importe quel élément — ce qui satisfait
  aussi le droit de contestation d'une décision automatisée.

---

## Couche 3 — Contexte de tâche (éphémère, **ce n'est pas une mémoire**)

Ce que l'employé assemble pour un run précis : l'objectif du jour, les données lues, la trace
des outils déjà appelés. Vit dans le journal d'exécution, **jamais** dans la mémoire long
terme. Sans cette séparation, la mémoire se pollue de détails opérationnels et le coût
d'inférence explose.

---

## Ordre d'assemblage du contexte, à chaque appel de modèle

```
1. ADN (Contexte Général)          ← position non négociable, en premier
2. Profil entreprise               ← qui est le client, ce qu'il vise
3. Faits appris pertinents         ← triés, bornés en nombre
4. Contexte de la tâche en cours   ← éphémère
```

Un fait appris qui contredirait une limite de l'ADN n'est **jamais** injecté.

---

## Les trois verrous — pourquoi la garantie est architecturale et pas rédactionnelle

Un prompt qui dit « tu es commercial, ne fais pas de comptabilité » ne garantit rien : un
modèle peut être détourné, mal interpréter, ou dériver. La garantie doit être mécanique.

1. **Verrou de capacité** — un employé ne peut appeler qu'une capacité listée dans son ADN.
   Un employé commercial n'a **physiquement pas d'accès** à une capacité comptable.
2. **Verrou d'écriture** — l'apprentissage écrit dans le Contexte Entreprise (les deux tables)
   et **jamais** dans l'ADN. Techniquement : **il n'existe aucun chemin de code** entre le
   module d'apprentissage et `employee_definition`. Ce n'est pas une règle de prompt, c'est une
   absence de code.
3. **Verrou de contexte** — l'ADN est injecté en premier, en position non négociable, et rien
   de ce qui le contredit n'entre dans le contexte.

**Test d'acceptation** (voir [`13-verification.md`](13-verification.md)) : après plusieurs
dizaines de runs, `employee_definition` doit être **identique bit pour bit**. Seuls
`learned_fact`, `company_profile` et le journal ont changé.

---

## Erreurs à ne jamais commettre

| Erreur | Pourquoi c'est grave |
|---|---|
| Écrire l'ADN dans la même table que la mémoire d'entreprise | l'apprentissage finira par l'écraser un jour, et personne ne s'en apercevra |
| Laisser l'apprentissage réécrire l'ADN « juste pour cette entreprise » | l'employé change de métier en silence — c'est exactement ce que la vision interdit |
| Mettre l'ADN dans un prompt en dur dans le code | plus de versionnage, plus d'audit, plus de migration possible |
| Injecter tous les faits appris à chaque run | le coût d'inférence croît sans limite avec l'ancienneté du client |
| Oublier l'auteur sur une ligne de mémoire | impossible de répondre à « pourquoi mon employé croit ça ? » |
