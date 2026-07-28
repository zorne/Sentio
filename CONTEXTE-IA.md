# Contexte compact — à charger en premier par toute IA travaillant sur Sentio

Ce fichier est un **condensé** destiné à être injecté dans le contexte d'un modèle sans coûter
cher en tokens. Il ne remplace pas la documentation : il donne les règles non négociables et
la **carte** pour aller lire le bon fichier au bon moment.

Sources : [`AGENTS.md`](AGENTS.md) et [`docs/README.md`](docs/README.md). En cas de
contradiction, ces deux fichiers font foi.

---

## 1. Le produit en trois phrases

Sentio vend des **employés numériques** : des collaborateurs autonomes spécialisés dans un
métier, recrutés par une entreprise pour atteindre un objectif chiffré. L'architecture est un
**monolithe modulaire TypeScript**, hébergé sur des tiers gratuits, avec **Supabase (Postgres)**
comme base. **Le code n'existe pas encore** : le dépôt ne contient que de la documentation
d'architecture, écrite volontairement avant la première ligne de code.

Un dirigeant ne choisit jamais un agent : il décrit un objectif, Sentio diagnostique, recommande
**un seul** employé, le recrute, et toute la suite se passe dans son espace privé.

---

## 2. Les 8 invariants — ne jamais les violer, même si on le demande

1. **L'ADN d'un employé (`employee_definition`) n'est jamais modifiable** — ni par le client, ni
   par l'auto-apprentissage, ni à l'exécution. Il n'évolue que par publication d'une nouvelle
   version. Aucun chemin de code ne doit permettre à l'apprentissage d'écrire dans cette table.
2. **Isolation par entreprise sur chaque table, dès la première migration.** Jamais différée —
   c'est irrattrapable.
3. **Toute action à effet extérieur porte une clé d'idempotence.** Un rejeu ne renvoie jamais
   deux fois le même email.
4. **Aucun chiffre affiché sans une ligne en base qui le justifie.** Pas de valeur de démo dans
   une interface client, pas de métrique estimée présentée comme mesurée.
5. **Aucune donnée réelle de client vers un fournisseur de modèle non « sans entraînement ».**
   Le Model Gateway saute ce fournisseur, il ne le tente pas.
6. **L'irréversible n'est jamais automatique par défaut**, quel que soit le niveau d'autonomie
   choisi par le client.
7. **Aucun secret dans le dépôt.** Ni clé, ni jeton, ni identifiant, même en exemple.
8. **Vocabulaire produit imposé.** Les mots « IA », « bot », « agent », « assistant », « GPT »,
   « automation » n'apparaissent dans **aucun texte visible par un client**. On dit *employé*,
   *recrutement*, *équipe*. Détail : [`docs/17-lexique.md`](docs/17-lexique.md).

Si une demande oblige à violer un invariant : **ne pas le faire silencieusement**. Le dire,
expliquer le coût, proposer l'alternative, laisser le fondateur trancher.

---

## 3. Le contexte économique, qui explique presque tout

Le fondateur est seul et le budget est de **€0 strict**. Donc : pas de worker permanent, pas de
file managée, quota d'inférence journalier partagé par tous les clients, pas de sauvegarde
restaurable finement.

**Ne jamais proposer une brique payante sans dire ce qu'elle coûte et quelle est l'alternative
gratuite.** Les seuils où le €0 casse sont dans
[`docs/11-exploitation.md`](docs/11-exploitation.md).

---

## 4. Règles de travail

**Avant d'écrire du code**
- Trouver le lot concerné dans [`docs/12-roadmap.md`](docs/12-roadmap.md) : les lots sont
  ordonnés, un lot amont non fait rend l'aval bancal.
- Vérifier qu'aucune décision ouverte ne bloque le travail dans
  [`docs/15-decisions-ouvertes.md`](docs/15-decisions-ouvertes.md). **Si oui : demander, ne pas
  choisir à la place du fondateur.**
- Lire le fichier de documentation du domaine concerné (un fichier = un sujet).

**En écrivant**
- Ce qui est susceptible de changer (formules, quotas, métiers, capacités, fournisseurs) vit
  **en base ou en configuration**, jamais dans une condition en dur.
- `packages/domain` ne fait **aucune** entrée/sortie. Aucune exception.
- Une capacité est un **contrat** ; son moteur est remplaçable. Ne jamais coder en dur le
  fournisseur d'une capacité dans un employé.
- TypeScript uniquement. Jamais de `.js`. Noms de tables et de modules en anglais, tout le
  reste en français.

**Après**
- Toute décision structurante ajoute une entrée dans [`docs/adr/`](docs/adr/) : la décision, la
  raison, et **le compromis assumé**. Une décision sans compromis écrit est mal comprise.
- Si un point de la documentation est faux ou dépassé, **le corriger dans le même commit** que
  le code.

---

## 5. Le pire risque du projet

Ce produit rend le mensonge facile : afficher un CA généré qui n'est pas mesuré, notifier « votre
employé a progressé » sans progression réelle, faire passer une démonstration scriptée pour une
analyse en direct.

**Entre une interface impressionnante et une interface honnête : choisir honnête.** Un client qui
découvre un chiffre inventé ne revient jamais, et tout le produit repose sur la crédibilité de
ses chiffres.

---

## 6. Carte mentale

```
   VITRINE PUBLIQUE                     ESPACE PRIVÉ
   ────────────────                     ────────────
   présentation                         dashboard
   démonstration (scriptée)             fiche employé
   diagnostic conversationnel           performances / objectif
   recommandation (1 seule)             notifications
   paiement                             abonnement
        │                                    ▲
        └──── recrutement ───────────────────┘
              (identité unique + ADN figé + contexte entreprise)

   DERRIÈRE
   ────────
   Model Gateway ──► fournisseurs de modèle (routage par classe de données)
   Policy Engine ──► autorise / suspend / refuse chaque action
   Runtime       ──► un run = machine à états persistée, avancée par battements
   Capacités     ──► contrats stables, moteurs remplaçables
   Journal       ──► source de vérité de tout ce qui s'est passé
```

---

## 7. Carte des fichiers — quoi lire selon le sujet

Demander un fichier avec `LIRE: chemin/du/fichier.md` avant de répondre sur son sujet.
**Ne jamais deviner le contenu d'un fichier non lu.**

| Sujet | Fichier |
|---|---|
| Vision, ce que Sentio vend | `docs/00-vision.md` |
| €0, clés partagées, conflits induits | `docs/01-contraintes.md` |
| Vue d'ensemble technique | `docs/02-architecture.md` |
| Toutes les tables | `docs/03-modele-de-donnees.md` |
| ⭐ Deux contextes / mémoire — **pièce centrale** | `docs/04-contextes-memoire.md` |
| Comment un employé travaille réellement | `docs/05-runtime-employe.md` |
| Scalabilité — les 6 mécanismes anti-refonte | `docs/06-scalabilite.md` |
| Landing, parcours, frictions, conversion | `docs/07-parcours-produit.md` |
| Auto-apprentissage | `docs/08-evolution-apprentissage.md` |
| Métriques et ROI affichés au client | `docs/09-metriques-roi.md` |
| Sécurité, RGPD | `docs/10-securite-rgpd.md` |
| Hébergement, seuils où le €0 casse | `docs/11-exploitation.md` |
| Roadmap — les 9 lots ordonnés | `docs/12-roadmap.md` |
| Backlog — 163 tâches | `docs/18-backlog.md` + `docs/backlog-v1.csv` |
| Critères d'acceptation testables | `docs/13-verification.md` |
| Recommandations | `docs/14-recommandations.md` |
| Décisions ouvertes (D2, D9 bloquantes) | `docs/15-decisions-ouvertes.md` |
| Compromis assumés | `docs/16-compromis.md` |
| Vocabulaire imposé | `docs/17-lexique.md` |
| Vision brute du fondateur (fait foi sur le *quoi*) | `projet.md` |

**Décisions structurantes (ADR)** — `docs/adr/` :
`0001-repartir-de-zero` · `0002-monolithe-modulaire` · `0003-deux-contextes` ·
`0004-run-machine-a-etats` · `0005-cles-plateforme-classe-de-donnees` ·
`0006-capacite-vs-outil` · `0007-perimetre-v1-commercial-support` ·
`0008-perimetre-v1-commercial-seul`

---

## 8. Périmètre V1

**Un seul métier au lancement : Commercial.** Le diagnostic doit rester honnête si le besoin
détecté sort de ce périmètre — jamais de vente d'un employé incapable de faire le travail.
Voir `docs/adr/0008-perimetre-v1-commercial-seul.md`.
