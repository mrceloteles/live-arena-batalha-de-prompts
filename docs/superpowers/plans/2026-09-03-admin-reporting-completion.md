# Admin and Reporting Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing placeholder admin and report screens into authenticated, working controls backed by real game data, without changing the approved visual language or enabling Gemini.

**Architecture:** Keep the existing Node 24 HTTP server, SQLite repositories, and browser client. Add a small HMAC-signed admin-token module, authenticated API actions for login/reset/reporting, repository-level report aggregation, and wire the existing admin/report HTML to those actions. The game API and current three-player lifecycle remain unchanged.

**Tech Stack:** Node.js 24, built-in `node:http`, `node:crypto`, `node:sqlite`, vanilla JavaScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-30-descubra-o-prompt-base-design.md`

## Global Constraints

- Do not change the approved brand assets or general visual design.
- Do not enable Gemini; keep `JUDGE_MODE=fake` as the default.
- Do not introduce third-party runtime dependencies.
- All admin mutations require a valid expiring token.
- Preserve all historical games when starting a new cycle.
- Tests must fail before each production change and pass afterward.

---

### Task 1: Admin authentication

**Files:**
- Create: `src/server/admin-auth.mjs`
- Modify: `src/server/api.mjs`
- Test: `test/api/admin.test.mjs`

**Interfaces:**
- Produces: `createAdminAuth({ password, secret, now })` with `login(password)` and `verify(token)`.
- Produces API action `admin_login` returning `{ ok, token, expires_at }`.

- [ ] Write tests proving wrong passwords fail and signed tokens expire.
- [ ] Run `node --test test/api/admin.test.mjs` and confirm failure because the module/action is absent.
- [ ] Implement constant-time password comparison and HMAC-signed tokens.
- [ ] Run the focused test and confirm success.

### Task 2: Safe game reset and real reports

**Files:**
- Modify: `src/server/api.mjs`
- Modify: `src/db/repositories/index.mjs`
- Test: `test/api/admin.test.mjs`

**Interfaces:**
- Produces API action `admin_reset` consuming `{ admin_token }` and returning the new registration room.
- Produces API action `report_metrics` consuming `{ admin_token, start_date, end_date }` and returning cards plus player and match rows.

- [ ] Add failing tests proving unauthenticated reset/report access is rejected.
- [ ] Add failing tests proving reset preserves previous game data and opens a clean registration cycle.
- [ ] Add failing tests proving reports are calculated from recorded sessions, submissions, and scores.
- [ ] Implement repository queries and API actions.
- [ ] Run focused tests and confirm success.

### Task 3: Wire the existing admin and report screens

**Files:**
- Modify: `src/web/pages/index.mjs`
- Modify: `public/assets/js/app.js`
- Test: `test/web/pages.test.mjs`
- Test: `test/smoke/http-admin.test.mjs`

**Interfaces:**
- Admin login stores the token in session storage and opens `report.php`.
- Report loads `report_metrics`, renders the existing table, and exposes a reset control with confirmation.
- Reset calls `admin_reset` and reports the new cycle.

- [ ] Add failing page-contract and HTTP-flow tests.
- [ ] Add the minimum required selectors and client event handlers.
- [ ] Run web and HTTP tests and confirm success.

### Task 4: Verification and publication

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `test/smoke/http-admin.test.mjs`

- [ ] Document `ADMIN_PASSWORD` and `ADMIN_SECRET` without populating secrets.
- [ ] Run all API, DB, domain, judge, smoke, and web tests.
- [ ] Run a fresh real HTTP round plus admin/report/reset flow.
- [ ] Publish only verified files to `main`.
- [ ] Confirm the GitHub Actions run succeeds.

