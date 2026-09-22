# IdeaGap People & Partners

Internal relationship management for people, organizations, groups, tags, notes, private attachments, user accounts, and encrypted credentials. Built with Bun, TanStack Start/Query/Table/Form, React, strict TypeScript, shadcn/ui, Better Auth, Drizzle, and Cloudflare Workers/D1/R2/Email Service.

The owner handles live Cloudflare email, production resources, remote migrations, secrets, and deployment. See [BUILD_STATUS.md](BUILD_STATUS.md) for verification evidence and [DECISIONS.md](DECISIONS.md) for assumptions and scope changes.

## Local development

Requires Bun 1.3.10 and Node.js 22 (Wrangler/tooling). From the repository root:

```sh
bun install --frozen-lockfile
bun run setup:local
bun run db:migrate:local
bun run dev
```

Open http://localhost:3000. D1 and R2 are simulated locally and persist under ignored `apps/web/.wrangler`. The all-zero database ID is local-only. `setup:local` creates ignored `apps/web/.dev.vars` with local authentication settings if absent; it creates no vault key.

The existing local administrator is **Ideahub-Admin**, **admin@ideagap.org**. Its random bootstrap password was discarded after login verification. At `/forgot-password`, enter that address, then follow the reset link printed in the **development server terminal** under `[LOCAL EMAIL — NOT SENT]`. Set your own password; reset links expire after one hour. No remote admin has been seeded.

On a fresh database, bootstrap once:

```sh
bun run seed:admin --name Ideahub-Admin --email admin@ideagap.org --generate-password
```

Then use the terminal email/reset flow. Alternatively omit `--generate-password` for a hidden interactive password prompt. The script refuses a second admin bootstrap, verifies login, and revokes its test session. Never paste passwords or reset links into chat or source control.

Development invitation/reset emails print only in development mode with a loopback auth URL. Production builds omit the terminal logger and use Cloudflare Email Service. No campaign tooling is included.

### Temporary development vault

`bun run dev` generates one non-extractable AES-256 key in Worker memory and never writes or logs it. **Server, HMR, or isolate restarts can make saved development secrets unreadable.** The vault displays this warning. Use disposable test credentials. Metadata and audit history remain; admins can delete obsolete entries and create replacements.

Compiled production and `vite preview` do not generate temporary keys. Persistent vault keys belong in Worker secrets, never `.env`, `.dev.vars`, `wrangler.jsonc`, or the repository. Integration tests generate isolated in-memory keys.

## Verification

```sh
bun run typecheck
bun run build
bun run test
bun run security:audit
```

Build before tests: integration tests call the compiled Worker through real Better Auth sessions against isolated Miniflare D1/R2. Every protected server function is tested for admin/editor/viewer and anonymous callers. Coverage also includes migrations/FKs, CRUD, merges, activity diffs, attachment failures, dashboard counts, invitations, encryption/rotation/rate limits, CSRF, CSP nonces, and safe errors. Tests do not mutate development data. CI runs these commands with pinned Bun.

The security audit inventories protected functions, checks database acquisition/call sites and browser imports, and scans artifacts for server bindings, encryption code, environment files, and actual local secret values without printing them. Static checks supplement runtime authorization tests and review.

Browser E2E, a manual tablet/browser acceptance pass, and production smoke checks remain follow-up work. No live email delivery, production R2 configuration, or deployment is claimed.

## Database workflow

Schemas: `apps/web/src/db`. Generated SQL/snapshots: `apps/web/drizzle`. IDs are application-generated ULIDs; timestamps use milliseconds. D1 enables foreign keys. Audit tables have append-only triggers. Business changes and audit records use atomic D1 batches where possible.

```sh
bun run db:generate
bun run db:migrate:local
bun run cf:types
```

Never edit a migration already applied remotely. From `apps/web`, verify local D1 with:

```sh
bunx --no-install wrangler d1 execute DB --local --command "select 1"
bunx --no-install wrangler d1 execute DB --local --command "PRAGMA foreign_key_check"
```

`bun run db:studio` uses `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` from the operator's environment. Remote scripts require an explicit configured environment and reject local placeholders:

```sh
bun run db:migrate:remote --env production
bun run deploy --env production
```

Append `--check` to validate configuration without remote changes. Deployment builds with `CLOUDFLARE_ENV` before invoking Wrangler: Vite selects Cloudflare bindings at build time. Reference: [Cloudflare environment selection](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/).

## Production handoff (owner-operated)

1. Create production D1 and a private R2 bucket. Enable R2 for the account if necessary and keep public bucket access disabled. Choose the Worker HTTPS URL/custom domain.
2. Add a complete `env.production` block in `apps/web/wrangler.jsonc`: `name`, `d1_databases` (`DB`, real database ID, `migrations_dir: "drizzle"`), `r2_buckets` (`ATTACHMENTS`), and `send_email` (`EMAIL`, sender restricted to `noreply@ideagap.org`). Environment bindings are not inherited. Existing staging D1 is separate.
3. Enable Cloudflare Email Sending, verify domain/DNS, and authorize Email Sending in Wrangler. Sender is `noreply@ideagap.org`; receiving mail/Email Routing is unnecessary. Verify real invitation/reset delivery yourself. Reference: [Cloudflare Email Service](https://developers.cloudflare.com/email-service/).
4. From `apps/web`, use `bunx --no-install wrangler secret put NAME --env production` for `BETTER_AUTH_SECRET` (strong random value), `BETTER_AUTH_URL` (exact HTTPS app URL), and `VAULT_MASTER_KEY` (32 cryptographically random bytes, base64). Generate/store keys through your password manager or protected terminal workflow, never shared logs. Set non-secret `VAULT_KEY_VERSION` to `1` in the environment's `vars`; keep independent secure key backups.
5. Apply remote migrations, run local verification, and deploy with the explicit environment commands above. The deploy wrapper rejects incomplete bindings and scans artifacts before publishing. Retain Worker secrets across deployments.
6. Bootstrap production yourself: `bun run seed:admin --remote --env production --name Ideahub-Admin --email admin@ideagap.org --generate-password`. For Wrangler's platform proxy, mark that environment's D1 binding `remote: true`; never run development against production. Follow the real password reset email. The script requires an explicit remote environment and refuses a second bootstrap.
7. Smoke-test admin login, editor/viewer restrictions, a disposable attachment upload/download/delete, and a disposable vault create/reveal/delete. Inspect audit panels, Worker errors, HTTPS/security headers, and backup/recovery procedures before team use.

The original remote deployment deliverable was explicitly transferred to the owner. Local verification needs no Cloudflare credentials.

## Vault operation and master-key rotation

Each entry has a random 256-bit DEK, AES-GCM ciphertext with a fresh 12-byte IV, and an independently encrypted DEK. Authenticated additional data binds entry IDs and key versions to envelopes. Plaintext returns only from a protected single-entry POST with no caching, never loaders, query caches, audit metadata, or logs. Editors can read/reveal/copy; only admins can create/edit/delete/rewrap. Viewers cannot access pages or metadata.

Sessions older than 15 minutes require password confirmation, valid for 15 minutes and scoped to that session. All secret mutations/rotation also require freshness. Atomic D1 counters allow ten reveals/copies and five password confirmations per user per five minutes. Audits persist before decryption; failed decryptions may leave an attempted-access event. UI plaintext clears after 30 seconds or blur/visibility change/unmount. Clipboard contents remain under operating-system control.

Use a maintenance window or temporarily restrict vault access during rotation so old Worker versions cannot race new writes:

1. Back up D1 and securely retain the current key. Choose a higher `VAULT_KEY_VERSION` and generate a new 32-byte master key.
2. Set `VAULT_PREVIOUS_MASTER_KEYS` as a Worker secret: a JSON object mapping each still-used old version (string) to its base64 key. Preserve existing old versions. Never write this JSON to a file/configuration. Stage it before switching the current key/version.
3. Set the new `VAULT_MASTER_KEY` secret and deploy the new non-secret `VAULT_KEY_VERSION`. Resume access only when key and version agree across active instances. Old entries remain readable through the previous-key map.
4. As admin, confirm your password and click **Rewrap entries with current master key** on `/vault`. Each call handles up to 100 entries; repeat until none remain. Only encrypted DEKs/version change; secret ciphertext and last-secret-rotation time remain. Interrupted operations are retryable. Inspect `key_rewrapped` in `/admin/audit`.
5. Query production D1: `SELECT key_version, count(*) FROM vault_entries WHERE deleted_at IS NULL GROUP BY key_version`. Verify only the new version remains, test a reveal and check its audit. After old instances drain, remove unused previous versions (or delete the previous-key secret if empty). Securely retain old keys for retained database snapshots; without matching keys those snapshots cannot be decrypted.

Deletion erases ciphertext, IV, wrapped key and user metadata, retaining a tombstone for access-log foreign keys. It does not erase secrets from old database backups.

## Authorization, errors, and audit operations

All application functions use `protectedFn`: server-side session resolution → role check → database context. The client cannot supply a trusted role. General limits are 600 reads/120 writes per user per five minutes. Counters are operational records, not business edits. Public auth endpoints have Better Auth database-backed rate limits.

Custom Start middleware explicitly includes CSRF protection. Production uses unique script nonces, no-store responses, frame denial, no-referrer, nosniff, restricted browser permissions, and HTTPS HSTS. Inline styles remain allowed for UI positioning/theme styling. Safe application errors omit stacks, SQL and supplied values.

Intentional database exceptions: Better Auth adapter/login/reset hooks authenticate credentials/tokens outside `protectedFn`; only a narrow public HTTP allowlist is exposed. Raw admin plugin endpoints and self-signup are blocked. CLI bootstrap is operator-only. App services receive database handles only after middleware authorization.

Admins manage users at `/admin/users`, full activity at `/admin/audit`, and vault access at `/vault`. Invitations expire in 24 hours. Force reset discards a random replacement password, revokes sessions/old reset tokens, and sends a one-hour setup link. Self-demotion/ban are blocked; failed delivery remains visible for retry.

Better Auth plugin operations cannot join application D1 batches, so durable requested/completed events surround them. Investigate unmatched intents before retrying. Delivery status and audit update atomically. Query failures log only `protected_operation_failed`; correlate timing with Cloudflare request metadata rather than adding credential/request bodies to logs.

## Attachment recovery

R2 objects pass through authenticated server functions. Viewers see metadata but cannot download. Uploads validate extension and sniffed type, with a 10 MB file limit. Content-Length over 11 MB is rejected early, allowing multipart overhead. CSV requires UTF-8 comma-separated text. Downloads force attachment disposition and disable caching. Accepted: PDF, DOC/DOCX, PNG, JPG/JPEG, WEBP, CSV, XLSX.

R2/D1 cannot share a transaction. Deletion retains the database row until R2 succeeds. If D1 then fails, the row is a retry handle; retry clears it and writes the audit. Failed upload commits attempt compensating R2 deletion. Monitor `attachment_orphan_cleanup_required`, `attachment_delete_retry_required`, and `attachment_row_cleanup_required`. For an orphan, verify no attachment row references the logged exact R2 key before deleting that object with Wrangler. Never silently dismiss cleanup alerts.

Back up D1 and attachment objects together and test restore into a separate environment. No CSV import, public directory, multi-tenancy, campaigns, real-time collaboration, or vault sharing links are implemented.
