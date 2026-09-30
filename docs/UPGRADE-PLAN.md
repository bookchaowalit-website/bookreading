# Upgrade plan

Living backlog for improvement passes. Keep it short and actionable.

## Current state

**Score: 7/10** (was 6/10 after pass 1, 5/10 originally). Billing lifecycle
now round-trips through Stripe webhooks. Three services build and their unit tests
pass locally; backend is golangci-lint clean; CI now runs the real checks.
Large untested surface remains (ai-service `main.py` is ~3k lines, Go
repositories/handlers have no DB-backed tests).

Local check commands:

| Area | Command |
|------|---------|
| backend | `cd backend && go vet ./... && golangci-lint run ./... && go test -race ./...` |
| ai-service | `cd ai-service && ruff check . && pytest` (easyocr/playwright are optional for unit tests) |
| frontend | `cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build` |

## Backlog

### P0
- Webhook ordering: `customer.subscription.updated` can arrive before
  `checkout.session.completed`; it is acknowledged (user not yet linked) and
  the later checkout event sets `active`. If Stripe ever sends a stale
  checkout event after a cancel, the user is re-activated. Record
  `event.Created` per user (or re-fetch the subscription) to order events.
- Plans use `price_data` with fake price IDs (`price_pro_monthly`); move to
  real Stripe Price IDs from env so the billing portal can switch plans.

### P1
- Go: repository-layer tests against a throwaway Postgres (CI already has
  the service container pattern), starting with `user_repository.go`.
- Frontend: tests for `sharing.ts`, `novels.ts`, `offline-storage.ts`.
- Frontend subscription page shows raw `past_due`/`incomplete`/`canceled`
  statuses; add Thai labels next to the existing `active`/`canceling`.

### P2
- Adopt `ruff format` for ai-service in one mechanical commit, then add
  `ruff format --check` back to CI; widen the ruff rule set (`B`, `UP`).
- Replace `<img>` with `next/image` and fix the `react-hooks/exhaustive-deps`
  warnings reported by `npm run lint`.
- Consolidate the overlapping `ci.yml` and per-service workflows.

## Done in this pass (pass 2)
- Backend: `customer.subscription.updated/deleted` now update the owning
  user (lookup via new `UserRepository.GetByStripeSubscriptionID`): deleted or
  canceled -> plan `free`/status `canceled`; cancel-at-period-end ->
  `canceling`; resumed -> `active`; past_due/unpaid/paused -> `past_due`.
  Idempotent (no-op writes skipped), unknown subscriptions acknowledged,
  DB failures return 500 so Stripe retries. Tests use locally signed Stripe
  fixtures (`webhook.GenerateTestSignedPayload`), no network.
- Migration 007 + `init.sql`: index on `users.stripe_subscription_id`.
- Checkout success/cancel URLs read `FRONTEND_URL` (default
  `http://localhost:3000`); documented in `.env.example`/compose.
- Rate limiter: forwarding headers honored only from `TRUSTED_PROXIES`
  (default loopback + private ranges); XFF walked right-to-left so spoofed
  left-most hops are ignored. 12 table tests.
- ai-service: removed dead `routes.py` (failed to import, duplicated
  `/scrape` and `/chapter` in `main.py`); `REFACTORING.md` updated.
- `docker-build.yml`: login/push only when `DOCKERHUB_*` secrets exist;
  otherwise images are still built.

## Done in pass 1 (2026-09-30)
- Backend: Stripe webhook no longer panics on chunked bodies, refuses
  events when `STRIPE_WEBHOOK_SECRET` is unset, caps body size, guards a
  nil subscription and returns 500 on persistence failure.
- Backend: rate limiter uses a fixed window (a steady trickle used to be
  blocked eventually) and strips the port from `RemoteAddr` (each new TCP
  connection used to get a fresh bucket).
- Backend: API-key decrypt returns legacy plaintext unchanged (it returned
  decoded ciphertext bytes); raw 32-char hex keys are accepted.
- Backend: all golangci-lint findings fixed; linter pinned in CI; tests for
  crypto, rate limiting and the webhook guards.
- ai-service: `/manga/translate-url` failed on every call (`provider` read
  before assignment); undefined `logger` in `manga_translator.py`; duplicate
  dict key; dead code. Explicit `ruff.toml`; CI lint/test made honest.
- Frontend: `package-lock.json` is now tracked (CI `npm ci` could not run);
  Dockerfile uses `npm ci`; `parseTranslationError` handles axios
  "Network Error", 504 and non-string payloads, with 9 new tests (44 total).
- `ci.yml` Docker job copies `.env.example` so `docker compose build` can
  interpolate required variables.
