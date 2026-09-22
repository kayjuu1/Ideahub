# Build evidence

## Baseline

`bun run typecheck` passed before implementation: 2 successful tasks, 2 total.

## Phase 0 — passed

Added Workers/Vite integration, local D1/R2 bindings, generated Worker types, Drizzle configuration, Bun workspace scripts, CI, and the styled IdeaGap scaffold. Bun is retained and web dependencies are pinned. Local persistence is shared between Wrangler and Vite. No production resources have been changed.

Evidence (2026-09-22):

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
wrangler d1 execute DB --local --command "select 1": success: true, results: [{"1":1}]
bun run dev: VITE v8.3.0 ready; http://localhost:3000/
HTTP smoke check: Status=200, HasTitle=true, HasStyles=true, HasShell=true
wrangler types: Types written to worker-configuration.d.ts
```

Wrangler/Vite subprocesses require escalation in this Windows sandbox; the approved retries passed. Cloudflare login has D1 and Workers access for Ideagap Limited; email permissions need refreshing before phase 8.

## Phase 1 — passed

Added Better Auth email/password authentication and admin roles, separate generated auth schema, local and remote migrations, login/logout, reusable session/role middleware, and an operator-only admin seed script. Compiled Worker integration tests prove seeded fixture admins log in and viewer/editor requests to the admin function return 403. At the owner's direction, Ideahub-Admin (admin@ideagap.org) was seeded locally only; login verified and test session revoked. Its generated password was discarded; first-use password setup awaits the reset flow.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 2 passed; Tests 31 passed
local auth migration: 12 commands executed successfully
staging auth migration: 12 commands executed successfully (1.42ms)
Test-Path apps/web/dist/server/.dev.vars: False
```

Coverage includes anonymous 401, role matrix, direct administrative endpoint denial, disabled signup, cross-origin login denial, current role lookup, bans, and session revocation.

## Phase 2 — passed

Added the complete core schema, required indexes, FK/check constraints, an atomic-batch activity helper, field diffing, and database triggers preventing audit updates/deletes. Vault schema includes the agreed tombstone constraint; encryption behavior remains reserved for phase 9. Applied generated migrations locally and to staging without editing applied history.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 4 passed; Tests 39 passed
local and staging migrations: 0001 and 0002 applied successfully
staging PRAGMA foreign_keys: 1
staging PRAGMA foreign_key_check: []
```

Integration tests reject missing FKs, immutable audit changes, invalid statuses and tags; demonstrate business-write rollback when audit insertion fails; and retain vault history through tombstones.

## Phase 3 — passed

Added protected people CRUD, profile forms, server-side pagination/sorting/filtering, LIKE search, soft-delete confirmation, shared shadcn components, persisted theme, and keyboard search. Every new endpoint has role and anonymous-request integration coverage. Search tests caught a SQLite escape-expression issue, which was fixed before passing the gate. Unexpected handler failures now return sanitized messages.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 4 passed; Tests 65 passed
```

The compiled Worker tests create, edit, filter, paginate, and delete people; verify deleted records return 404 and disappear from lists; and assert recorded field diffs. No automated browser E2E was added.

## Phase 4 — passed

Added group/tag management, group detail with bulk membership editing, profile membership controls, and selected-people bulk actions. Tags normalize to lowercase, duplicate creation is idempotent, and merges preserve overlapping memberships without orphaned rows. Bulk operations and their audit events use atomic D1 batches; counts exclude deleted people. Group deletion requires an empty group or explicit membership removal.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 4 passed; Tests 96 passed
```

Compiled Worker tests cover every new function for admin/editor/viewer/anonymous, multiple groups per person, duplicate membership audit suppression, nonempty-group deletion protection, lowercase tag deduplication, overlapping tag merge, and PRAGMA foreign_key_check with no violations. Database access remains behind protectedFn; bootstrap and Better Auth internals are the documented exceptions.

## Phase 5 — passed

Added notes with author identity, safe Markdown-lite rendering, optimistic edits, confirmed soft deletion, and paginated person timelines showing field diffs and relationship events. All five endpoints use protectedFn, with additional author-or-admin enforcement for note changes. Profile and note updates refresh the displayed timeline.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 5 passed; Tests 120 passed
```

Tests prove each role's access to every notes/timeline function, editors' inability to modify another author's notes, admin override, deleted-note exclusion, and newest-first creation/diff/group/note activity. Rendering tests verify HTML escaping and inert unsafe URLs. Reviewed database calls remain downstream of authenticated functions.

## Phase 6 — functional acceptance passed locally; live R2 pending

Added private attachment upload, metadata listing, streamed download, confirmed deletion, content-signature validation, and partial-failure compensation/retry handling. Server middleware denies viewer upload/download/delete, and all operations verify the parent person remains visible. Audit events share each database mutation batch. Documented storage recovery procedures and the outstanding Cloudflare account prerequisite.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 6 passed; Tests 143 passed
wrangler r2 bucket list: API error 10042 — enable R2 through the Cloudflare Dashboard
```

Miniflare tests exercise upload/list/download/delete, byte-for-byte download, R2 object removal, role/anonymous coverage for all four functions, oversize/disallowed/mismatched files, compensation after insert failure, and retry after delete failure. No live R2 bucket is claimed or configured. Live R2 is a deployment prerequisite; phase 6's stated functional checks pass against the local binding.

## Phase 7 — passed

Replaced the welcome placeholder with live people/status/organization cards, group counts, and the ten most recent permitted activity events with actor names, record links, and relative timestamps. Deleted records link to their collection pages. Dashboard data uses protectedFn and excludes sensitive vault/user-administration events from the shared feed.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 6 passed; Tests 148 passed
```

Tests cover all roles and anonymous denial, deserialize actual Worker output and compare every summary/group count with direct D1 SQL, and request every feed link with a viewer session (HTTP 200).

## Phase 8 — locally verified; live email gate pending

Added admin account management through Better Auth, invitation/password setup UI, sender-restricted Cloudflare Email binding, persistent last-sign-in/delivery fields, self-lockout prevention, and forced reset with session/token revocation. Auth-owned operations record durable audit intents/completions; delivery status and its audit are atomic. Applied the generated migration locally and to staging without creating a remote admin. Local administrator password setup was requested through the simulator; its link remains in the ignored local email file.

```text
bun run typecheck: Tasks: 2 successful, 2 total
bun run build: Tasks: 1 successful, 1 total
bun run test: Test Files 6 passed; Tests 171 passed
0003_slim_jigsaw.sql: applied locally and remotely (4 commands each)
local admin password-reset request: HTTP 200; simulated email file generated
wrangler email sending list: Unauthorized, API 2036
wrangler login with email_sending:write: timed out waiting for authorization code
```

Tests cover all five admin functions for every role/anonymous, self-demotion/ban blocking, admin-created editor access, one-use invitation setup, 24-hour invitation expiry, forced session revocation, and visible failed-email status with generic public reset responses. Failure injection caught Better Auth absorbing delivery errors; persisted status now determines the admin result. Live email authorization/domain verification remains required before this phase passes. Vault and phase-10 hardening/deployment have not started. Live R2 also awaits account enablement.
