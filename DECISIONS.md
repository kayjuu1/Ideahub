# Implementation decisions

## Confirmed with the project owner

- Keep Bun 1.3.10, the Bun lockfile, and the existing Turbo monorepo.
- Use Cloudflare Email Service for transactional invitations and password resets only.
- Persistent vault keys belong exclusively in Worker secrets. Develop the vault in remote staging; isolated tests may use temporary in-memory keys.
- Editors edit/delete their own notes; admins may manage all notes.
- Deleting a vault entry erases secret material and retains a minimal audit tombstone.

## Architecture defaults

- Extend `apps/web` and `packages/ui`; use TanStack Form with shared Zod validation.
- Use ULIDs and millisecond timestamps. Organizations remain normalized text for counting, not a separate entity.
- All application data functions use composed authentication/role middleware. Better Auth internals, bootstrap scripts, and scheduled maintenance are documented infrastructure exceptions.
- Couple application writes and audit events in D1 batches; use conditional writes for concurrency.
- Viewers may list attachment metadata but cannot download. General feeds exclude unauthorized vault/user events.
- Invitations expire after 24 hours; reset links after one hour. Delivery failures must be visible and retryable.
- Neutral UI with a blue accent, keyboard search, persisted dark mode, and tablet support.

## Phase 0

- Root scripts delegate to the web workspace so commands always resolve the correct Wrangler configuration.
- The all-zero D1 identifier is local-only until real resources are provisioned. Do not deploy this configuration as a production resource definition.
- Local development and Wrangler commands share `apps/web/.wrangler` persistence.
- Use the Cloudflare Vite plugin with TanStack Start's SSR environment and the current compatibility date, 2026-09-22.
- Disable the optional development-tools Vite plugin to keep the Workers scaffold minimal. No product behavior depends on it.

## Execution rule

Complete phases 0–10 in order. Every phase requires passing typecheck, its acceptance evidence, and a recorded summary before starting the next. Missing remote credentials do not waive remote acceptance.

## Phase 1

- The Better Auth CLI generated the separate authentication schema. Before generating its initial migration, the user role column was constrained at the TypeScript level and defaulted to viewer. Application middleware rejects unknown roles.
- Use database-backed Better Auth request rate limiting and one-day sessions. Do not cache session cookies.
- Test the actual compiled server-function endpoints with all roles, authenticated through Better Auth against isolated Miniflare D1. Generated fixture credentials never appear in logs.
- An isolated staging D1 database was provisioned in the connected Ideagap Limited account and the auth migration applied remotely.
- Cloudflare Vite emits a local `.dev.vars` for preview by default. Remove that emitted asset from build output so local auth secrets cannot enter build caches or distributed artifacts.
- Owner selected Ideahub-Admin / admin@ideagap.org and then directed local-only bootstrap. The account was seeded locally, login verified, and its test session revoked. Its random bootstrap password was discarded; the email reset flow will provide first-use password setup. Remote D1 was checked read-only and contains no such account.
- Wrangler bootstrap runs through Node/tsx invoked by Bun scripts; Bun remains the package manager. This avoids the stalled Bun-hosted remote proxy.

## Phases 2–3

- Store the complete requested core schema before implementing feature behavior. Vault secret columns are nullable only for deleted tombstones, enforced with a CHECK constraint.
- Audit logs are append-only through database triggers. Conditional update/delete activity statements use SQLite `changes()` within the same D1 batch, preventing false events when a concurrent write wins.
- Search escapes literal `%`, `_`, and `!` with a single-character `!` escape marker.
- TanStack Table 9 uses `useTable`, explicit features, and typed column helpers. Forms use TanStack Form; shared UI dependencies are declared in their owning workspace.
- Generated TanStack route and Wrangler runtime declarations contain framework-authored broad types; application-authored code contains no explicit `any` or suppression directives.
- Commit with the configured repository author, without co-author trailers. Checkpoint phases 0–3 together; subsequent phases receive separate verified commits.

## Phase 4

- Group/tag counts include visible people only. Group deletion still requires explicit removal of all stored memberships, including soft-deleted people, to protect retained relationship history.
- Bulk mutations accept at most 100 people and execute all changes and associated audit inserts in one atomic D1 batch. Duplicate memberships produce no extra audit events.
- Tag merges preserve source memberships, deduplicate overlaps, and remove the source tag in the same batch; soft-deleted people's relationships are preserved.

## Phase 5

- Notes and timelines paginate at 50 entries, newest first with an ID tie-breaker. Editing and deleting notes never copies note contents into audit metadata.
- Markdown-lite renders React text nodes, emphasis, safe HTTP(S) links, and bullet lines. Raw HTML and script/data links remain inert text.
- Note edits update the query cache optimistically and roll back on failure. Deletions wait for server confirmation. Only the author or an admin can change a note, checked server-side after the shared role middleware.
