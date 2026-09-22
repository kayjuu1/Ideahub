import { and, eq, lt, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { requestLimits } from "../db/schema"
import { fail } from "./errors.server"
import type { AppDatabase } from "../db/database.server"

export async function consumeLimit(db: AppDatabase, actorId: string, scope: string, maximum: number, windowMs: number) {
  const now = Date.now(), cutoff = now - windowMs
  const [result] = await db.batch([
    db.insert(requestLimits).select(sql`SELECT ${ulid()}, ${actorId}, ${scope}, ${now} WHERE (SELECT count(*) FROM request_limits WHERE actor_id=${actorId} AND scope=${scope} AND created_at>${cutoff}) < ${maximum}`),
    db.delete(requestLimits).where(and(eq(requestLimits.actorId, actorId), eq(requestLimits.scope, scope), lt(requestLimits.createdAt, new Date(cutoff)))),
  ])
  if (!result.meta.changes) fail(429, "Too many attempts. Please wait five minutes before trying again.")
}
