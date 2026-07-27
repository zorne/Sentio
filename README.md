# Sentio

**Cabinet de recrutement d'employés numériques.**

Un dirigeant ne choisit jamais un agent. Il décrit un objectif (« +5 000 € par mois »).
Sentio diagnostique l'entreprise, recommande **un** employé numérique spécialisé, le recrute,
et toute la vie du client se déroule ensuite dans son espace privé.

> Le client ne doit jamais avoir l'impression d'utiliser une IA.
> Il doit avoir l'impression de recruter un collaborateur, de suivre ses performances,
> et de voir son équipe grandir.

**État du projet : architecture définie, code non commencé.**
Ce dépôt ne contient aujourd'hui que la documentation. C'est volontaire : l'architecture
est écrite avant la première ligne de code.

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

## Les cinq choses à savoir avant de toucher quoi que ce soit

1. **Deux contextes, jamais un seul.** Chaque employé a un ADN commun et immuable, et une
   mémoire d'entreprise qui évolue. Cette frontière est la garantie qu'un commercial reste
   commercial. → [`docs/04-contextes-memoire.md`](docs/04-contextes-memoire.md)
2. **Budget €0 strict.** Ce n'est pas une préférence, c'est une contrainte de conception qui
   explique presque toutes les décisions. → [`docs/01-contraintes.md`](docs/01-contraintes.md)
3. **Aucun chiffre affiché sans une ligne en base derrière.** Jamais de métrique décorative.
   → [`docs/09-metriques-roi.md`](docs/09-metriques-roi.md)
4. **Le vocabulaire est une contrainte technique.** « employé », « recrutement », « équipe ».
   Jamais « IA », « bot », « agent », « assistant ». → [`docs/17-lexique.md`](docs/17-lexique.md)
5. **Un seul métier au lancement : Commercial.** Le diagnostic reste honnête si le besoin
   détecté sort de ce périmètre — jamais de vente d'un employé incapable de faire le travail.
   → [`docs/adr/0008-perimetre-v1-commercial-seul.md`](docs/adr/0008-perimetre-v1-commercial-seul.md)

---

## Licence et confidentialité

Ce dépôt est public. Il ne contient **aucun secret** et ne doit jamais en contenir :
les clés d'API vivent exclusivement dans les variables d'environnement de l'hébergeur.
