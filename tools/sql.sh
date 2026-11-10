#!/usr/bin/env bash
# Exécute du SQL sur la base Supabase du groupe via l'API de gestion Supabase.
# Usage : tools/sql.sh fichier.sql     ou     tools/sql.sh -c "select 1;"
# Dans une session Claude de l'environnement « atelier-dofus », le jeton est ajouté
# automatiquement par le proxy ; ailleurs, exporte SUPABASE_ACCESS_TOKEN.
set -euo pipefail
REF="jvzwoialynhvhwkccgba"
if [ "${1:-}" = "-c" ]; then SQL="$2"; else SQL="$(cat "$1")"; fi
python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' <<<"$SQL" |
  curl -sS --fail-with-body -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:-proxy-injected}" -H "Content-Type: application/json" --data @-
echo
