import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"
import { authOptions } from "./options"
import * as schema from "../db/auth-schema"

// Only imported by server entrypoints and isolated integration tests.
export function createAuth(database: D1Database, secret: string, baseURL: string) {
  return betterAuth({
    ...authOptions,
    secret,
    baseURL,
    trustedOrigins: [new URL(baseURL).origin],
    database: drizzleAdapter(drizzle(database, { schema }), { provider: "sqlite", schema }),
    logger: { disabled: true },
  })
}
