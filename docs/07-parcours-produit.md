# 07 — Parcours produit

> À lire si tu travailles sur : la vitrine, le diagnostic, la recommandation, le paiement,
> le recrutement ou l'entrée dans le dashboard.

---

## Le parcours en sept étapes

```
1. VITRINE ──► 2. DÉMONSTRATION ──► 3. DIAGNOSTIC ──► 4. RECOMMANDATION
                                                            │
        7. DASHBOARD ◄── 6. RECRUTEMENT ◄── 5. PAIEMENT ◄───┘
             ▲
             └── le client ne revient jamais sur la vitrine
```

---

## 1. Vitrine

Uniquement une vitrine : présentation, démonstration, explication, achat. **Rien d'autre.**
Elle ne sert jamais à gérer un employé.

Contenu statique, aucun accès à la base, coût d'inférence nul.
Ambiance : cabinet, bureau, entreprise haut de gamme. Ni SaaS classique, ni futurisme.

---

## 2. Démonstration

Le visiteur doit voir Sentio analyser un objectif, réfléchir, créer un employé numérique et
expliquer pourquoi celui-là.

**En V1, cette démonstration est scriptée** — et présentée comme une démonstration.

*Pourquoi :* une vraie exécution en direct, exposée à des inconnus, brûlerait le quota
d'inférence des clients payants et tomberait en panne le jour du pic de trafic. C'est un
compromis assumé ([`16-compromis.md`](16-compromis.md), C6). La limite à ne pas franchir :
ne jamais la faire passer pour une analyse en direct **du visiteur**.

---

## 3. Diagnostic

Une vraie conversation avec le visiteur : Sentio comprend l'entreprise, les objectifs, les
blocages, les priorités.

**Techniquement :** ce n'est pas un run autonome mais un dialogue en aller-retour. Il appelle
le Model Gateway directement, un tour à la fois, sans tâche ni file
([`05-runtime-employe.md`](05-runtime-employe.md)).

**Attention données :** dès la première question, le diagnostic reçoit de vraies informations
d'un vrai prospect (entreprise, email, chiffres). Il relève donc **obligatoirement** du
fournisseur « sans entraînement » — jamais du fournisseur de démonstration.

**Protection :** limitation par visiteur et par adresse dès la mise en ligne, plafond de coût,
et traitement de tout ce que tape le visiteur comme **donnée, jamais comme instruction**.

**Produit :** une ligne `diagnostic_session` avec un **profil structuré extrait** et le frein
principal détecté.

---

## 4. Recommandation et calibrage

> Le client ne choisit jamais un employé. C'est Sentio qui recommande.

**Le modèle ne décide rien.** La décision est prise par un **moteur de règles déterministe**,
auditable, reproductible, et **incapable de proposer ce qui n'existe pas**. Le modèle sert
uniquement à rédiger la justification, en langage de dirigeant.

Ce moteur ne choisit pas *quel* employé — il n'y a qu'une Lady. Il produit sa **configuration** :
objectif, missions, capacités activées, priorités, autonomie, limites opérationnelles. C'est une
décision réelle, aux conséquences observables sur le travail produit.
→ [`adr/0010`](adr/0010-diagnostic-calibrage.md), [`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md)

Le rôle de Lady est donc une **sortie** de ce moteur, jamais une donnée d'entrée : le dirigeant
décrit son entreprise, il ne choisit pas un métier dans un catalogue
([`28-bibliotheque-et-creation-de-lady.md`](28-bibliotheque-et-creation-de-lady.md) §5).

Le calibrage s'écrit dans `company_profile` et `employee_capability`. **Il ne touche jamais
l'ADN**, commun à tous les clients et immuable.

Une seule proposition est présentée. Jamais un catalogue, jamais un employé verrouillé, jamais
un « bientôt disponible ».

**Cas du besoin hors périmètre :** si le frein détecté sort de ce que Sentio sait faire
aujourd'hui, **le dire** — au moment où le besoin est exprimé, pas après la vente — et proposer
une mise en liste d'attente. Ne jamais vendre un employé incapable de faire le travail.

> **Ce que le diagnostic recueille, l'employé devra le tenir.** Un diagnostic qui interroge large
> et un employé qui livre étroit installe une déception. Borner le questionnement à ce que les
> capacités savent faire.

---

## 5. Paiement

Hébergé chez le prestataire de paiement : **aucune donnée bancaire ne touche Sentio**.

**Le droit d'accès n'est ouvert que par la confirmation serveur du prestataire**, jamais par la
redirection du navigateur — une redirection se falsifie, une confirmation serveur non.

Le client reçoit ensuite : confirmation, facture, et accès à son espace privé.

---

## 6. Recrutement

L'étape la plus critique du parcours. Dans l'ordre, en une transaction :

1. **Réservation atomique d'une identité** dans le réservoir (unicité globale garantie).
2. **Création de l'employé sur une version figée d'ADN.**
3. **Initialisation du Contexte Entreprise** à partir du profil extrait au diagnostic.
4. **Notification de recrutement** : « Bienvenue. Carter rejoint officiellement votre
   entreprise. »

Un employé créé sans ADN figé ou sans contexte entreprise initialisé ne pourra être ni audité
ni fait évoluer. Voir [`04-contextes-memoire.md`](04-contextes-memoire.md).

---

## 7. Dashboard

L'unique lieu de vie du client ensuite. Il contient : ses employés, leurs performances, leurs
fiches, son abonnement, ses paiements, ses notifications, les recommandations.

**Doit rester extrêmement simple.** Le client veut voir les résultats, les performances, les
chiffres qui comptent. Jamais la complexité technique, jamais les modèles, jamais les outils,
jamais les workflows.

**Fiche employé :** mission, objectif, performances, progression, compétences, résultats.
Rien d'autre.

**Première connexion :** un guide élégant, petites bulles, explications simples, affiché une
seule fois. L'état « déjà vu » est mémorisé côté entreprise.

**État vide :** les premières semaines, il n'y aura presque rien à afficher. Cet état doit être
conçu comme une montée en puissance lisible (« Carter a contacté 12 entreprises, 2 ont
répondu »), **jamais rempli de chiffres fabriqués**.
Voir [`09-metriques-roi.md`](09-metriques-roi.md).
