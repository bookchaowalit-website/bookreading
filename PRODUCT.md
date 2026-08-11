# BookReading — Product Brief & Interview Case Study

*Tier A Interview Flagship in the
[Portfolio Interview Readiness Audit](../../../../../../docs/systems/interview-readiness-audit.md)
(solo-empire workspace — not part of this repo). The root
[`README.md`](./README.md) already sells the product well — real feature
set, real architecture (Go backend + Python AI-translation service +
Next.js frontend, docker-compose). This document covers the frontend
verification pass and the test-suite finding + fix.*

## Who this is for

A reader who wants Chinese web novels and manga translated to Thai without
waiting for (or paying for) official localization — auto-scraped source
content, AI-translated with terminology consistency across chapters, with
the reading-app fundamentals (progress sync, bookmarks, offline mode,
keyboard navigation) that a real reading habit needs.

## The problem

Machine-translated fan content usually means inconsistent terminology
(a character's name spelled three different ways across chapters) and no
reading-experience polish (no progress sync, no bookmarks, re-translating
on every visit). BookReading's answer: a terminology-consistency layer in
the AI translation service, plus a proper reading app shell — library,
chapters, an actual paginated reader, a manga-specific reader (different
UX — image-based, not text), offline mode, and reading stats.

## What I actually audited (frontend only, honest scope)

The full stack (Go backend, Python AI-translation service, Postgres) needs
real infrastructure and API keys (OpenAI/Gemini) to run — out of scope
without live infrastructure. This pass verified the frontend in isolation:
`tsc --noEmit`, `eslint` (0 errors after fixes), `next build` (all 21
routes, including the two distinct reader UIs), and — the interesting
part — **actually running the test suite for the first time.**

## Finding: tests that were never run (2026-08-05)

Two real test files existed — `useReadingProgress.test.ts`,
`api.test.ts` — but **no test runner was configured anywhere in the
repo.** Both files opened with a comment: *"To run these tests, install
vitest..."* Someone wrote the tests, left wiring instructions, and the
wiring never happened.

After wiring Vitest (`vitest.config.ts`, `src/test/setup.ts`, npm
scripts), the first run was **27 passed, 6 failed** — all 6 in
`api.test.ts`'s "Auth Interceptor" suite:

```text
Cannot read properties of undefined (reading '0')
  on (axios.create as any).mock.results[0]
```

### Root cause (traced, not guessed)

`api.test.ts` never imported `@/lib/api` — the module it claimed to test.
It only imported `axios` and mocked `axios.create`. Real
`lib/api.ts` calls `axios.create({ baseURL, withCredentials: true })` and
registers a request interceptor at **module load** time. Without importing
that module, `axios.create` was never invoked by the code under test, so
asserting against `mock.results[0]` crashed. The suite looked like
coverage but could not have been exercising the interceptor.

Also corrected during the fix: create options include `withCredentials:
true` (cookie sessions), not only `baseURL` — the old expectation was
incomplete even if import order had been fixed.

## Fix (2026-08-11) — Verified

Rewrote `frontend/src/lib/__tests__/api.test.ts` to:

1. Hoist a shared mock axios instance via `vi.hoisted`
2. `vi.mock('axios')` so `create` returns that instance
3. Dynamically `import('@/lib/api')` / `import('@/lib/new-api')` after
   `vi.resetModules()` so module-load `create` + interceptor registration
   actually run
4. Assert interceptor behavior by invoking the registered callback with
   and without a `localStorage` token (and that existing Authorization is
   not overwritten)
5. Call real `novelApi` / `authApi` / `new-api` helpers against the mock
   client instead of re-simulating URL strings in isolation

### Evidence

```bash
cd frontend && npm test
# Test Files  2 passed (2)
# Tests       35 passed (35)
```

Claims: **Verified** for frontend unit tests only. Backend `go test` and
AI-service `pytest` were not re-run in this pass. Full E2E with live
Postgres/OpenAI is still out of scope without infrastructure.

## Auth contract the tests lock in (frontend)

- Axios client: `baseURL` from `NEXT_PUBLIC_BACKEND_URL` (default
  `http://localhost:8080`), `withCredentials: true` (cookie session).
- Dev fallback: if `localStorage.token` is set and no Authorization header
  yet, request interceptor adds `Bearer <token>`.
- Envelope unwrap: many helpers return `response.data.data`.

## What I'm proud of pointing to

1. **Finding** dead tests by connecting the runner (interview signal:
   "having tests" ≠ "tests that work").
2. **Fixing** them by importing the real module and asserting the real
   interceptor contract — not deleting failures or force-passing mocks.

## What I'd improve next

1. Expand tests for manga/AI client paths (`aiApi` / `mangaApi` use raw
   `axios.post` to the AI service URL, not the shared client).
2. Next.js major upgrade (14 → 16) only with a live stack for regression.
3. ~15 non-blocking lint warnings (`useEffect` deps, `<img>` vs
   `next/image`) remain lower priority.
4. Harden hook tests that currently assert behavioral contracts lightly
   without always rendering every branch of `useReadingProgress`.

## Status

- **2026-08-05:** Test runner wired; 27/33 green; 6 failures diagnosed.
- **2026-08-11:** Auth interceptor + API client tests fixed; **35/35
  green** via `npm test`. Visual identity / reading UX not redesigned in
  either pass.
