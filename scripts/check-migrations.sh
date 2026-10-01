#!/usr/bin/env bash
# Apply database/migrations up, down, then up again against an EMPTY
# throwaway database, failing on the first SQL error. Uses plain psql in
# version order (the same order golang-migrate uses).
#
#   scripts/check-migrations.sh "postgres://user:pass@localhost:5432/scratch_db?sslmode=disable"
#
# Never point it at a database you care about: the down pass drops tables.
set -euo pipefail

DB_URL="${1:?usage: $0 <postgres-url-of-an-empty-throwaway-db>}"
DIR="$(cd "$(dirname "$0")/../database/migrations" && pwd)"

apply() {
  local f
  for f in "$@"; do
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "FAILED: $(basename "$f")" >&2; exit 1; }
  done
}

mapfile -t UP < <(ls "$DIR"/*.up.sql | sort)
mapfile -t DOWN < <(ls "$DIR"/*.down.sql | sort -r)

apply "${UP[@]}";   echo "up: ${#UP[@]} migrations applied"
apply "${DOWN[@]}"; echo "down: ${#DOWN[@]} migrations reverted"
left=$(psql "$DB_URL" -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
if [ "$left" != "0" ]; then
  echo "FAILED: $left tables left after the down pass" >&2
  exit 1
fi
apply "${UP[@]}";   echo "up again: ok"
