# IdeaGap People & Partners

Internal relationship-management application built with TanStack Start, React, TypeScript, shadcn/ui, and Cloudflare Workers. See BUILD_STATUS.md for verified phase gates and DECISIONS.md for architecture decisions.

## Development

Requires Bun 1.3.10 and Node.js 22. From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
bun run typecheck
bun run build
```

The application runs at http://localhost:3000. Cloudflare Vite simulates D1 and R2 locally. Run Wrangler from apps/web to share its persistence with the dev server:

```sh
cd apps/web
bunx --no-install wrangler d1 execute DB --local --command "select 1"
```

The default all-zero database ID is local-only. Configure real resources before remote migrations or deployment.

## Database workflow

Schema lives in apps/web/src/db; generated migrations live in apps/web/drizzle.

```sh
bun run db:generate
bun run db:migrate:local
bun run db:migrate:remote
bun run cf:types
```

Never edit an applied remote migration. D1 HTTP introspection via `bun run db:studio` requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, and CLOUDFLARE_API_TOKEN in the process environment. Never import credentials into client code.

## Secrets and email

Local authentication secrets use ignored apps/web/.dev.vars. Persistent vault keys belong exclusively in Worker secrets, including development. Vault tests may generate disposable in-memory keys.

Invitations and password resets use Cloudflare Email Service. A verified sending domain and Email Service permissions are required before phase 8 passes. Local delivery will be simulated.

## Deployment and tests

`bun run deploy` builds and invokes Wrangler. Do not deploy the local-only configuration. Staging/production and operational instructions will be added as their phases complete.

Build first, then run `bun run test`: integration tests exercise the compiled Worker against isolated Miniflare D1. CI runs typecheck, build, and all tests. Automated browser E2E remains follow-up work.

## Local administrator

The first local administrator is **Ideahub-Admin**, **admin@ideagap.org**. Its random bootstrap password was discarded after login verification. First-use password setup will use the email reset flow when phase 8 is implemented. No remote administrator was created.

On a fresh database, run `bun run setup:local`, apply migrations, then seed an admin with a hidden interactive password prompt:

```sh
bun run seed:admin --name Ideahub-Admin --email admin@ideagap.org
```

The seed script refuses to run when an admin already exists. Its generated-password mode is intended for bootstrap followed by password reset, not immediate interactive login.

## Attachment operations

R2 stays private. Files pass through authenticated server functions; viewers can see metadata but cannot download. Upload validation checks the extension and detected binary type (UTF-8 comma-separated text for CSV), up to 10 MB. Downloads force attachment disposition and disable caching.

Cloudflare currently reports R2 is not enabled for this account (API error 10042). Enable R2 in the dashboard before provisioning the staging bucket. Local Miniflare R2 is available and tested.

Deletion retains the database row until R2 succeeds. If the database write then fails, the UI reports a retryable deletion; retrying safely clears the retained row and writes its audit event. Failed upload database writes trigger compensating R2 deletion. If that cleanup also fails, the structured `attachment_orphan_cleanup_required` Worker log includes the exact object key. Operators must verify no attachment row references that key, then delete that object with Wrangler. Monitor this event and `attachment_row_cleanup_required`; never clear these alerts without verifying cleanup.

Implementation references: [TanStack server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions), [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), and [file-type](https://github.com/sindresorhus/file-type).
