import { ulid } from "ulid"
import { sql } from "drizzle-orm"
import { activityLog } from "./schema"
import type { AppDatabase } from "./database.server"
import type { entityTypes } from "./schema"

type MetadataValue = string | number | boolean | null | MetadataValue[] | { [key: string]: MetadataValue }
export interface ActivityInput {
  actorId: string
  action: string
  entityType: typeof entityTypes[number]
  entityId: string
  metadata?: Record<string, MetadataValue>
  at?: Date
}

// Return the statement rather than executing it, so the caller includes it in
// the same D1 batch as the business write. Never pass passwords or tokens here.
export function logActivity(db: AppDatabase, input: ActivityInput, onlyIfPreviousChanged = false) {
  const row = {
    id: ulid(), actorId: input.actorId, action: input.action, entityType: input.entityType,
    entityId: input.entityId, metadata: JSON.stringify(input.metadata ?? {}), createdAt: input.at ?? new Date(),
  }
  if (onlyIfPreviousChanged) {
    return db.insert(activityLog).select(sql`SELECT ${row.id}, ${row.actorId}, ${row.action}, ${row.entityType}, ${row.entityId}, ${row.metadata}, ${row.createdAt.getTime()} WHERE changes() > 0`)
  }
  return db.insert(activityLog).values(row)
}
