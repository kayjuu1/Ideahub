import { defineConfig } from "drizzle-kit"

// Local generation needs no credentials. Studio/introspection uses D1 HTTP.
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const databaseId = process.env.CLOUDFLARE_DATABASE_ID
const token = process.env.CLOUDFLARE_API_TOKEN

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/db/auth-schema.ts", "./src/db/schema.ts"],
  out: "./drizzle",
  ...(accountId && databaseId && token
    ? { driver: "d1-http" as const, dbCredentials: { accountId, databaseId, token } }
    : {}),
})
