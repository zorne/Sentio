# 34 — Tout ce qui doit se trouver sur le Supabase

> Écrit le 2026-08-27, à la demande du fondateur : *« crée l'entièreté des choses qui doivent se
> trouver sur le Supabase, et n'oublie rien »*.

---

## Comment ce document évite d'oublier

**Il ne contient presque aucune liste.** « N'oublie rien » est une promesse qu'une liste écrite à
la main ne tient pas : elle est juste le jour où on l'écrit, puis une migration ajoute une
fonction, un déclencheur, une politique, et personne ne revient la corriger. Six mois plus tard
elle rassure sans rien garantir, ce qui est pire que de ne pas l'avoir.

Ce qui remplace la liste :

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5432/sentio_test pnpm run supabase:inventaire
```

**La référence est la base locale reconstruite à partir des migrations.** Elle ne peut pas
dériver, parce qu'elle *est* le schéma. Il n'y a aucun fichier d'attendu à tenir à jour, donc
aucun fichier d'attendu à oublier.

Et pour savoir ce qui manque à une base réelle :

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5432/sentio_test \
  pnpm run supabase:inventaire -- --cible="<url de la base en ligne>"
```

Il lit, il compare, il énumère les absents. **Il ne pousse rien** : appliquer un schéma est un
geste humain.

---

## 1. Le schéma, en un coup d'œil

Ce que les migrations produisent aujourd'hui, relevé par l'inventaire et non recopié :

| | |
|---|---|
| tables | **42** |
| vues | 3 |
| colonnes | 322 |
| fonctions | 52 |
| déclencheurs | **43** |
| tables avec RLS active | **42 sur 42** |
| politiques d'isolation | 42 |
| droits accordés à `anon` / `authenticated` | 44 |
| index | 124 |
| contraintes | 222 |

⚠️ **Les trois lignes en gras portent les garanties du produit**, et ce sont celles qu'une
migration à moitié appliquée fait disparaître sans bruit :

- un **déclencheur** absent, et l'ADN redevient modifiable, le journal redevient réinscriptible,
  le cliquet d'autonomie cesse d'exister ;
- **RLS** inactive sur une seule table, et cette table est lisible par tout le monde ;
- un **droit** manquant, et le client est refusé *avant* que RLS ne s'exprime, avec un message qui
  parle de permission et que personne ne relie à la bonne cause (piège 6 de `docs/31`).

L'inventaire compare les trois, une par une, par leur nom.

---

## 2. Les données de référence : le schéma seul ne suffit pas

**Ce n'est pas du jeu d'essai.** Sans ces lignes, le schéma est complet et le produit ne
fonctionne pas. Elles sont posées par des migrations, donc elles voyagent avec le schéma, mais un
`on conflict do nothing` sur une base à moitié migrée les laisse à zéro et rien ne le crie.

| Table | Attendu | Sans elle |
|---|---|---|
| `plan` | 3 | aucun abonnement ne peut exister |
| `plan_quota` | 18 | un plafond absent n'est pas un plafond infini, c'est un oubli |
| `capability` | 5 | la bibliothèque d'actes est vide |
| `capability_binding` | 15 | une capacité sans moteur ne s'exécute pas |
| `employee_definition` | ≥ 1 | aucun ADN sur lequel figer un employé |
| `strategy_variant` | 10 | aucun comportement par défaut à jouer |
| `identity` (libres) | **349** | plus aucun recrutement n'est possible |

⚠️ **Le réservoir d'identités est FINI : 349.** Une identité ne se réutilise jamais
(`reserve_identity`). C'est donc un plafond dur de 349 employés recrutés, essais compris. Chaque
invitation de `pnpm run inviter` en consomme une définitivement. À surveiller bien avant d'y
arriver, et à réapprovisionner par une migration.

---

## 3. Ce que le schéma ne peut pas porter

Ces cinq points ne sont dans aucune migration. C'est ici qu'on oublie.

### 3.1 Les fonctions à déployer

`diagnostic` · `desinscription` · `battement` · `recrutement`

```bash
pnpm run functions:verify        # elles tiennent sous Deno, tests compris
supabase functions deploy <nom>  # ⛔ geste humain
```

### 3.2 Les secrets des fonctions

⚠️ **Cette liste était incomplète, et son incomplétude était silencieuse.** Elle ne couvrait que
l'exécutant, parce que c'était la seule fonction existante quand elle a été écrite. Trois
fonctions déployées depuis ont chacune leur secret, et chacune **échoue fermé** sans lui.

| Secret | Fonction | Sans lui |
|---|---|---|
| `DATABASE_URL` | battement | l'exécutant ne joint aucune base |
| `SENTIO_HEARTBEAT_SECRET` | battement | plus aucun battement valide |
| `SENTIO_MODELE_PRINCIPAL_URL` | battement | le fournisseur, en groupe de quatre |
| `SENTIO_MODELE_PRINCIPAL_NOM` | battement | idem |
| `SENTIO_MODELE_PRINCIPAL_CLE` | battement | idem |
| `SENTIO_MODELE_PRINCIPAL_POLITIQUE` | battement | décide où partent les données réelles |
| **`SENTIO_PAIEMENT_SECRET`** | recrutement | **aucun paiement ne recrute : la fonction refuse tout** |
| **`SENTIO_OPTOUT_SECRET`** | desinscription | **tout lien de désinscription est invalide** (obligation légale) |
| **`SENTIO_ALLOWED_ORIGINS`** | diagnostic | **aucune origine autorisée : le diagnostic public est muet** |

Le produit ne tombe pas, il **refuse** : poliment, en silence, exactement comme s'il n'y avait pas
de client. C'est la panne la plus coûteuse à diagnostiquer, et elle se serait produite le jour de
la mise en vente.

`pnpm run deploiement:verifier` vérifie maintenant les neuf, et dit lequel manque et ce qu'il
casse. Il ne lit jamais une valeur, seulement des noms.

### 3.3 Le fournisseur de modèle

`provider_credential` est **vide**. Le gateway n'a donc aucun fournisseur.

⚠️ La contrainte `provider_no_train_needs_proof` refuse une ligne `no_train` sans
`opt_out_proven_at`. Ce n'est pas une formalité : c'est l'invariant 5 d'`AGENTS.md` rendu
mécanique. Tant que l'opt-out n'est pas **prouvé et daté**, le fournisseur reste `free`, et aucune
donnée réelle de client ne part chez lui.

C'est le préalable que ta mémoire projet nomme déjà : l'opt-out avant toute donnée réelle.

### 3.4 L'authentification

| Réglage | Pourquoi |
|---|---|
| Autoriser `<ton domaine>/auth/callback` en adresse de retour | sinon **tous** les liens d'accès sont refusés, et personne n'entre jamais |
| Autoriser `<ton domaine>/auth/callback?next=/acces` | l'adresse exacte que produit `pnpm run inviter` |
| Désactiver les emails de Supabase | c'est Sentio qui rédige et envoie (`docs/33`). Sinon le client reçoit **deux** messages, dont un en anglais |
| Longueur minimale du mot de passe : 8 | c'est ce que `/acces` annonce au client. Deux plafonds différents feraient refuser un mot de passe déjà accepté à l'écran |

⚠️ **L'adresse de retour est le point d'oubli le plus probable de toute cette page.** Rien ne
prévient : les emails partent, le client clique, et il tombe sur une erreur.

### 3.4 bis La région d'exécution du site

`apps/vitrine/vercel.json` fixe `"regions": ["cdg1"]`, c'est-à-dire Paris.

⚠️ **Ce n'est pas une préférence, c'est une déclaration opposable.** La politique de
confidentialité écrit noir sur blanc que l'application est déployée « avec exécution privilégiée
en région européenne ». Sans ce fichier, Vercel exécute par défaut aux États-Unis, et la page
mentirait à qui la lit — sur le seul point qu'un dirigeant européen vérifie avant de confier ses
données.

Le laisser au réglage de la console serait pire : un réglage se perd à la recréation du projet,
un fichier versionné voyage avec le code.

### 3.5 Ce qui ne va PAS sur Supabase

À poser chez l'hébergeur de l'interface, jamais ici. Les mélanger fait chercher au mauvais endroit
le jour où l'un manque.

`RESEND_API_KEY` · `SENTIO_EMAIL_EXPEDITEUR` · `STRIPE_SECRET_KEY` · `STRIPE_LINK_*` ·
`CRON_SECRET` · `SENTIO_IP_HASH_SALT` · `NEXT_PUBLIC_APP_URL` · `NEXT_PUBLIC_SUPABASE_URL` ·
`NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_DB_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `GROQ_API_KEY`

---

## 4. Sur quel projet : tranché le 2026-08-27

**Le projet cœur**, `ritwmikarekkisxaiokf`. Décision du fondateur, écrite dans
[`adr/0030`](adr/0030-une-seule-base-celle-du-coeur.md) avec son compromis.

En deux lignes : il est vide donc rien à nettoyer plus tard, il est **déjà relié au poste** donc
un `supabase db push` ne peut pas se tromper de cible, et sa région est celle que la politique de
confidentialité déclare. Le seul argument qui plaidait pour l'autre projet, préserver ses comptes,
est tombé : il n'y en avait aucun de réel, et la base est en pause depuis le 6 août, donc elle
n'a rien pu recevoir depuis.

⚠️ **Conséquence à traiter avant la mise en ligne.** Les pages de l'ancienne génération
(`/dashboard`, `/agent`, `/tasks/[id]`, `/decisions`, `/onboarding`) interrogent des tables qui
n'existeront jamais dans le cœur. Elles sont **déjà** hors service, puisque leur base est en
pause : la décision ne casse rien, elle rend visible ce qui l'était déjà. Mais une page qui échoue
est pire qu'une page absente sur un site où l'on vend. À retirer ou à masquer.

---

## 5. L'ordre des gestes

Chaque étape se vérifie avant la suivante. Aucune ne se saute.

1. **Trancher le projet** (§4).
2. **Pousser le schéma** : `supabase db push`. ⛔ Geste humain, jamais un agent.
3. **Vérifier ce qui a réellement atterri** :
   ```bash
   DATABASE_URL=postgres://postgres@127.0.0.1:5432/sentio_test \
     pnpm run supabase:inventaire -- --cible="<url en ligne>"
   ```
   Tant qu'il rend un manque, l'étape n'est pas finie.
4. **Poser les neuf secrets** (§3.2), puis `pnpm run deploiement:verifier`.
5. **Déployer les quatre fonctions** (§3.1).
6. **Poser le fournisseur de modèle** (§3.3), en `free` tant que l'opt-out n'est pas prouvé.
7. **Régler l'authentification** (§3.4). C'est l'oubli le plus probable.
8. **Poser les variables de l'interface** (§3.5) chez son hébergeur.
9. **T'inviter toi-même** : `pnpm run inviter` ([`docs/33`](33-le-parcours-gratuit.md)).

---

## 6. Ce que ce document ne remplace pas

Il dit ce qui doit **exister**. Il ne dit pas si le produit **marche** : ça, c'est l'étape 16 de
[`docs/29`](29-plan-jusquau-premier-client.md), la répétition générale en réel, la seule qui
éprouve l'écart entre une base locale et une base en ligne, la vraie latence, le vrai fournisseur
de modèle et la vraie délivrabilité.

Et il ne referme pas les trois points qui bloquent la vente, listés dans `docs/32` : la grille
tarifaire, le webhook de paiement qui n'existe pas, et `/espace` qu'aucun lien n'atteint depuis
le site public.
