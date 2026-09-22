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
