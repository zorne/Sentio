# 06 — Scalabilité : les six mécanismes

> À lire si tu travailles sur : un ajout de fonctionnalité, un nouvel outil, une nouvelle
> formule, une mise à jour d'employé.
>
> Objectif : **ajouter des modèles, des APIs, des outils, des capacités sans modifier les
> employés existants** (§21-22 de la vision).

---

## 1. Capacité ≠ outil

L'employé déclare avoir besoin d'une **capacité** : « trouver des prospects ».
Quel moteur remplit cette capacité est une ligne de `capability_binding`.

```
Capacité : « trouver des prospects »   ← contrat stable, l'employé ne connaît que ça
      │
      ├── aujourd'hui : moteur gratuit
      └── demain     : moteur premium (réservé aux formules supérieures)
```

Changer de fournisseur, ou en offrir un meilleur aux formules supérieures, ne touche **aucun
employé existant**. C'est l'exigence §21 de la vision, rendue mécanique.

**À faire dès le premier outil, même s'il n'y a qu'un seul moteur.** C'est l'un des points qui
ne se rattrape pas sans réécrire les employés.

---

## 2. Journal en ajout seul

`execution_event` est la source de vérité. Tout le reste — états, statistiques, fiches
d'employé — est une projection reconstructible.

Ce que ça donne gratuitement : l'audit, le débogage, la reprise après interruption, la preuve
réglementaire, et plus tard des vues de lecture séparées si la charge l'exige.

**Corollaire :** ne jamais mettre à jour une ligne de journal. On en ajoute une nouvelle.

---

## 3. File de travaux dans Postgres

Une table `job`, consommée avec verrouillage par ligne et saut des lignes déjà verrouillées.

- C'est une **vraie** file : elle tient plusieurs milliers de tâches par jour.
- Elle coûte €0.
- Elle se remplace plus tard par une file managée **sans toucher au domaine**.

Sa colonne `priorité` **est** la promesse commerciale « priorité d'exécution » des formules
Growth et Scale. La promesse est donc déjà exécutable : il n'y a qu'une valeur à changer.

---

## 4. Formules et quotas pilotés par les données

Les trois formules existent en base **dès le premier jour**. Seul Start porte le drapeau
« commercialisable ».

**Ouvrir Growth = modifier une ligne. Pas déployer une version.**

Règle absolue : aucune condition `si formule = Start` dans le code. Uniquement des lectures de
quota. Si tu écris une condition sur le nom d'une formule, tu viens de rendre le lancement de
la formule suivante dépendant d'un déploiement — exactement ce que le §28 de la vision
interdit.

---

## 5. Versionnage des employés

Chaque employé est **figé sur une version d'ADN**.

```
employee_definition « commercial » v1  ──► employés recrutés en janvier
employee_definition « commercial » v2  ──► employés recrutés en mars
                                           (v1 migre sur décision explicite, réversible)
```

Une amélioration **publie une nouvelle version**, elle ne modifie jamais l'existante. Les
employés déjà vendus ne migrent que sur décision explicite, avec retour arrière possible.

C'est la traduction technique du §23 : *« les améliorations ne doivent jamais casser les agents
déjà vendus »*.

**Migrations de base en quatre temps : étendre → remplir → basculer → retirer.** Chaque étape
est compatible avec la version précédente du code, donc le déploiement se fait **sans
interruption** — mieux que les « quelques heures de maintenance » que la vision s'autorise.

---

## 6. Frontières prêtes pour l'extraction

`apps/worker` ne communique avec `apps/web` que par **la base et la file**. Jamais par un
appel direct, jamais par un état partagé en mémoire.

Le jour où l'exécution devient le goulot d'étranglement — c'est toujours le premier module à
saturer — il devient un service autonome par simple redéploiement du module existant. Aucune
réécriture, aucune migration de données.

---

## Le test à s'appliquer avant d'ajouter quoi que ce soit

Avant d'écrire une fonctionnalité, réponds à ces trois questions :

1. **Si on remplace le moteur derrière, l'employé change-t-il ?** Si oui, tu as codé un outil
   là où il fallait une capacité.
2. **Si on ouvre la formule Growth demain, faut-il déployer ?** Si oui, tu as mis une règle
   métier dans le code au lieu de la base.
3. **Si un client a été recruté il y a six mois, ma modification casse-t-elle son employé ?**
   Si oui, il faut une nouvelle version d'ADN, pas une modification.
