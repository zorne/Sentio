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

> **Livré le 2026-07-29.** `packages/core` porte le Gateway, le Policy Engine, l'assemblage à
> trois couches, le registre de capacités, la clé d'idempotence et le format de tour ;
> `apps/worker/src/adapters/` branche les ports sur Postgres. `TEST-04` et `TEST-07` passent — le
> second aussi contre une vraie base, plafonds lus dans `plan_quota`.

---

## Lot 2 — Le premier métier réel

**Décidé : Commercial seul** ([`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md)).

- ADN version 1 du métier retenu
- Ses capacités, ses moteurs, ses garde-fous (voir D5 pour la source des prospects)
- Réservoir d'identités alimenté

**Sortie :** c'est le lot qui prouve que le produit existe. Tout ce qui précède est de la
plomberie.

> **En cours depuis le 2026-07-29.** Socle posé : ADN v1 et capacités en données, tables de
> prospection, et la garde d'envoi aux sept conditions — un message ne peut pas partir si une
> seule manque ([`adr/0017`](adr/0017-domaine-du-client-et-reputation.md)). Restent les moteurs.

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
*Le lot le plus décalable — mais **plus entièrement**.*

> **Révision du 2026-07-28.** Trois tâches sont passées P0 : `EVOL-01` (écriture des faits appris),
> `EVOL-05` (journal des évolutions) et `EVOL-06` (notification adossée à un changement enregistré).
> L'amélioration automatique et la mémoire qui s'enrichit sont des promesses de vente
> ([`23-proposition-de-valeur.md`](23-proposition-de-valeur.md)) : les décaler reviendrait à vendre
> ce que le produit ne tient pas. Le reste du lot demeure décalable.

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

> **Ordre retenu depuis le 2026-07-29 : `0 → 1 → 2 → 4 → 5 → 6 → 3`, puis `7` et `8`**
> ([`adr/0020`](adr/0020-ordre-des-lots-produit-complet.md)). L'objectif est un produit cohérent
> **de bout en bout** plutôt qu'un moteur isolé terminé : le lot 2 ne peut pas être fini sans
> l'interface (page d'opposition, retours d'expédition), et chaque bout à bout de ce projet a
> révélé ce qu'aucun test unitaire n'avait vu. Conséquence assumée : le premier client est servi
> de près, sans battement autonome — le lot 3 devient bloquant pour le **troisième** client, pas
> pour le premier.

---

## Ce que la V1 ne construit pas

- La collaboration entre plusieurs employés (Phase 2) — **préparée** par le journal et les
  résultats partagés par entreprise, mais pas construite.
- Les formules Growth et Scale — activées par une donnée, jamais par du code.
- Les capacités premium (Phase 3).
