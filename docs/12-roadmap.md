# 12 — Roadmap : les neuf lots

> À lire si tu travailles sur : n'importe quelle implémentation. **Commence par situer ta
> tâche dans un lot.**

Chaque lot est livrable et vérifiable seul. Les lots amont ne sont pas facultatifs : un lot
aval construit sur un lot amont incomplet produit du travail à refaire.

---

## Lot 0 — Fondations
*Aucune fonctionnalité visible. C'est normal.*

- Monorepo et frontières de modules ([`02`](02-architecture.md))
- Schéma initial **avec isolation par entreprise**
- Journal d'exécution en ajout seul
- File de travaux dans Postgres
- Formules et quotas **en données** (les trois formules, une seule commercialisable)
- Intégration continue : vérification des types, tests du domaine

**Sortie :** on peut créer une entreprise, elle ne voit rien d'une autre, et c'est prouvé.

---

## Lot 1 — Noyau
- Model Gateway : routage par classe de données, chaîne de repli, comptage, plafonds
- Policy Engine : classes d'effet, quatre niveaux d'autonomie
- Assemblage de contexte à trois couches ([`04`](04-contextes-memoire.md))
- Registre de capacités : contrat stable, moteur remplaçable

**Sortie :** un appel de modèle passe par un seul chemin, et une donnée réelle ne peut pas
partir chez un fournisseur non conforme.

---

## Lot 2 — Les deux premiers métiers réels

**Décidé : Commercial + Support** ([`adr/0007`](adr/0007-perimetre-v1-commercial-support.md)).

- ADN version 1 de chaque métier, écrits comme deux définitions indépendantes dans
  `employee_definition` — jamais une seule définition avec des variantes internes
- Leurs capacités respectives, leurs moteurs, leurs garde-fous
  (voir D5 pour la source des prospects du Commercial, D12 pour le canal d'entrée du Support)
- Réservoir d'identités alimenté pour les deux métiers

**Sortie :** c'est le lot qui prouve que le produit existe, **et** que la recommandation entre
deux métiers est réellement différenciée — pas un théâtre à un seul choix possible.

---

## Lot 3 — Exécution autonome
- Battement planifié et point d'entrée signé
- Run en machine à états, reprise après interruption
- **Idempotence** sur toute action à effet extérieur
- Reprise après validation humaine
- Notifications de travail

**Sortie :** un employé travaille sans qu'on le lui demande, et une panne au milieu d'un run
ne produit ni perte ni doublon.

---

## Lot 4 — Acquisition
- Vitrine
- Démonstration scriptée
- Diagnostic conversationnel + extraction de profil structuré
- Moteur de règles de recommandation (déterministe)
- Limitation par visiteur et enveloppe d'inférence dédiée

**Sortie :** un visiteur inconnu ressort avec une recommandation motivée.

---

## Lot 5 — Recrutement et paiement
- Paiement hébergé, ouverture d'accès **par confirmation serveur uniquement**
- Réservation atomique d'identité
- Création de l'employé sur ADN figé
- Initialisation du Contexte Entreprise depuis le diagnostic
- Notification de bienvenue

**Sortie :** un inconnu peut devenir client sans intervention manuelle.

---

## Lot 6 — Dashboard
- Fiche employé (mission, objectif, performances, progression, compétences, résultats)
- Mesures réelles et progression vers l'objectif
- Déclaration des ventes par le client (modèle d'attribution, [`09`](09-metriques-roi.md))
- Guide de première connexion
- Gestion de l'abonnement
- **États vides soignés**

**Sortie :** le client a une raison d'ouvrir Sentio chaque semaine.

---

## Lot 7 — Boucle d'évolution
*Le seul lot qu'on peut décaler après le premier client.*

- Réflexion après run → faits appris
- Variantes de stratégie et sélection par la mesure
- Journal des évolutions
- Notifications d'évolution **adossées à un changement enregistré**

---

## Lot 8 — Conformité et lancement
- Immatriculation, mentions légales, conditions générales
- Registre des traitements, analyse d'impact
- Contrats de sous-traitance signés
- Procédure d'effacement
- Sauvegardes exportées hors plateforme
- Surveillance minimale

**Sortie :** on peut encaisser un euro sans risque juridique.

---

## Règle d'ordonnancement

Les lots **0 à 3** constituent le produit.
Les lots **4 à 6** le rendent vendable.
Le lot **8** le rend légal.

Aucun ne peut être sauté avant le premier client payant, **à l'exception du lot 7**.

Si le fondateur code seul et veut valider le marché plus vite, l'ordre alternatif défendable
est `0 → 1 → 2 → 4 → 5 → 6 → 3 → 7 → 8` : on vend et on sert le premier client à la main
pendant que l'automatisation complète se construit. C'est la décision D10.

---

## Ce que la V1 ne construit pas

- La collaboration entre plusieurs employés (Phase 2) — **préparée** par le journal et les
  résultats partagés par entreprise, mais pas construite.
- Les formules Growth et Scale — activées par une donnée, jamais par du code.
- Les capacités premium (Phase 3).
