# Upgrade plan

Living backlog for improvement passes. Keep it short and actionable.

## Current state

**Score: 9.0/10** (8.8 after pass 9, 8.6 after pass 8, 8.3 after pass 7, 8 after pass 6, 7.5 after pass 3, 7 after pass 2, 6 after pass 1, 5
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
- Operator, before deploying pass 10: set `GRPC_SERVICE_TOKEN` wherever a
  generated gRPC build runs with `NODE_ENV=production` (it refuses to start
  without it), and make sure an admin account exists (`ADMIN_USER_IDS`):
  adding novels and saving chapter text are now admin-only.
- Operator, before deploying pass 9: replace `ADMIN_EMAILS` with
  `ADMIN_USER_IDS` (UUID from `GET /api/users/me`) or no admin is promoted.
- Operator task before enabling billing: create recurring Prices
  in Stripe, set `STRIPE_PRICE_PRO`/`STRIPE_PRICE_TEAM`, and enable plan
  switching between them in the Stripe billing-portal configuration.

### P1
- Schema drift beyond `users`: migrations and `init.sql` still disagree on
  most other tables (`chapters`, `novels`, `terminology`, `novel_*`,
  timestamptz vs timestamp; init.sql-only `review_queue`,
  `character_profiles`, `translation_*`; migration-only `bookmarks`,
  `reading_progress`, `user_api_keys`, `translation_cache`). Pick the
  migrations as the source of truth, add aligning migrations table by table
  (repository SELECT lists must match), and make `init.sql` a dump of the
  migrated schema. `scripts/check-migrations.sh` + the DB tests catch
  regressions.
- gRPC is not started by `cmd/main.go` (no generated stubs). When it is
  wired, build the server with `grpc.ServerAuthOptions(os.Getenv)` and add a
  test that the generated server rejects calls without the token.
- Product decision: readers' own translations are now local-only (only
  admins persist chapter text). If readers should keep them across devices,
  add a per-user translation table instead of reopening the shared write.
- Docker compose still publishes Postgres `5432` and backend `8888` on all
  interfaces; bind them to 127.0.0.1 unless a reverse proxy needs them.
- Operator: set `AI_SERVICE_TOKEN` in the production `.env` now that the
  browser goes through `/api/ai` (backend and ai-service share it via
  `env_file`), then confirm `/api/ai/translate` works and a direct call to
  ai-service without the token gets 401.
- `/api/ai/review/pending` and `/stats` are still readable by any
  signed-in user; decide whether the queue is admin-only too.
- Expensive `/api/ai` POSTs (translate, manga) only get the global rate
  limit; consider a per-user quota tied to the subscription plan.
- ai-service: Webtoons Playwright path resolves DNS inside Chromium; only
  navigations are held to the allow-list. Consider dropping the browser path
  or routing it through a pinned proxy.
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

## Done in this pass (pass 10: route access levels, gRPC token)
- P0 closed: `POST /api/novels` (server-side scrape of any URL into the
  shared catalog) and `/api/chapters/update` are admin-only;
  `/api/chapters/translate` needs a session, and saving caller-supplied
  `translated_text` over the shared chapter needs admin (`requireAdmin`).
  No per-user chapter copies exist, so shared writes are admin's.
- Route audit: public reads (novels, chapters, translation history/cache,
  health) answer 405 to other methods (`readOnly`); register, login,
  logout and the Stripe webhook are POST-only (`postOnly`).
  `routes_access_test.go` walks every pattern the real mux registers
  (`routeMux` records them) and probes each method as anonymous / user /
  admin: an unclassified route, a changed level, or an anonymous
  state-changing method outside the 4-entry `publicWrites` list fails CI.
  The AI proxy allow-list is walked the same way.
- `AuthMiddleware` ignores `Bearer null`/`undefined`/empty placeholders and
  falls back to the session cookie (pages sent `Bearer null` from an empty
  localStorage, which 401'd even with a valid cookie).
- gRPC: `delivery/grpc/auth.go` (no build tag) adds unary + stream
  interceptors requiring `authorization: Bearer $GRPC_SERVICE_TOKEN`
  (constant-time compare, fails startup in production when unset);
  compose binds 9091 to 127.0.0.1.
- Frontend: reader uses `authHeader()` (no `Bearer null`), shows "add novel
  from URL" and persists chapter text only for admins; the chapters page
  explains a 403 on a not-yet-added featured novel.
- Verified: go vet, `go test -race ./...`, golangci-lint 0 issues; a
  mutation check (unprotecting `/api/chapters/update`, adding an
  unclassified route) fails the new tests; frontend tsc, vitest 69/69,
  lint, `next build`.

## Done in pass 9: IDOR, admin bootstrap, migrations, admin UI
- P0 IDOR closed: `/api/subscriptions*`, `/api/reading-progress*`,
  `/api/bookmarks*` and `/api/feedback` took `user_id` from the query
  string. `sessionUserID` (handler.go) now decides; a mismatching `user_id`
  returns 403. Subscribe stores the session owner (it used to return any
  user's row for the novel); unsubscribe, bookmark and terminology deletes
  are owner-checked (404 for foreign ids); the unscoped `DeleteProgress`
  usecase is gone. `trigger-update` (all users' subscriptions) is
  admin-only and no longer runs on the cancelled request context. Audited
  library, api-keys and payments: already session-scoped. Route-level tests
  (`ownership_test.go`) over `NewServerWithDeps` with in-memory repos.
- Admin bootstrap: registration does not verify email, so `ADMIN_EMAILS`
  could promote whoever registered a listed address first. Replaced by
  `ADMIN_USER_IDS` (account UUIDs); `ADMIN_EMAILS` is ignored with a
  warning (`BootstrapAdmins`, tested).
- Migrations: 007 adds the `stripe_*` columns before its index (fresh
  `migrate up` failed there); new 010 adds `avatar_url`,
  `subscription_plan/status`, nullable `name`, timestamptz, so the `users`
  table matches `init.sql` (verified column/index diff on Postgres 16).
  `scripts/check-migrations.sh` runs up/down/up; backend CI runs it and
  DB-backed repository tests (`BOOKREADING_TEST_DATABASE_URL`), which also
  caught `user_terminology` `SELECT *` failing on the migrated table.
- Frontend: `useIsAdmin` (role from `/api/users/me`) hides review
  approve/edit/reject and the subscriptions "check now" from non-admins;
  vitest for user / failed lookup / admin.
- Verified: gofmt, go vet, `go test -race ./...` (+ DB tests on migrated and
  init.sql databases), golangci-lint 0 issues; frontend tsc, vitest 67/67,
  lint, `next build`.

## Done in pass 8: admin role, server timeouts, auth context fix
- Fixed a P0 found while adding roles: `AuthMiddleware` stored the user ID
  under a typed context key while handlers read the plain string `"userID"`
  (and `GetUserIDFromContext` a third key), so every protected handler
  (`/api/users/me`, library, terminology, payments, API keys, reading
  feedback) answered 401 after a valid login, and `/api/auth/refresh`
  never found its claims. One typed key now; regression test added.
- Admin role: migration `009_add_users_role` (up/down; `role` defaults to
  `user`, CHECK user|admin; `init.sql` updated), `domain.User.Role`,
  `Handler.AdminMiddleware` (role read from the user record so demotion is
  immediate; 403 non-admin, 401 unknown user, 503 lookup failure).
  `POST /api/ai/review/approve|edit|reject` are admin-only and never reach
  ai-service otherwise. Bootstrap: `ADMIN_EMAILS` promotes existing
  accounts at startup (never creates or demotes; no hard-coded account).
- `http.Server` limits from `LoadServerConfig` (`HTTP_READ_HEADER_TIMEOUT`
  10s, `HTTP_READ_TIMEOUT` 60s, `HTTP_WRITE_TIMEOUT` 5m30s above
  `aiservice.RequestTimeout`, `HTTP_IDLE_TIMEOUT` 120s,
  `HTTP_MAX_HEADER_BYTES` 1 MiB); invalid values fail startup.
- Verified: gofmt, go vet, `go test -race ./...`, golangci-lint 0 issues.
  Migrations 001-009 applied to a throwaway Postgres 16: 009 up/down/up is
  idempotent, the CHECK rejects unknown roles, and the `PromoteAdmins`
  UPDATE promotes case-insensitively; `init.sql` loads with the new column.

## Done in pass 7: ai-service behind the backend, P1 closed
- P1 "frontend calls ai-service from the browser" done: new
  `backend/internal/delivery/http/ai_proxy_handler.go` serves `/api/ai/*`
  behind `Handler.AuthMiddleware` (cookie or bearer JWT) and forwards via the
  aiservice client's new `Forward`, which adds `AI_SERVICE_TOKEN`. Exact path
  allow-list (+ `/terminology/{id}` as `[A-Za-z0-9_-]`), method check,
  escapes/dot segments/`//` rejected, 2 MiB body cap (32 MiB for manga
  images), user credentials and upstream `Set-Cookie` never forwarded, an
  upstream 401/403 surfaces as 502 so users are not logged out. ai-service
  keeps its SSRF guard; manga health/supported-* stay public.
- Frontend: `aiApi` uses the backend client at `/api/ai`, new `aiReviewApi`
  replaces the review page's direct `fetch`es; `NEXT_PUBLIC_AI_SERVICE_URL`
  is gone (compose, Dockerfile, CI). `NEXT_PUBLIC_AI_DIRECT_URL` is a
  local-only bypass used by `scripts/read-local.sh` (no Go backend).
  `.env.example`, `docker-compose.yml`, README and `docs/API.md` updated.
- Tests: 6 Go handler tests (unauthenticated -> 401 with no upstream call;
  upstream gets the service token, not the user's JWT/cookie; traversal and
  unlisted paths; method/body limits; public metadata; upstream down) and 6
  vitest cases. go vet, `go test -race`, golangci-lint (0 issues), vitest 64,
  tsc, `next build`, ai-service pytest 195 green.

## Done in pass 6: SSRF follow-ups + service auth
- `/manga/fetch` and `/manga/translate-url` fetch only through
  `url_safety.safe_get`: chapter pages/site APIs are held to
  `site_routing.SUPPORTED_MANGA_DOMAINS` (+ `MANGA_EXTRA_ALLOWED_HOSTS`);
  page images additionally allow the known CDNs (`pstatic.net`,
  `mangadex.network`, `uploads.mangadex.org`, + `MANGA_IMAGE_EXTRA_ALLOWED_HOSTS`).
  Brand keywords only pick a parser, never make a host fetchable; the
  catch-all "any manga site" fetch is gone. Refused image URLs become
  per-page errors; refused page URLs return 400, upstream 4xx/5xx 502.
- DNS rebinding closed: `safe_get` connects to the address it just validated
  (IP-literal URL + original `Host` header + `sni_hostname` for TLS SNI and
  certificate checks), so httpx never re-resolves. Note: an egress proxy
  that only allow-lists hostnames will refuse CONNECT to IP literals.
- Optional service auth: `AI_SERVICE_TOKEN` makes every non-health route
  require `Authorization: Bearer` (constant-time compare,
  `ai-service/service_auth.py`); the Go `aiservice` client sends it from env.
- Tests: `test_manga_ssrf.py`, `test_service_auth.py`, pinning tests in
  `test_url_safety.py`, Go `aiservice/client_test.go` (195 pytest passing
  with `getaddrinfo` disabled; ruff; go vet, `go test -race`, golangci-lint).

## Done in pass 5: SSRF
- `ai-service/url_safety.py`: `/scrape`, `/chapter` and every novel scraper
  (piaotia incl. follow-up pages, qidian, 69shu, zongheng, 17k, generic,
  Korean) fetch through `safe_get`: http/https on default ports only, no
  userinfo/IP-literal hosts, host allow-list of supported novel sites
  (+ `SCRAPE_EXTRA_ALLOWED_HOSTS`), DNS resolved and any
  private/loopback/link-local/metadata/CGNAT/multicast address refused,
  redirects re-validated hop by hop (max 5), 5 MB body cap, bounded
  timeouts. Refusals return 400 (previously `/chapter` turned its own 400
  into a 500).
- `test_url_safety.py` (47 tests, DNS and HTTP mocked; suite verified with
  `socket.getaddrinfo` disabled). Routing tests now mock DNS too.
- `docker-compose.yml` publishes the ai-service on
  `${AI_SERVICE_BIND:-127.0.0.1}:8000` (checked with `docker compose config`).
- Third-party GitHub Actions in all workflows pinned to commit SHAs with a
  `# vX.Y.Z` comment (resolved via `git ls-remote`).
- Verified: `ruff check .`, `pytest` 107 passed.

## Done in pass 4
- Backend list pagination is clamped before SQL (`domain.NormalizePage`):
  a negative `limit`/`offset` made Postgres fail the request with a 500, and
  `limit` had no ceiling (now 200). Applies to novels, chapters, translation
  history and update history (`usecase/pagination_test.go`). The gRPC
  server (behind the `generated_grpc` tag) now maps `page`/`page_size`
  through a tag-free `pageWindow` helper (`delivery/grpc/pagination.go`,
  table test): page < 1 (incl. `MinInt32`, whose `Page-1` wrapped) becomes
  1, the size goes through `NormalizePage` *before* the offset is computed
  (page 2 of size 1000 used to skip rows 200..999), the offset is int64 and
  capped at `MaxInt32`, and responses echo the clamped values. The generated
  protobuf stubs are absent (`pb` is a 3-line stub), so the tagged build is
  checked only as "no errors besides undefined `pb.*`".
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
