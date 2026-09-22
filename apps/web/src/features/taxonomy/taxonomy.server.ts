import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { groups, people, peopleGroups, peopleTags, tags } from "../../db/schema"
import { logActivity } from "../../db/activity.server"
import { fail } from "../../lib/errors.server"
import { get as getPerson } from "../people/people.server"
import type { AppDatabase } from "../../db/database.server"
import type { BatchItem } from "drizzle-orm/batch"
import type { z } from "zod"
import type { bulkStatusInput, deleteTaxonomyInput, membershipInput, mergeTagsInput, taxonomyInput } from "./validation"

export async function list(db: AppDatabase) {
  const [groupRows, tagRows] = await db.batch([
    db.select({ id: groups.id, name: groups.name, color: groups.color, description: groups.description, memberCount: count(people.id) }).from(groups).leftJoin(peopleGroups, eq(groups.id, peopleGroups.groupId)).leftJoin(people, and(eq(people.id, peopleGroups.personId), isNull(people.deletedAt))).groupBy(groups.id).orderBy(asc(groups.name)),
    db.select({ id: tags.id, name: tags.name, color: tags.color, memberCount: count(people.id) }).from(tags).leftJoin(peopleTags, eq(tags.id, peopleTags.tagId)).leftJoin(people, and(eq(people.id, peopleTags.personId), isNull(people.deletedAt))).groupBy(tags.id).orderBy(asc(tags.name)),
  ])
  return { groups: groupRows, tags: tagRows }
}

export async function memberships(db: AppDatabase, personId: string) {
  await getPerson(db, personId)
  const [groupRows, tagRows] = await db.batch([
    db.select({ id: groups.id, name: groups.name, color: groups.color }).from(peopleGroups).innerJoin(groups, eq(groups.id, peopleGroups.groupId)).where(eq(peopleGroups.personId, personId)),
    db.select({ id: tags.id, name: tags.name, color: tags.color }).from(peopleTags).innerJoin(tags, eq(tags.id, peopleTags.tagId)).where(eq(peopleTags.personId, personId)),
  ])
  return { groups: groupRows, tags: tagRows }
}

export async function save(db: AppDatabase, actorId: string, input: z.infer<typeof taxonomyInput>) {
  const id = input.id ?? ulid(), at = new Date(), table = input.kind === "group" ? groups : tags
  const name = input.kind === "tag" ? input.name.toLowerCase() : input.name
  const [duplicate] = await db.select({ id: table.id }).from(table).where(eq(table.name, name))
  if (duplicate && duplicate.id !== input.id) {
    if (input.kind === "tag" && !input.id) return { id: duplicate.id }
    fail(409, "That name is already in use.")
  }
  if (input.id) {
    const [existing] = await db.select({ id: table.id }).from(table).where(eq(table.id, id))
    if (!existing) fail(404, "This group or tag no longer exists.")
    const change = input.kind === "group" ? db.update(groups).set({ name, color: input.color, description: input.description, updatedAt: at }).where(eq(groups.id, id)) : db.update(tags).set({ name, color: input.color }).where(eq(tags.id, id))
    await db.batch([change, logActivity(db, { actorId, entityType: input.kind, entityId: id, action: "updated", metadata: { name }, at }, true)])
  } else {
    const insert = input.kind === "group" ? db.insert(groups).values({ id, name, color: input.color, description: input.description, createdAt: at, updatedAt: at }) : db.insert(tags).values({ id, name, color: input.color, createdAt: at })
    await db.batch([insert, logActivity(db, { actorId, entityType: input.kind, entityId: id, action: "created", metadata: { name }, at })])
  }
  return { id }
}

export async function remove(db: AppDatabase, actorId: string, input: z.infer<typeof deleteTaxonomyInput>) {
  const table = input.kind === "group" ? groups : tags
  const [existing] = await db.select({ name: table.name }).from(table).where(eq(table.id, input.id))
  if (!existing) fail(404, "This group or tag no longer exists.")
  if (input.kind === "group") {
    if (input.removeMembers) await db.batch([
      db.delete(peopleGroups).where(eq(peopleGroups.groupId, input.id)), db.delete(groups).where(eq(groups.id, input.id)),
      logActivity(db, { actorId, entityType: "group", entityId: input.id, action: "deleted", metadata: { name: existing.name, removeMembers: true } }, true),
    ])
    else {
      const [result] = await db.batch([
        db.delete(groups).where(and(eq(groups.id, input.id), sql`NOT EXISTS (SELECT 1 FROM people_groups WHERE group_id = ${input.id})`)),
        logActivity(db, { actorId, entityType: "group", entityId: input.id, action: "deleted", metadata: { name: existing.name } }, true),
      ])
      if (!result.meta.changes) fail(409, "This group still has members. Confirm removal of all members to delete it.")
    }
  } else await db.batch([
    db.delete(peopleTags).where(eq(peopleTags.tagId, input.id)), db.delete(tags).where(eq(tags.id, input.id)),
    logActivity(db, { actorId, entityType: "tag", entityId: input.id, action: "deleted", metadata: { name: existing.name } }, true),
  ])
  return { id: input.id }
}

export async function merge(db: AppDatabase, actorId: string, input: z.infer<typeof mergeTagsInput>) {
  const found = await db.select().from(tags).where(inArray(tags.id, [input.sourceId, input.targetId]))
  if (found.length !== 2) fail(404, "Both tags must exist before merging.")
  await db.batch([
    db.insert(peopleTags).select(sql`SELECT person_id, ${input.targetId} FROM people_tags WHERE tag_id = ${input.sourceId}`).onConflictDoNothing(),
    db.delete(peopleTags).where(eq(peopleTags.tagId, input.sourceId)), db.delete(tags).where(eq(tags.id, input.sourceId)),
    logActivity(db, { actorId, entityType: "tag", entityId: input.targetId, action: "merged", metadata: { sourceId: input.sourceId, sourceName: found.find((tag) => tag.id === input.sourceId)?.name ?? "", targetId: input.targetId } }, true),
  ])
  return { id: input.targetId }
}

export async function changeMembership(db: AppDatabase, actorId: string, input: z.infer<typeof membershipInput>) {
  const personIds = [...new Set(input.personIds)]
  const found = await db.select({ id: people.id }).from(people).where(and(inArray(people.id, personIds), isNull(people.deletedAt)))
  if (found.length !== personIds.length) fail(404, "One or more selected people were deleted. Refresh your selection.")
  const table = input.kind === "group" ? groups : tags
  const [target] = await db.select({ name: table.name }).from(table).where(eq(table.id, input.targetId))
  if (!target) fail(404, "This group or tag no longer exists.")
  const at = new Date()
  // D1 executes the complete bounded selection and its audits atomically.
  const statements: BatchItem<"sqlite">[] = []
  for (const personId of personIds) {
    const change = input.kind === "group"
      ? input.remove ? db.delete(peopleGroups).where(and(eq(peopleGroups.personId, personId), eq(peopleGroups.groupId, input.targetId))) : db.insert(peopleGroups).select(sql`SELECT ${personId}, ${input.targetId}, ${actorId}, ${at.getTime()} WHERE EXISTS (SELECT 1 FROM people WHERE id=${personId} AND deleted_at IS NULL)`).onConflictDoNothing()
      : input.remove ? db.delete(peopleTags).where(and(eq(peopleTags.personId, personId), eq(peopleTags.tagId, input.targetId))) : db.insert(peopleTags).select(sql`SELECT ${personId}, ${input.targetId} WHERE EXISTS (SELECT 1 FROM people WHERE id=${personId} AND deleted_at IS NULL)`).onConflictDoNothing()
    statements.push(change, logActivity(db, { actorId, entityType: "person", entityId: personId, action: `${input.kind}_${input.remove ? "removed" : "added"}`, metadata: { personId, targetId: input.targetId, name: target.name }, at }, true))
  }
  return executeChanges(db, statements)
}

export async function changeStatus(db: AppDatabase, actorId: string, input: z.infer<typeof bulkStatusInput>) {
  const ids = [...new Set(input.personIds)]
  const found = await db.select().from(people).where(and(inArray(people.id, ids), isNull(people.deletedAt)))
  if (found.length !== ids.length) fail(404, "One or more selected people were deleted. Refresh your selection.")
  const statements: BatchItem<"sqlite">[] = []
  for (const person of found) {
    if (person.status === input.status) continue
    const at = new Date(Math.max(Date.now(), person.updatedAt.getTime() + 1))
    statements.push(
      db.update(people).set({ status: input.status, updatedAt: at }).where(and(eq(people.id, person.id), eq(people.updatedAt, person.updatedAt), isNull(people.deletedAt))),
      logActivity(db, { actorId, entityType: "person", entityId: person.id, action: "updated", metadata: { personId: person.id, changes: { status: { old: person.status, new: input.status } } }, at }, true),
    )
  }
  return executeChanges(db, statements)
}

async function executeChanges(db: AppDatabase, statements: BatchItem<"sqlite">[]) {
  const [first, ...rest] = statements
  if (!first) return { changed: 0 }
  const results = await db.batch([first, ...rest])
  return { changed: results.filter((_, index) => index % 2 === 0).reduce((total, result) => total + result.meta.changes, 0) }
}
