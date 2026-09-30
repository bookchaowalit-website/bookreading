# Upgrade plan

Living backlog for improvement passes. Keep it short and actionable.

## Current state

**Score: 6/10** (was 5/10). Three services build and their unit tests
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
- Stripe `customer.subscription.updated/deleted` webhooks are acknowledged
  but ignored: add `UserRepository.GetByStripeSubscriptionID` and update
  `SubscriptionStatus` so cancellations take effect.
- Checkout `SuccessURL`/`CancelURL` are hard-coded to `http://localhost:3000`
  in `backend/internal/delivery/http/payment_handler.go`; read a
  `FRONTEND_URL` env var (like `STRIPE_BILLING_PORTAL_RETURN_URL`).

### P1
- `getClientIP` trusts `X-Forwarded-For`/`X-Real-IP` unconditionally; add a
  `TRUSTED_PROXIES` setting so direct clients cannot spoof their bucket.
- `ai-service/routes.py` is dead and fails to import (`ScrapeRequest` no
  longer exists in `scrapers.py`); finish the split described in
  `REFACTORING.md` or delete it.
- Go: repository-layer tests against a throwaway Postgres (CI already has
  the service container pattern), starting with `user_repository.go`.
- Frontend: tests for `sharing.ts`, `novels.ts`, `offline-storage.ts`.
- `.github/workflows/docker-build.yml` pushes to Docker Hub on `main`; it
  fails if `DOCKERHUB_*` secrets are missing. Gate the login/push on the
  secret being present or remove the workflow.

### P2
- Adopt `ruff format` for ai-service in one mechanical commit, then add
  `ruff format --check` back to CI; widen the ruff rule set (`B`, `UP`).
- Replace `<img>` with `next/image` and fix the `react-hooks/exhaustive-deps`
  warnings reported by `npm run lint`.
- Consolidate the overlapping `ci.yml` and per-service workflows.

## Done in this pass (2026-09-30)
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
