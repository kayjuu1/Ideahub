import { desc, eq } from "drizzle-orm"
import { activityLog } from "../../db/schema"
import { user } from "../../db/auth-schema"
import type { AppDatabase } from "../../db/database.server"

export async function list(db: AppDatabase, input: { page: number; entityType: typeof activityLog.$inferSelect.entityType | "all" }) {
  return db.select({ id: activityLog.id, actor: user.name, action: activityLog.action, entityType: activityLog.entityType, entityId: activityLog.entityId, metadata: activityLog.metadata, createdAt: activityLog.createdAt }).from(activityLog).innerJoin(user, eq(user.id, activityLog.actorId)).where(input.entityType === "all" ? undefined : eq(activityLog.entityType, input.entityType)).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(50).offset(input.page * 50)
}
