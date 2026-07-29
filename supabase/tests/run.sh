#!/usr/bin/env bash
# Applique les migrations sur une base vierge, puis exécute les tests d'invariants.
#
# Ne dépend pas de Supabase : le schéma `auth` est stubé localement (voir supabase-stub.sql).
# C'est volontaire — l'architecture impose de rester indépendant de l'hébergeur, et un schéma
# qu'on ne peut vérifier que sur la plateforme cible n'est pas vérifiable en intégration continue.
#
# Usage :
#   supabase/tests/run.sh                      # base locale jetable
#   DATABASE_URL=postgres://... supabase/tests/run.sh

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations="$here/../migrations"

# Base LOCALE et jetable par défaut. Ce script applique un schéma complet et exécute des tests
# destructifs dans une transaction : ne jamais le pointer vers le projet Supabase distant.
: "${DATABASE_URL:=postgres://postgres@127.0.0.1:5432/sentio_test}"

case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    echo "✋ DATABASE_URL désigne un projet Supabase distant." >&2
    echo "   Ce script est fait pour une base jetable. Pour le distant : supabase db push." >&2
    exit 1
    ;;
esac
export PGOPTIONS="--client-min-messages=notice"

echo "→ base : ${DATABASE_URL%%\?*}"

echo "→ schéma auth (stub Supabase)"
psql -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f "$here/supabase-stub.sql"

echo "→ migrations"
for migration in "$migrations"/*.sql; do
  [ -e "$migration" ] || continue
  printf '   %s\n' "$(basename "$migration")"
  psql -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f "$migration"
done

echo "→ invariants"
psql -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f "$here/invariants.sql"

echo "✅ migrations appliquées et invariants vérifiés"
