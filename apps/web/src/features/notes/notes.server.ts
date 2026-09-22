import { and, desc, eq, isNull, or, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { activityLog, notes } from "../../db/schema"
import { user } from "../../db/auth-schema"
import { logActivity } from "../../db/activity.server"
import { get as getPerson } from "../people/people.server"
import { fail } from "../../lib/errors.server"
import type { AppDatabase } from "../../db/database.server"
import type { Role } from "../../auth/policy"
import type { z } from "zod"
import type { noteDelete, noteInput, noteUpdate, personPage } from "./validation"

type Actor = { id: string; role: Role }
export async function list(db: AppDatabase, input: z.infer<typeof personPage>) {
  await getPerson(db, input.personId)
  return db.select({ id: notes.id, personId: notes.personId, authorId: notes.authorId, author: user.name, content: notes.content, createdAt: notes.createdAt, updatedAt: notes.updatedAt }).from(notes).innerJoin(user, eq(notes.authorId, user.id)).where(and(eq(notes.personId, input.personId), isNull(notes.deletedAt))).orderBy(desc(notes.createdAt), desc(notes.id)).limit(50).offset(input.page * 50)
}
export async function timeline(db: AppDatabase, input: z.infer<typeof personPage>) {
  await getPerson(db, input.personId)
  return db.select({ id: activityLog.id, actor: user.name, action: activityLog.action, entityType: activityLog.entityType, entityId: activityLog.entityId, metadata: activityLog.metadata, createdAt: activityLog.createdAt }).from(activityLog).innerJoin(user, eq(activityLog.actorId, user.id)).where(or(and(eq(activityLog.entityType, "person"), eq(activityLog.entityId, input.personId)), and(sql`${activityLog.entityType} IN ('note','attachment')`, sql`json_extract(${activityLog.metadata}, '$.personId') = ${input.personId}`))).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(50).offset(input.page * 50)
}
export async function create(db: AppDatabase, actorId: string, input: z.infer<typeof noteInput>) {
  await getPerson(db, input.personId)
  const id = ulid(), at = new Date()
  const [result] = await db.batch([
    db.insert(notes).select(sql`SELECT ${id}, ${input.personId}, ${actorId}, ${input.content}, ${at.getTime()}, ${at.getTime()}, NULL WHERE EXISTS (SELECT 1 FROM people WHERE id=${input.personId} AND deleted_at IS NULL)`),
    logActivity(db, { actorId, entityType: "note", entityId: id, action: "added", metadata: { personId: input.personId }, at }, true),
  ])
  if (!result.meta.changes) fail(404, "This person has been deleted.")
  return { id }
}
async function editable(db: AppDatabase, actor: Actor, input: z.infer<typeof noteDelete>) {
  await getPerson(db, input.personId)
  const [note] = await db.select().from(notes).where(and(eq(notes.id, input.id), eq(notes.personId, input.personId), isNull(notes.deletedAt)))
  if (!note) fail(404, "This note no longer exists.")
  if (actor.role !== "admin" && note.authorId !== actor.id) fail(403, "Only the author or an administrator can change this note.")
  return note
}
export async function change(db: AppDatabase, actor: Actor, input: z.infer<typeof noteUpdate>) {
  const note = await editable(db, actor, input)
  const at = new Date(Math.max(Date.now(), note.updatedAt.getTime() + 1))
  const [result] = await db.batch([
    db.update(notes).set({ content: input.content, updatedAt: at }).where(and(eq(notes.id, note.id), eq(notes.updatedAt, note.updatedAt), isNull(notes.deletedAt))),
    logActivity(db, { actorId: actor.id, entityType: "note", entityId: note.id, action: "updated", metadata: { personId: note.personId }, at }, true),
  ])
  if (!result.meta.changes) fail(409, "This note changed. Refresh before editing it again.")
  return { id: note.id }
}
export async function remove(db: AppDatabase, actor: Actor, input: z.infer<typeof noteDelete>) {
  const note = await editable(db, actor, input)
  const at = new Date(Math.max(Date.now(), note.updatedAt.getTime() + 1))
  const [result] = await db.batch([
    db.update(notes).set({ deletedAt: at, updatedAt: at }).where(and(eq(notes.id, note.id), eq(notes.updatedAt, note.updatedAt), isNull(notes.deletedAt))),
    logActivity(db, { actorId: actor.id, entityType: "note", entityId: note.id, action: "deleted", metadata: { personId: note.personId }, at }, true),
  ])
  if (!result.meta.changes) fail(409, "This note changed. Refresh before deleting it.")
  return { id: note.id }
}
