# 03 — Modèle de données

> À lire si tu travailles sur : une migration, un repository, une nouvelle entité.
> Voir aussi : [`04-contextes-memoire.md`](04-contextes-memoire.md) pour les tables de mémoire.

Noms de tables en anglais. Toutes les tables portant une donnée client **doivent** porter
l'entreprise et être protégées par une politique d'isolation, **dès la première migration**.

---

## Entreprise, accès, abonnement

| Table | Contenu | Notes |
|---|---|---|
| `tenant` | l'entreprise cliente | racine de toute isolation |
| `tenant_member` | lien utilisateur ↔ entreprise + rôle | base des politiques d'accès |
| `plan` | Start / Growth / Scale avec leurs quotas et capacités, **en données** | les 3 existent dès le jour 1 ; seul Start porte le drapeau « commercialisable » |
| `subscription` | formule active, statut, période, références de facturation | source de vérité des droits |
| `usage_counter` | consommation par entreprise, par période, par métrique | rend les quotas réels |

> **Règle :** aucune condition `si formule = Start` dans le code. Uniquement des lectures de
> quota. Ouvrir Growth doit être une modification de données, pas un déploiement.

---

## Les employés numériques

| Table | Contenu | Notes |
|---|---|---|
| `employee_definition` | **Contexte Général / ADN** d'un métier, **versionné** | commun à toutes les entreprises, jamais modifié en place |
| `sector_profile` | connaissance d'un **secteur** : vocabulaire, interlocuteurs, cycle d'achat, objections, angles | commun à toutes les entreprises, versionné, **rédigé par Sentio — jamais dérivé des données d'un client** → [`adr/0011`](adr/0011-generaliste-profils-sectoriels.md) |
| `identity` | réservoir d'identités (prénom, nom, portrait) | unicité **globale**, réservation atomique |
| `employee` | l'employé recruté par une entreprise | pointe vers une **version figée** d'ADN + une identité |
| `employee_capability` | capacités réellement ouvertes à cet employé | intersection ADN × formule × configuration |

**Réservation d'identité :** une identité passe de « libre » à « prise » en **une seule
opération atomique**. C'est le seul moyen de garantir l'unicité promise si deux recrutements
arrivent en même temps. Une identité libérée n'est jamais remise en circulation. Prévoir
plusieurs centaines d'identités cohérentes par métier dès le départ.

---

## Mémoire (détail complet dans [`04`](04-contextes-memoire.md))

| Table | Contenu | Qui écrit |
|---|---|---|
| `company_profile` | ce que l'entreprise **est** : objectifs, produits, services, processus, préférences, documents, KPI | client, Sentio, apprentissage |
| `learned_fact` | ce que l'employé a **appris en travaillant** | apprentissage, client |

Chaque ligne des deux tables porte : auteur (`client` / `sentio` / `apprentissage`), date,
tâche source, statut (`proposé` / `actif` / `retiré`), compteur d'utilisation.

---

## Travail, journal, mesure

| Table | Contenu |
|---|---|
| `objective` | l'objectif du dirigeant (ex. +5 000 €/mois), son horizon, sa métrique |
| `task` | une unité de travail confiée à un employé, avec son état |
| `job` | file d'exécution : priorité, entreprise, tentatives, verrou, prochaine échéance |
| `execution_event` | **journal en ajout seul** : tout ce qui a été raisonné, appelé, décidé, produit |
| `approval` | validations humaines demandées / accordées / permanentes / révoquées |
| `outcome` | résultats mesurables rattachés à une tâche (réponse, rendez-vous, vente) |
| `notification` | Recrutement / Travail / Évolution |
| `strategy_change` | trace horodatée de chaque évolution réelle d'un employé |

**`execution_event` est la source de vérité.** Tout le reste (états, statistiques, fiches) est
une projection reconstructible à partir de lui. Il fournit gratuitement l'audit, le débogage,
la reprise après interruption et la preuve réglementaire.

**`job` est une vraie file** : consommée avec verrouillage par ligne et saut des lignes déjà
verrouillées. Elle tient plusieurs milliers de tâches par jour, coûte €0, et se remplace plus
tard par une file managée sans toucher au domaine. Sa colonne `priorité` **est** la promesse
« priorité d'exécution » des formules supérieures.

---

## Capacités et fournisseurs

| Table | Contenu |
|---|---|
| `capability` | le **contrat** d'une capacité (« trouver des prospects »), stable dans le temps |
| `capability_binding` | quel moteur sert cette capacité, pour quelle formule, avec quelle priorité |
| `provider_credential` | clés de la plateforme, avec leur politique de données (`no_train` / `free`) |
| `provider_quota` | compteur global de consommation par fournisseur et par fenêtre |

`capability_binding` est ce qui permet de remplacer le moteur derrière une capacité sans
toucher à aucun employé existant — exigence §21 de la vision.

---

## Acquisition

| Table | Contenu |
|---|---|
| `diagnostic_session` | conversation du visiteur, profil extrait, frein détecté |
| `recommendation` | métier recommandé, justification, statut (proposé / acheté / refusé) |

---

## Règles transverses de schéma

1. **Isolation dès la première migration.** Pas d'exception, pas de « on l'ajoutera après ».
2. **Rien n'est supprimé en dur** sur les données à valeur de preuve : on marque `retiré`.
   L'effacement réglementaire se fait par anonymisation, sinon l'audit est détruit.
3. **Migrations en quatre temps : étendre → remplir → basculer → retirer.** Cela donne un
   déploiement sans interruption, et évite les « quelques heures de maintenance » que la
   vision s'autorise pourtant.
4. **Rétention du journal** : à trancher (décision D9), recommandation 12 mois puis
   anonymisation — arbitrage entre volume de base gratuit et preuve réglementaire.
5. **Clé d'idempotence** sur toute table enregistrant une action à effet extérieur.
