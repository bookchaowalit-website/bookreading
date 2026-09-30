# Upgrade plan

Living backlog for improvement passes. Keep it short and actionable.

## Current state

**Score: 8/10** (7.5 after pass 3, 7 after pass 2, 6 after pass 1, 5
originally). Billing uses configured Stripe Prices (validated at startup),
round-trips through webhooks order-safely and follows portal plan switches. Three services build and their unit tests
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
- (none open) Operator task before enabling billing: create recurring Prices
  in Stripe, set `STRIPE_PRICE_PRO`/`STRIPE_PRICE_TEAM`, and enable plan
  switching between them in the Stripe billing-portal configuration.

### P1
- Checkout sends `promptpay` with `mode=subscription`; verify Stripe supports
  it for recurring Prices in the account, otherwise drop it (checkout fails).
- Frontend subscription page hard-codes plan cards/prices; render
  `GET /api/payments/plans` (now returns `billing_enabled`) instead.
- Go: repository-layer tests against a throwaway Postgres (CI already has
  the service container pattern), starting with `user_repository.go`.
- Frontend: tests for `sharing.ts`, `novels.ts`, `offline-storage.ts`.

### P2
- Adopt `ruff format` for ai-service in one mechanical commit, then add
  `ruff format --check` back to CI; widen the ruff rule set (`B`, `UP`).
- Replace `<img>` with `next/image` and fix the `react-hooks/exhaustive-deps`
  warnings reported by `npm run lint`.
- Consolidate the overlapping `ci.yml` and per-service workflows.

## Done in this pass (pass 4)
- Backend: plans now charge configured Stripe Prices (`STRIPE_PRICE_PRO`,
  `STRIPE_PRICE_TEAM`) instead of inline `price_data` with hard-coded
  amounts. `LoadBillingPlans` validates at startup (fatal): IDs must look
  like `price_<id>` (the old `price_pro_monthly` placeholder is rejected),
  no duplicates, all prices required once `STRIPE_SECRET_KEY` is set, no
  half-configured billing. Billing unset -> checkout 503. Clients still send
  plan keys; Price IDs are never taken from or exposed to clients.
- Backend: `customer.subscription.updated` maps the subscription item's
  Price back to a plan, so billing-portal upgrades/downgrades update
  `subscription_plan` (unknown/retired prices keep the current plan).
- Tests (no network): env validation table, checkout against an in-process
  fake Stripe API via stripe-go's backend hook (asserts `line_items[0][price]`
  and no `price_data`), 503/400 paths, portal plan-switch webhooks.
- Frontend: Thai labels for `past_due`/`incomplete`/`canceled` plus an alert
  prompting a billing update (`src/lib/subscriptionStatus.ts`, 8 tests).
- `.env.example`/compose: `STRIPE_PRICE_*`; example leaves billing disabled.

- ai-service: `/scrape`, `/manga/fetch`, `/chapter` and the Korean scraper
  pick a parser from the parsed URL host (`site_routing.py`), not substrings
  of the whole URL (`toonily.com/webtoon/...` went to the Webtoons fetcher;
  `?ref=piaotia.com` or any "ko" in a path switched scrapers). 22 tests.
- Frontend: reading streak counts local calendar days (in UTC+7 a read after
  07:00 was filed under the wrong day, so the streak showed 0; invalid dates
  threw); chapter/page jump boxes ignore empty/non-numeric input instead of
  loading page NaN (which fell through to re-scraping). `src/lib/readingStats.ts`,
  7 tests; vitest pins `TZ=Asia/Bangkok`.

## Done in pass 3
- Backend: Stripe webhooks are order-safe. New `users.stripe_event_at`
  (migration 008 + `init.sql`; apply before deploying this backend) stores
  the `created` time of the newest applied event; strictly older events are
  ignored. A `checkout.session.completed` for the subscription the user
  already holds as `canceled` is ignored even within the same second, so a
  late/retried checkout can no longer re-activate a canceled user.
  Resubscribing (new subscription ID, newer event) still activates.
  5 new tests with locally signed fixtures (stale checkout after cancel,
  same-second checkout, out-of-order `updated`, resubscribe, unknown user).
- Backend (review fix): `checkout.session.completed` acknowledges only a
  genuinely missing user (`sql.ErrNoRows`); any other `GetByID` error now
  returns 500 so Stripe retries instead of silently dropping a paid
  activation. Test with a failing repo stub, then a successful retry.

## Done in pass 2
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
