# Sentio

**Cabinet de recrutement d'employés numériques.**

Un dirigeant ne choisit jamais un agent. Il décrit un objectif (« +5 000 € par mois »).
Sentio diagnostique l'entreprise, recommande **un** employé numérique spécialisé, le recrute,
et toute la vie du client se déroule ensuite dans son espace privé.

> Le client ne doit jamais avoir l'impression d'utiliser une IA.
> Il doit avoir l'impression de recruter un collaborateur, de suivre ses performances,
> et de voir son équipe grandir.

**État du projet : lots 0, 1 et 2 terminés ; lot 4 (Acquisition) en cours.** Le schéma et son
isolation par entreprise sont vérifiés sur une vraie base, le noyau et le métier commercial sont
écrits et testés, et l'interface est initialisée — vitrine en sortie statique, première fonction
serveur en région UE. Une réserve connue, énoncée : l'accès croisé par abonnement temps réel ne se
teste que sur la plateforme, et le sera avant la mise en ligne
([`docs/13-verification.md`](docs/13-verification.md)).
Étape suivante : les sections de la vitrine et la conversation de diagnostic
(`ACQUIS-01` → `ACQUIS-12`) — [`docs/20-plan-action.md`](docs/20-plan-action.md).

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

## La vitrine, et son déploiement

`apps/vitrine` (Next.js 15) est **l'interface publique**, avec son noyau dans
`packages/vitrine-core`. Elle vient d'un dépôt antérieur, fusionnée ici avec son historique.

```bash
pnpm --filter @sentio/vitrine dev     # http://localhost:3000
pnpm --filter @sentio/vitrine build
```

**Sur Vercel**, l'espace de travail pnpm impose un réglage manuel, à faire une fois dans les
paramètres du projet :

| Réglage | Valeur |
|---|---|
| Root Directory | `apps/vitrine` |
| Install Command | *(laisser vide — Vercel remonte à la racine de l'espace de travail)* |
| Build Command | *(laisser vide — `next build` est détecté)* |

Les variables d'environnement attendues sont listées dans
[`apps/vitrine/.env.example`](apps/vitrine/.env.example). Deux pièges déjà payés :
`SUPABASE_DB_URL` doit passer par le **pooler de transactions (port 6543)**, jamais par la
connexion directe (5432) — Vercel ne route pas l'IPv6 ; et le déclencheur de prospection
(`.github/workflows/prospect-cron.yml`) exige les secrets GitHub `SENTIA_APP_URL` et
`CRON_SECRET`, le premier portant encore l'ancien nom de marque.

Les migrations SQL de la vitrine vivent dans [`apps/vitrine/migrations/`](apps/vitrine/migrations)
et **visent un projet Supabase distinct** de celui des lots 0 à 2 (`supabase/migrations/`). Les
réunir est une décision à prendre, pas un détail d'intendance.

---

## Vérifier

Une seule commande définit « vérifié » : lint, frontières d'architecture, types, tests,
construction de la vitrine, et les fonctions sous Deno. Elle tourne aussi **avant chaque
`git push`** ([`.githooks/pre-push`](.githooks/pre-push), installé par `pnpm install`) et dans
l'intégration continue.

```bash
pnpm install          # installe aussi le crochet d'avant-envoi
pnpm run verify       # tout ce qui est vérifiable automatiquement
```

Outils requis : **Node 20+**, **pnpm**, et **Deno** (`brew install deno`) — les fonctions serveur
sont vérifiées dans leur runtime de production, pas dans un autre. Les tests d'intégration de base
exigent un Postgres local (`supabase/tests/run.sh`).

Ce qui échappe à la machine est **écrit**, jamais espéré : les gestes de console sont listés dans
[`docs/20-plan-action.md`](docs/20-plan-action.md). Pourquoi cette règle et ce qu'elle couvre :
[`docs/adr/0024`](docs/adr/0024-verification-automatique.md).

---

## Outillage local (conception)

Ni versionné, ni requis pour construire le produit — mais à réinstaller sur un poste neuf, sinon
l'aide à la conception d'interface disparaît sans bruit. Ces deux commandes sont l'équivalent, pour
l'outillage, de ce que `docs/20-plan-action.md` est pour les gestes de console
([`adr/0024`](docs/adr/0024-verification-automatique.md)) : ce qui échappe à la machine est écrit.

```bash
npx ui-ux-pro-max-cli init --ai claude   # skills de conception → .claude/skills/ (ignoré par git)
npx @21st-dev/cli init --client claude --write   # serveur MCP « 21st » → .mcp.json
```

[`.mcp.json`](.mcp.json) est **versionné et sans secret** : il ne référence que des variables
d'environnement (`${MAGIC_API_KEY}`, `${API_KEY_21ST}`), à poser dans un `.env` local à partir de
[`.env.example`](.env.example). Une clé ne vit jamais dans le dépôt (`AGENTS.md`, invariant 7).

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
