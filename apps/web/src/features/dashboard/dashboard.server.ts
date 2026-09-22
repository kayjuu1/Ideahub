import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { activityLog, groups, people, peopleGroups } from "../../db/schema"
import { user } from "../../db/auth-schema"
import { activityMetadata } from "../../lib/activity-display"
import type { AppDatabase } from "../../db/database.server"

export async function summary(db: AppDatabase) {
  const personId = sql<string>`CASE WHEN ${activityLog.entityType} = 'person' THEN ${activityLog.entityId} ELSE json_extract(${activityLog.metadata}, '$.personId') END`
  const [totals, groupRows, events] = await db.batch([
    db.select({ total: count(), active: sql<number>`coalesce(sum(${people.status}='active'),0)`, paused: sql<number>`coalesce(sum(${people.status}='paused'),0)`, alumni: sql<number>`coalesce(sum(${people.status}='alumni'),0)`, organizations: sql<number>`count(distinct nullif(lower(trim(${people.organization})),''))` }).from(people).where(isNull(people.deletedAt)),
    db.select({ id: groups.id, name: groups.name, color: groups.color, count: count(people.id) }).from(groups).leftJoin(peopleGroups, eq(groups.id, peopleGroups.groupId)).leftJoin(people, and(eq(peopleGroups.personId, people.id), isNull(people.deletedAt))).groupBy(groups.id).orderBy(asc(groups.name)),
    db.select({ id: activityLog.id, actor: user.name, action: activityLog.action, entityType: activityLog.entityType, entityId: activityLog.entityId, metadata: activityLog.metadata, createdAt: activityLog.createdAt, personId: people.id, personName: people.name, personDeletedAt: people.deletedAt }).from(activityLog).innerJoin(user, eq(activityLog.actorId, user.id)).leftJoin(people, eq(people.id, personId)).where(inArray(activityLog.entityType, ["person", "group", "tag", "note", "attachment"])).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(10),
  ])
  return { counts: totals[0], groups: groupRows, activity: events.map((event) => {
    const metadata = activityMetadata(event.metadata)
    const href = event.personId && !event.personDeletedAt ? `/people/${encodeURIComponent(event.personId)}` : event.entityType === "group" ? groupRows.some((group) => group.id === event.entityId) ? `/groups/${encodeURIComponent(event.entityId)}` : "/groups" : event.entityType === "tag" ? "/tags" : "/people"
    return { id: event.id, actor: event.actor, action: event.action, entityType: event.entityType, name: event.personName ?? metadata.name ?? "record", detail: metadata.name, href, createdAt: event.createdAt }
  }) }
}
