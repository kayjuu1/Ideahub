# Implementation decisions

## Confirmed with the project owner

- Keep Bun 1.3.10, the Bun lockfile, and the existing Turbo monorepo.
- Use Cloudflare Email Service for transactional invitations and password resets only.
- Persistent vault keys belong exclusively in Worker secrets. The owner's later instruction selects temporary in-memory keys for local development and transfers production setup to the owner (see scope update and phase 9).
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

Complete phases 0–10 in order. Every phase requires passing typecheck, its acceptance evidence, and a recorded summary before starting the next. The owner's explicit local-completion scope update supersedes the original remote acceptance gates; missing credentials alone did not waive them.

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

## Phase 6

- Binary formats use file-type signature detection; CSV must be UTF-8 comma-separated text without binary control characters. Legacy DOC additionally requires a WordDocument stream marker if detected as a generic CFB container.
- Object names are sanitized ASCII and downloads force attachment disposition. The bucket has no public access path. Attachment listings omit internal R2 keys.
- R2/D1 cannot share a transaction. Failed upload commits compensate by deleting the object, with explicit cleanup alerts if compensation fails. Deletion keeps its database retry handle until R2 succeeds, then atomically removes the row and adds audit history. README documents operator recovery.
- Cloudflare R2 is currently disabled (API 10042). The phase's functional acceptance uses Miniflare R2; live provisioning and deployment remain blocked until the owner enables R2 in the dashboard.

## Phase 7

- Organization counts normalize case/whitespace and ignore blank values. All summary and group counts exclude soft-deleted people.
- Shared dashboard activity includes people, groups, tags, notes, and attachments only. Vault and user administration history belong to their dedicated authorized panels.
- Events for deleted records link to their collection page; existing people and groups link directly to details so feed navigation never depends on a deleted record.

## Phase 8

- Send transactional messages from `noreply@ideagap.org` through a sender-restricted Cloudflare binding. Local development uses native simulated delivery and ignored local email files; no real test emails have been sent.
- Persist last-sign-in time and latest delivery status as non-client-writable Better Auth user fields. Invitation setup uses 24-hour reset tokens; ordinary/forced reset uses one hour, with sessions revoked on password change.
- Force reset discards a random replacement password, revokes sessions and existing reset links, then requests a fresh email. Self-service reset uses the public Better Auth token flow; the administrative force-reset control refuses the acting admin's own account to avoid accidental lockout.
- Management operations use the Better Auth admin plugin. Its D1 operations cannot join application audit batches, so durable intent/completion records surround them. The README documents reconciliation of unmatched intents.
- Better Auth may absorb errors from its delivery callback. Return the persisted delivery outcome to admins rather than assuming an API return means successful sending. Public reset requests retain a generic response to avoid account enumeration.
- Email API readiness check failed with Unauthorized 2036; the OAuth refresh timed out. Local functional verification does not waive the agreed live-email phase gate. Phase 8 may be committed as locally verified, but phases 9–10 must wait for the missing email authorization/domain readiness.

## Owner scope update — local completion

- The owner explicitly requested terminal email simulation and completion of the remaining phases locally, and will configure Cloudflare email and production personally. This supersedes the earlier live-email phase gate and deployment deliverable. No additional remote configuration, migration, email send, or deployment is authorized by the remaining work.
- Local `bun run dev` prints simulated invitation/reset messages in the terminal, including the local setup link. This branch is compiled out of production and additionally requires a loopback Better Auth URL. Production continues to use the Cloudflare Email binding.
- Phase 8's previously passing local functional checks satisfy the revised gate; phases 9 and 10 may proceed after the terminal simulation check passes.

## Phase 9

- The owner selected a temporary development vault key. `bun run dev` generates a non-extractable AES-256 key once per Worker isolate; no key is written to disk or logs. Server/HMR/isolate restart can make prior development entries unreadable. The vault displays this warning. Compiled production requires Worker secrets and never falls back to a temporary key.
- Envelope encryption binds both ciphertext and wrapped DEKs to the entry ID through authenticated additional data. Wrapped DEKs pack a separate 12-byte IV followed by the authenticated encrypted key. Key version also authenticates the wrapper.
- Password confirmation is session-specific, expires in 15 minutes, and uses Better Auth's server-only password verifier. All secret mutations and key rotation require freshness as well as reveals. D1 atomic sliding-window counters limit reveals/copies to 10 and password confirmations to 5 per five minutes per user.
- Audit writes precede reveal decryption and check the entry revision in the same batch. Mutations and their logs share D1 batches. Deletion removes encrypted material and metadata while retaining a tombstone for append-only log foreign keys.
- Master-key rotation rewraps at most 100 DEKs per call, using a versioned map in the `VAULT_PREVIOUS_MASTER_KEYS` Worker secret. It preserves secret ciphertext and last-secret-rotation time; interrupted operations can be retried.
- Secret inputs use uncontrolled password fields and are cleared on submission. Reveals return a single raw no-store response and remain only in the reveal component's local state for at most 30 seconds; blur, visibility changes, and unmount also clear them. Clipboard contents remain under the user's operating-system control.
- Password confirmation/reveal attempts and rate-limit maintenance are security operations, not business-data edits. Successful password confirmation is audited; failed attempts consume counters without storing supplied passwords.

## Phase 10

- General protected-function limits are 600 reads and 120 writes per authenticated user per five minutes. They run after role authorization and use atomic D1 counters; stricter vault limits remain independent. Better Auth retains its own database-backed public endpoint limits.
- Custom Start configuration explicitly installs CSRF middleware because defining `src/start.ts` replaces the framework default. Production script CSP uses a per-request nonce shared with SSR and the theme script. Inline styles remain allowed for component positioning/theme support; development additionally permits Vite HMR/evaluation. HTTPS adds HSTS without forcing subdomain policy on unrelated owner sites.
- Zod schemas use a typed parsing wrapper so invalid inputs return sanitized HTTP 400 rather than Start converting issue details into generic errors. All protected error stacks are removed, and unexpected errors log only a fixed event name. Root page errors provide retry/sign-in without exposing internals.
- Admins get a paginated/filterable full activity view in addition to vault access logs. Deleting groups/tags or merging tags records affected-person timeline events in the same mutation batch. Concurrent source membership additions force FK rollback instead of silently losing membership audit history.
- Source audits explicitly allow Better Auth's server adapter/hooks and the operator-only seed script as database acquisition exceptions. The Better Auth browser dependency contains an inert secret-name getter, not a secret value; the artifact check tests actual local values and runtime secret accesses rather than rejecting that dependency's string label.
- Remote scripts require an explicit configured environment. Deployment selects Cloudflare bindings at build time via `CLOUDFLARE_ENV`, scans artifacts, then uses generated Wrangler output. The owner must provide production resources and secrets. No production environment or resource was invented, and no remote action was performed in phases 9–10.
- Browser E2E remains deferred as requested. Compiled Worker/Miniflare integration and local HTTP smoke checks are the automated acceptance evidence; production delivery/browser smoke checks and backup/restore drills remain owner follow-ups.
