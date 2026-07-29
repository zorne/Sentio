# Sentio

**Cabinet de recrutement d'employés numériques.**

Un dirigeant ne choisit jamais un agent. Il décrit un objectif (« +5 000 € par mois »).
Sentio diagnostique l'entreprise, recommande **un** employé numérique spécialisé, le recrute,
et toute la vie du client se déroule ensuite dans son espace privé.

> Le client ne doit jamais avoir l'impression d'utiliser une IA.
> Il doit avoir l'impression de recruter un collaborateur, de suivre ses performances,
> et de voir son équipe grandir.

**État du projet : lot 0 (Fondations) terminé.** Schéma, isolation par entreprise et repositories
vérifiés — le parcours client est joué de bout en bout sous ses deux formes, **entreprise
individuelle** et **entreprise à plusieurs membres**, avec les droits d'un vrai client et non ceux
du serveur. Une réserve connue, énoncée : l'accès croisé par abonnement temps réel ne se teste que
sur la plateforme, et le sera avant la mise en ligne
([`docs/13-verification.md`](docs/13-verification.md)).
Étape suivante : lot 1 (Noyau) — [`docs/20-plan-action.md`](docs/20-plan-action.md).

---

## ⚠️ Avant de faire transiter la moindre donnée réelle, ou d'encaisser

Deux préalables ne bloquent **pas** le développement — ils bloquent le moment où le produit
touche du réel. Peuvent attendre que le SaaS soit fonctionnel, mais doivent être réglés
**avant** de les franchir :

| Préalable | Bloque précisément | Détail |
|---|---|---|
| **Opt-out d'entraînement Mistral activé et prouvé** (capture datée, archivée) | Tout appel de modèle sur une donnée réelle — le diagnostic en manipule dès la première question | [`docs/19-fournisseurs-modeles.md`](docs/19-fournisseurs-modeles.md), [`adr/0009`](docs/adr/0009-fournisseur-inference-ue.md) |
| **Immatriculation de l'entreprise** | Le premier paiement réel, les mentions légales définitives, les contrats de sous-traitance | [`docs/20-plan-action.md`](docs/20-plan-action.md), phase 0.1 et phase 8 |
| **Transparence AI Act** — article 50, applicable le **2 août 2026** | La mise en ligne de la vitrine : le diagnostic doit annoncer en clair qu'on échange avec un système d'IA, et les contenus générés être marqués | [`adr/0015`](docs/adr/0015-transparence-ai-act.md) |
| **Contrat de sous-traitance fourni aux clients**, procédure de violation de données (72 h), registre des traitements | Le premier client réel — Sentio est **sous-traitant** de ses clients, pas seulement responsable | [`docs/25-conformite-legale.md`](docs/25-conformite-legale.md) |

Tant que ces deux points ne sont pas réglés : le drapeau `inferenceOptOutProven`
(`packages/config`) reste à `false`, et rien ne doit être facturé.
Voir aussi [`docs/11-exploitation.md`](docs/11-exploitation.md), « Ce qui change quand le
premier client payant arrive ».

---

## Par où commencer

| Tu es… | Lis dans cet ordre |
|---|---|
| **Une IA qui doit implémenter** | [`AGENTS.md`](AGENTS.md) → [`docs/README.md`](docs/README.md) |
| **Un humain qui découvre le projet** | [`docs/00-vision.md`](docs/00-vision.md) → [`docs/02-architecture.md`](docs/02-architecture.md) |
| **Le fondateur qui veut décider** | [`docs/15-decisions-ouvertes.md`](docs/15-decisions-ouvertes.md) et [`docs/16-compromis.md`](docs/16-compromis.md) |

[`projet.md`](projet.md) est la vision brute écrite par le fondateur. C'est la **source de
vérité produit** : en cas de contradiction avec la documentation technique, `projet.md` gagne
sur le *quoi*, la documentation gagne sur le *comment*.

---

## Les six choses à savoir avant de toucher quoi que ce soit

1. **Deux contextes, jamais un seul.** Chaque employé a un ADN commun et immuable, et une
   mémoire d'entreprise qui évolue. Cette frontière est la garantie qu'un commercial reste
   commercial. → [`docs/04-contextes-memoire.md`](docs/04-contextes-memoire.md)
2. **Budget €0 strict.** Ce n'est pas une préférence, c'est une contrainte de conception qui
   explique presque toutes les décisions. → [`docs/01-contraintes.md`](docs/01-contraintes.md)
3. **Aucun chiffre affiché sans une ligne en base derrière.** Jamais de métrique décorative.
   → [`docs/09-metriques-roi.md`](docs/09-metriques-roi.md)
4. **Le vocabulaire est une contrainte technique.** « employé », « recrutement », « équipe ».
   Jamais « IA », « bot », « agent », « assistant », et quelques autres — la liste complète et
   faisant foi est dans [`docs/17-lexique.md`](docs/17-lexique.md), à ne recopier nulle part.
5. **Les entreprises sont étanches, définitivement.** Aucune donnée d'un client n'atteint jamais
   un autre client : jamais partagée, jamais agrégée, jamais dérivée — même anonymisée, même si
   un dirigeant le demande lui-même. C'est une décision du fondateur, pas un réglage : une
   fonctionnalité qui la viole se refuse.
   → [`docs/adr/0014`](docs/adr/0014-etancheite-entre-entreprises.md)
6. **Un seul métier au lancement : Commercial.** Le diagnostic reste honnête si le besoin
   détecté sort de ce périmètre — jamais de vente d'un employé incapable de faire le travail.
   → [`docs/adr/0008-perimetre-v1-commercial-seul.md`](docs/adr/0008-perimetre-v1-commercial-seul.md)

---

## Licence et confidentialité

Ce dépôt est public. Il ne contient **aucun secret** et ne doit jamais en contenir :
les clés d'API vivent exclusivement dans les variables d'environnement de l'hébergeur.
