#!/usr/bin/env bash
# Apply database/migrations up, down, then up again against an EMPTY
# throwaway database, failing on the first SQL error. Uses plain psql in
# version order (the same order golang-migrate uses). Then checks, in a
# separate schema, that rolling an init.sql-built database back to 006 keeps
# the columns init.sql already had.
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

# Databases created from database/init.sql already had the Stripe, role and
# profile/plan columns before migrations 007-010 existed. Rolling back to 006
# must keep them (and their data): 007 down only drops its index, and 008,
# 009 and 010 down are no-ops (009 also keeps users_role_check). Built in a separate schema so the migration-built tables
# above stay as they are for the tests that follow.
INIT_SQL="$(cd "$(dirname "$0")/../database" && pwd)/init.sql"
CHECK_SCHEMA=initsql_rollback_check
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "SET client_min_messages = warning; DROP SCHEMA IF EXISTS $CHECK_SCHEMA CASCADE; CREATE SCHEMA $CHECK_SCHEMA" >/dev/null
export PGOPTIONS="-c search_path=$CHECK_SCHEMA,public"
apply "$INIT_SQL"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "INSERT INTO users (email, password_hash, name, avatar_url, subscription_plan, stripe_customer_id, stripe_subscription_id, stripe_event_at, role) VALUES ('rollback@example.test', 'x', NULL, 'a.png', 'pro', 'cus_check', 'sub_check', '2026-01-02T03:04:05Z', 'admin')" >/dev/null
mapfile -t ROLLBACK < <(ls "$DIR"/*.down.sql | sort -r | awk -F/ '{ n = $NF; sub(/_.*/, "", n); if (n + 0 >= 7) print }')
apply "${ROLLBACK[@]}"
missing=$(psql "$DB_URL" -At -c "SELECT string_agg(c, ',') FROM unnest(ARRAY['stripe_customer_id', 'stripe_subscription_id', 'stripe_event_at', 'role', 'avatar_url', 'subscription_plan', 'subscription_status']) AS c WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '$CHECK_SCHEMA' AND table_name = 'users' AND column_name = c)")
if [ -n "$missing" ]; then
  echo "FAILED: rolling an init.sql database back to 006 dropped users columns: $missing" >&2
  exit 1
fi
kept=$(psql "$DB_URL" -At -c "SELECT concat_ws('|', stripe_customer_id, stripe_subscription_id, extract(epoch FROM stripe_event_at)::bigint, role, avatar_url, subscription_plan, subscription_status) FROM users WHERE email = 'rollback@example.test'")
types=$(psql "$DB_URL" -At -c "SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_schema = '$CHECK_SCHEMA' AND table_name = 'users' AND column_name IN ('created_at', 'name')")
role_check=$(psql "$DB_URL" -At -c "SELECT count(*) FROM pg_constraint WHERE conname = 'users_role_check' AND conrelid = '$CHECK_SCHEMA.users'::regclass")
unset PGOPTIONS
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "SET client_min_messages = warning; DROP SCHEMA $CHECK_SCHEMA CASCADE" >/dev/null
if [ "$kept" != "cus_check|sub_check|1767323045|admin|a.png|pro|active" ]; then
  echo "FAILED: rolling an init.sql database back to 006 lost user columns (got '$kept')" >&2
  exit 1
fi
if [ "$role_check" != "1" ]; then
  echo "FAILED: rolling an init.sql database back to 006 dropped users_role_check" >&2
  exit 1
fi
if [ "$types" != "created_at:timestamp with time zone:YES,name:character varying:YES" ]; then
  echo "FAILED: rolling an init.sql database back to 006 changed users columns (got '$types')" >&2
  exit 1
fi
echo "init.sql rollback to 006: ok (${#ROLLBACK[@]} down migrations kept init.sql columns)"
