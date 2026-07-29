# supabase/

Schéma de la base : migrations, tests d'invariants, configuration du CLI.

Le projet distant est en **région UE** (`eu-north-1`) — contrainte dure, pas une préférence
([`10-securite-rgpd.md`](../docs/10-securite-rgpd.md)).

```
supabase/
  config.toml        configuration du CLI (versionnée)
  migrations/        le schéma, appliqué dans l'ordre alphabétique
  tests/             invariants vérifiés sur un Postgres nu
  .temp/             cache du CLI — ignoré par git, contient l'URL du pooler
```

---

## Pourquoi les migrations ne sont pas dans `packages/db`

[`02-architecture.md`](../docs/02-architecture.md) attribuait les migrations à `packages/db`.
Elles vivent ici parce que le CLI Supabase les lit à cet emplacement, et qu'un lien symbolique
depuis `packages/db` ajouterait une indirection implicite pour contourner la convention de
l'outil qui les applique.

`packages/db` garde ce qui relève du TypeScript : repositories et accès typé à la base.

---

## Migrations

Une migration = un fichier `<horodatage>_<nom>.sql`. **L'isolation par entreprise (RLS) est
activée dans la migration qui crée la table, jamais différée** — c'est le point 1 des huit qu'on
ne rattrape jamais ([`03-modele-de-donnees.md`](../docs/03-modele-de-donnees.md)).

Les tables suivent l'ordre des dépendances de clés étrangères. Une correction par rapport au
backlog : `capability` (`FOND-23`) est créée **avant** `employee_capability` (`FOND-12`), qui la
référence — incohérence signalée dans [`20-plan-action.md`](../docs/20-plan-action.md), phase 1.

Deux migrations ne créent aucune table :

| Fichier | Rôle |
|---|---|
| `…028_grants.sql` | droits explicites — ne jamais dépendre des défauts de la plateforme |
| `…029_verify_tenant_isolation.sql` | `FOND-30` — échoue le déploiement si une table échappe à l'isolation |

---

## Vérifier avant de pousser

```bash
supabase/tests/run.sh
```

Applique les migrations sur une base **locale et jetable**, puis exécute
[`tests/invariants.sql`](tests/invariants.sql) : ADN immuable, journal en ajout seul, idempotence,
attribution des ventes, réservation d'identité, et TEST-01 (isolation entre deux entreprises).

Ne nécessite pas Supabase — le schéma `auth` est stubé
([`tests/supabase-stub.sql`](tests/supabase-stub.sql)), parce qu'un schéma vérifiable uniquement
sur sa plateforme cible ne serait pas indépendant de son hébergeur. Tourne aussi en intégration
continue sur un Postgres 16.

Le script **refuse** de s'exécuter sur une URL Supabase distante : il est destructif par nature.

---

## Appliquer sur le projet distant

```bash
supabase db push
```

S'authentifie via la session du CLI (`supabase login`). **Aucune clé ne doit transiter par un
chat, un ticket ou une capture** : une clé qui a transité est compromise et doit être régénérée
([`AGENTS.md`](../AGENTS.md), invariant 7).
