# Migrations

SQL brut, appliqué via le CLI Supabase. Une migration = un fichier, nommé
`<horodatage>_<nom>.sql`, appliqué dans l'ordre alphabétique.

**Isolation par entreprise (RLS) activée dans la même migration que la table qui la nécessite,
jamais différée** — c'est le point 1 des huit qu'on ne rattrape jamais
([`03-modele-de-donnees.md`](../../../docs/03-modele-de-donnees.md)).

## Ordre

Les tables suivent l'ordre des dépendances de clés étrangères. Une correction par rapport au
backlog : `capability` (`FOND-23`) est créée **avant** `employee_capability` (`FOND-12`), qui la
référence. L'incohérence était signalée dans
[`20-plan-action.md`](../../../docs/20-plan-action.md), phase 1.

Trois migrations ne créent pas de table :

| Fichier | Rôle |
|---|---|
| `…028_grants.sql` | droits explicites — ne jamais dépendre des défauts de la plateforme |
| `…029_verify_tenant_isolation.sql` | `FOND-30` — échoue le déploiement si une table échappe à l'isolation |

## Vérification

```bash
packages/db/tests/run.sh
```

Applique les migrations sur une base vierge puis exécute
[`../tests/invariants.sql`](../tests/invariants.sql). Ne nécessite **pas** Supabase : le schéma
`auth` est stubé ([`../tests/supabase-stub.sql`](../tests/supabase-stub.sql)), parce qu'un schéma
vérifiable uniquement sur sa plateforme cible ne serait pas indépendant de l'hébergeur.

Tourne aussi en intégration continue, sur un Postgres 16.

## État

Migrations **écrites et vérifiées sur Postgres 16**, pas encore appliquées sur Supabase :
le projet reste à créer (`FOND-03`).
