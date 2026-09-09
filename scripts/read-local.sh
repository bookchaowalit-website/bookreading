#!/usr/bin/env bash
# Start a local reading stack: AI scrape/translate + Next.js reader.
# Does not start Postgres/Go/Stripe and does not bind ports already used
# by other solo-empire containers (3000, 5432).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AI_DIR="$ROOT/ai-service"
WEB_DIR="$ROOT/frontend"
AI_PORT="${AI_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3010}"

if [[ ! -x "$AI_DIR/venv/bin/uvicorn" ]]; then
  echo "Missing $AI_DIR/venv. Create it with python3.12 -m venv venv and install scrape/translate deps." >&2
  exit 1
fi

export ALLOWED_ORIGINS="http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}"
export DATABASE_URL="${DATABASE_URL:-}"
export LLM_PROVIDER="${LLM_PROVIDER:-google_translate}"
export NEXT_PUBLIC_AI_SERVICE_URL="http://127.0.0.1:${AI_PORT}"
export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-http://127.0.0.1:8888}"

echo "AI  http://127.0.0.1:${AI_PORT}"
echo "Web http://127.0.0.1:${WEB_PORT}/app/reader?novel=against-the-gods"

(cd "$AI_DIR" && exec ./venv/bin/uvicorn main:app --host 127.0.0.1 --port "$AI_PORT") &
AI_PID=$!
(cd "$WEB_DIR" && exec npm run dev -- -p "$WEB_PORT" -H 127.0.0.1) &
WEB_PID=$!

cleanup() {
  kill "$AI_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
