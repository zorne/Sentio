# Migrations

SQL brut, appliqué via Supabase CLI. Une migration = un fichier, nommé
`<horodatage>_<nom>.sql`. Isolation par entreprise (RLS) activée dans la même migration que la
table qui la nécessite — jamais différée ([`../../../docs/03-modele-de-donnees.md`](../../../docs/03-modele-de-donnees.md)).

Ordre des tables : voir [`../../../docs/20-plan-action.md`](../../../docs/20-plan-action.md), Phase 1.

En attente du projet Supabase (FOND-03) avant de pouvoir être appliquées.
