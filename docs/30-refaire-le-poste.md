# 30 — Refaire un poste de travail à partir de rien

> À lire si tu travailles sur : **une machine neuve**, ou si tu veux pouvoir effacer la tienne
> sans rien perdre.
>
> Écrit le 2026-08-15, parce que ce savoir n'existait que sur un seul Mac. Un dépôt qu'on ne sait
> pas remonter ailleurs n'est pas sauvegardé : il est otage d'une machine.

---

## Ce qui vit sur git, et ce qui n'y vit pas

**Sur git : tout le produit.** Code, schéma, tests, invariants, décisions, plan. Un `git clone`
suffit à récupérer l'intégralité du travail.

**Hors git, et c'est voulu :**

| Élément | Pourquoi il n'y est pas | Comment le retrouver |
|---|---|---|
| `.env` | Ce sont des **secrets**. Un secret sur git est un secret brûlé, même dans un dépôt privé. | Gestionnaire de mots de passe. Voir plus bas. |
| `supabase/.temp/` | Écrit par la CLI, propre à la machine. | `supabase link` (voir ci-dessous) |
| `node_modules/`, `.next/`, `*.tsbuildinfo` | Dérivés, volumineux, reconstruits à l'identique. | `pnpm install` |
| `supabase/functions/_generated/` | Recopie du code partagé vers les fonctions ([`adr/0023`](adr/0023-code-partage-vers-les-fonctions.md)). | `pnpm run functions:sync` |
| Bases `sentio_test` et `vitrine_test` | Jetables par construction. Leur contenu **est** les migrations. | `pnpm run verify` les recrée |

---

## Les six étapes, dans l'ordre

### 1. Les outils

Node 20+, `pnpm`, Deno 2.x, Postgres 16+, et la CLI Supabase.

Deno n'est pas optionnel : les fonctions serveur s'exécutent sous Deno, pas sous Node, et les
vérifier avec l'outillage du reste du dépôt reviendrait à vérifier autre chose
([`adr/0021`](adr/0021-execution-serveur-en-ue.md)).

### 2. Le dépôt

```bash
git clone https://github.com/zorne/Sentio.git && cd Sentio && pnpm install
```

`pnpm install` installe aussi le crochet d'avant-envoi : rien ne part vers le dépôt distant sans
avoir été vérifié ([`adr/0024`](adr/0024-verification-automatique.md)).

### 3. Postgres, et le piège qui coûte une heure

`pnpm run verify` **exige** un Postgres local depuis l'étape 1 du
[plan](29-plan-jusquau-premier-client.md) : sans base, il sautait 152 tests en silence.

Deux particularités observées sur macOS + Homebrew, chacune coûteuse à retrouver :

- **`pg_ctl start` échoue sans `LC_ALL=C`** — « postmaster became multithreaded during startup ».
  Démarrage qui fonctionne :

  ```bash
  LC_ALL=C pg_ctl -D /opt/homebrew/var/postgresql@16 -l /opt/homebrew/var/log/postgresql@16.log start
  ```

- **Le rôle `postgres` n'existe pas** : l'installation Homebrew crée un rôle au nom de l'utilisateur.
  Les scripts et l'intégration continue utilisent `postgres://postgres@127.0.0.1:5432/…`.

  ```bash
  psql -d postgres -c "create role postgres login superuser"
  ```

Deux bases distinctes sont nécessaires, et ce n'est pas un détail : les suites de la vitrine
commencent par `drop schema public cascade`. Lancées sur la base du cœur, elles effacent le schéma
que les étapes précédentes viennent de vérifier. `verify:base` refuse de commencer si les deux
chaînes de connexion se ressemblent — mais mieux vaut savoir pourquoi.

Pour utiliser d'autres bases : `SENTIO_BASE_COEUR` et `SENTIO_BASE_VITRINE`.

### 4. Vérifier que le poste est bon

```bash
pnpm run verify
```

C'est la définition unique de « vérifié ». Il doit finir sur
`✅ vérifié contre une vraie base — rien n'a été sauté.`

S'il échoue faute de Postgres, il le dit avec la marche à suivre — il ne saute rien.

### 5. Le projet Supabase

Le `project-ref` n'est pas versionné : il vit dans `supabase/.temp/`, ignoré par git. On le
retrouve sans le stocker :

```bash
supabase login && supabase projects list
```

Le projet de Sentio est celui de la région **eu-north-1** (Stockholm) — l'UE est une contrainte
dure ([`adr/0021`](adr/0021-execution-serveur-en-ue.md)), pas une préférence. Deux autres projets
coexistent sur le compte et n'ont aucun rapport.

```bash
supabase link --project-ref <le ref trouvé ci-dessus>
```

⚠️ Le lien ne sert qu'à **lire** l'état du distant (`supabase migration list`, `supabase inspect`).
Pousser un schéma, poser un secret et déployer restent des gestes humains, jamais automatisés
([`29-plan-jusquau-premier-client.md`](29-plan-jusquau-premier-client.md), partie II).

### 6. Les secrets

**Aucun secret ne doit revenir dans le dépôt**, même privé, même « temporairement ».

- `.env` à la racine : **deux clés d'outillage de conception** (`MAGIC_API_KEY`, `API_KEY_21ST`).
  Elles ne servent **pas** à Sentio — aucun fichier du produit ne les lit. Elles alimentent des
  serveurs MCP déclarés dans `.mcp.json`. Leur place est un gestionnaire de mots de passe.
- Les secrets du **runtime** (accès base, secret du battement, réglages du modèle) ne vivent pas
  ici du tout : ils se posent chez l'hébergeur, en console ou par `supabase secrets set`. Le
  contrôle `pnpm run deploiement:verifier` vérifie que les **noms** attendus existent, et ne lit
  jamais une valeur.

---

## Ce qu'on peut effacer sans rien perdre

Une fois les secrets en sécurité ailleurs, **le dossier local entier est reconstructible**. Rien
d'autre n'y vit : au 2026-08-15, l'inventaire donnait 0 commit non poussé, 0 remise, 0 fichier
modifié, et aucune branche portant du travail unique.

La commande qui le prouve, à relancer avant d'effacer quoi que ce soit :

```bash
git status --short && git stash list && git log --branches --not --remotes --oneline
```

**Trois sorties vides = tout est sur GitHub.**
