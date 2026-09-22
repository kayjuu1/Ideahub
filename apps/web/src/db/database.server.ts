import { env } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/d1"

// Only auth middleware may obtain application database access.
export function getDatabase() { return drizzle(env.DB) }
export type AppDatabase = ReturnType<typeof getDatabase>
