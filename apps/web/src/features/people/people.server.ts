import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { groups, people, peopleGroups, peopleTags, tags } from "../../db/schema"
import { logActivity } from "../../db/activity.server"
import { diffFields } from "../../lib/activity-diff"
import { fail } from "../../lib/errors.server"
import type { AppDatabase } from "../../db/database.server"
import type { PersonInput, peopleQuery } from "./validation"
import type { z } from "zod"

const clean = (input: PersonInput) => ({
  name: input.name, email: input.email || null, phone: input.phone || null,
  organization: input.organization || null, rolePosition: input.rolePosition || null,
  status: input.status, notesSummary: input.notesSummary || null,
})

export async function get(db: AppDatabase, id: string) {
  const [person] = await db.select().from(people).where(and(eq(people.id, id), isNull(people.deletedAt)))
  if (!person) fail(404, "This person was not found or has been deleted.")
  return person
}

export async function list(db: AppDatabase, query: z.infer<typeof peopleQuery>) {
  const escaped = `%${query.search.toLowerCase().replace(/[!%_]/g, "!$&")}%`
  const where = and(
    isNull(people.deletedAt),
    query.status ? eq(people.status, query.status) : undefined,
    query.organization ? eq(people.organization, query.organization) : undefined,
    query.groupId ? inArray(people.id, db.select({ id: peopleGroups.personId }).from(peopleGroups).where(eq(peopleGroups.groupId, query.groupId))) : undefined,
    query.tagId ? inArray(people.id, db.select({ id: peopleTags.personId }).from(peopleTags).where(eq(peopleTags.tagId, query.tagId))) : undefined,
    query.search ? sql`(lower(${people.name}) LIKE ${escaped} ESCAPE '!' OR lower(${people.email}) LIKE ${escaped} ESCAPE '!' OR lower(${people.organization}) LIKE ${escaped} ESCAPE '!')` : undefined,
  )
  const [rows, totals] = await db.batch([
    db.select().from(people).where(where).orderBy(query.desc ? desc(people[query.sort]) : asc(people[query.sort]), asc(people.id)).limit(query.pageSize).offset(query.page * query.pageSize),
    db.select({ total: count() }).from(people).where(where),
  ])
  if (!rows.length) return { rows: [], total: totals[0].total }
  const ids = rows.map((person) => person.id)
  const memberships = await db.select({ personId: peopleGroups.personId, id: groups.id, name: groups.name, color: groups.color }).from(peopleGroups).innerJoin(groups, eq(groups.id, peopleGroups.groupId)).where(inArray(peopleGroups.personId, ids))
  const labels = await db.select({ personId: peopleTags.personId, id: tags.id, name: tags.name, color: tags.color }).from(peopleTags).innerJoin(tags, eq(tags.id, peopleTags.tagId)).where(inArray(peopleTags.personId, ids))
  return { rows: rows.map((person) => ({ ...person, groups: memberships.filter((m) => m.personId === person.id), tags: labels.filter((m) => m.personId === person.id) })), total: totals[0].total }
}

export async function filters(db: AppDatabase) {
  const [groupRows, tagRows, organizations] = await db.batch([
    db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(asc(groups.name)),
    db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(asc(tags.name)),
    db.selectDistinct({ name: people.organization }).from(people).where(and(isNull(people.deletedAt), sql`${people.organization} IS NOT NULL`)).orderBy(asc(people.organization)),
  ])
  return { groups: groupRows, tags: tagRows, organizations: organizations.flatMap((row) => row.name ? [row.name] : []) }
}

export async function create(db: AppDatabase, actorId: string, input: PersonInput) {
  const id = ulid(), at = new Date()
  await db.batch([
    db.insert(people).values({ id, ...clean(input), createdBy: actorId, createdAt: at, updatedAt: at }),
    logActivity(db, { actorId, entityType: "person", entityId: id, action: "created", metadata: { personId: id, name: input.name }, at }),
  ])
  return { id }
}

export async function update(db: AppDatabase, actorId: string, id: string, input: PersonInput) {
  const existing = await get(db, id), values = clean(input)
  const before = { name: existing.name, email: existing.email, phone: existing.phone, organization: existing.organization, rolePosition: existing.rolePosition, status: existing.status, notesSummary: existing.notesSummary }
  const changes = diffFields(before, values)
  if (!Object.keys(changes).length) return { id }
  const at = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
  const [result] = await db.batch([
    db.update(people).set({ ...values, updatedAt: at }).where(and(eq(people.id, id), eq(people.updatedAt, existing.updatedAt), isNull(people.deletedAt))),
    logActivity(db, { actorId, entityType: "person", entityId: id, action: "updated", metadata: { personId: id, name: input.name, changes }, at }, true),
  ])
  if (!result.meta.changes) fail(409, "This person changed while you were editing. Reload and try again.")
  return { id }
}

export async function remove(db: AppDatabase, actorId: string, id: string) {
  const existing = await get(db, id), at = new Date()
  const [result] = await db.batch([
    db.update(people).set({ deletedAt: at, updatedAt: at }).where(and(eq(people.id, id), eq(people.updatedAt, existing.updatedAt), isNull(people.deletedAt))),
    logActivity(db, { actorId, entityType: "person", entityId: id, action: "deleted", metadata: { personId: id, name: existing.name }, at }, true),
  ])
  if (!result.meta.changes) fail(409, "This person changed. Reload and try again.")
  return { id }
}
