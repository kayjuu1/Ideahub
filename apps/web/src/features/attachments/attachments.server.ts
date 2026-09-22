import { and, desc, eq, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { attachments } from "../../db/schema"
import { user } from "../../db/auth-schema"
import { logActivity } from "../../db/activity.server"
import { get as getPerson } from "../people/people.server"
import { fail } from "../../lib/errors.server"
import { validateFile } from "./sniff.server"
import type { AppDatabase } from "../../db/database.server"

type Bucket = Pick<R2Bucket, "put" | "get" | "delete">
type AttachmentKey = { id: string; personId: string }
export async function list(db: AppDatabase, personId: string) {
  await getPerson(db, personId)
  return db.select({ id: attachments.id, filename: attachments.filename, sizeBytes: attachments.sizeBytes, contentType: attachments.contentType, uploader: user.name, createdAt: attachments.createdAt }).from(attachments).innerJoin(user, eq(user.id, attachments.uploadedBy)).where(eq(attachments.personId, personId)).orderBy(desc(attachments.createdAt), desc(attachments.id))
}
async function get(db: AppDatabase, input: AttachmentKey) {
  await getPerson(db, input.personId)
  const [row] = await db.select().from(attachments).where(and(eq(attachments.id, input.id), eq(attachments.personId, input.personId)))
  if (!row) fail(404, "This attachment no longer exists.")
  return row
}
export async function upload(db: AppDatabase, bucket: Bucket, actorId: string, personId: string, file: File) {
  await getPerson(db, personId)
  const { bytes, filename, contentType } = await validateFile(file)
  const id = ulid(), at = new Date(), r2Key = `people/${personId}/${id}/${filename}`
  await bucket.put(r2Key, bytes, { httpMetadata: { contentType }, customMetadata: { personId, attachmentId: id } })
  try {
    const [result] = await db.batch([
      db.insert(attachments).select(sql`SELECT ${id}, ${personId}, ${actorId}, ${filename}, ${contentType}, ${file.size}, ${r2Key}, ${at.getTime()} WHERE EXISTS (SELECT 1 FROM people WHERE id=${personId} AND deleted_at IS NULL)`),
      logActivity(db, { actorId, entityType: "attachment", entityId: id, action: "uploaded", metadata: { personId, filename }, at }, true),
    ])
    if (!result.meta.changes) throw new Error("Person deleted during upload")
  } catch {
    try { await bucket.delete(r2Key) } catch { console.error(JSON.stringify({ event: "attachment_orphan_cleanup_required", r2Key, attachmentId: id })) }
    fail(503, "The attachment could not be saved. Please try again.")
  }
  return { id }
}
export async function download(db: AppDatabase, bucket: Bucket, input: AttachmentKey) {
  const row = await get(db, input), object = await bucket.get(row.r2Key)
  if (!object) fail(404, "The stored file is unavailable. Contact an administrator.")
  return new Response(object.body, { headers: { "Content-Type": row.contentType, "Content-Length": String(row.sizeBytes), "Content-Disposition": `attachment; filename="${row.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}
export async function remove(db: AppDatabase, bucket: Bucket, actorId: string, input: AttachmentKey) {
  const row = await get(db, input)
  // Keep the row until R2 deletion succeeds. If the subsequent D1 batch fails,
  // the visible row is a retry handle: R2 delete is idempotent.
  try { await bucket.delete(row.r2Key) } catch {
    console.error(JSON.stringify({ event: "attachment_delete_retry_required", attachmentId: row.id }))
    fail(503, "File storage is unavailable. The attachment is retained; retry deletion.")
  }
  try {
    await db.batch([
      db.delete(attachments).where(eq(attachments.id, row.id)),
      logActivity(db, { actorId, entityType: "attachment", entityId: row.id, action: "deleted", metadata: { personId: row.personId, filename: row.filename } }, true),
    ])
  } catch {
    console.error(JSON.stringify({ event: "attachment_row_cleanup_required", attachmentId: row.id }))
    fail(503, "The file was removed but its record could not be cleared. Retry deletion.")
  }
  return { id: row.id }
}
