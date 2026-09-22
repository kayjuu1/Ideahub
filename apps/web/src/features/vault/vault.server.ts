import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm"
import { getRequestHeader, getRequestHeaders } from "@tanstack/react-start/server"
import { ulid } from "ulid"
import { Buffer } from "node:buffer"
import { user } from "../../db/auth-schema"
import { vaultAccessLog, vaultEntries, vaultReauth } from "../../db/schema"
import { logActivity } from "../../db/activity.server"
import { fail } from "../../lib/errors.server"
import { consumeLimit } from "../../lib/rate-limit.server"
import { getAuth } from "../../auth/auth.server"
import { currentMasterKey, ephemeralDevelopment, masterKeyFor } from "./keys.server"
import { decryptSecret, encryptSecret, rewrapDek } from "./crypto.server"
import type { authenticate } from "../../auth/authenticate"
import type { AppDatabase } from "../../db/database.server"
import type { z } from "zod"
import type { createVaultInput, revealVaultInput, updateVaultInput } from "./validation"

type Identity = ReturnType<typeof authenticate>
const FRESH_MS = 15 * 60 * 1000
async function fresh(db: AppDatabase, identity: Identity) {
  if (identity.session.createdAt.getTime() > Date.now() - FRESH_MS) return true
  const [row] = await db.select({ at: vaultReauth.verifiedAt }).from(vaultReauth).where(eq(vaultReauth.sessionId, identity.session.id))
  return Boolean(row && row.at.getTime() > Date.now() - FRESH_MS)
}
async function requireFresh(db: AppDatabase, identity: Identity) {
  if (!await fresh(db, identity)) fail(403, "Confirm your password before accessing a vault secret.")
}
async function entry(db: AppDatabase, id: string) {
  const [row] = await db.select().from(vaultEntries).where(and(eq(vaultEntries.id, id), isNull(vaultEntries.deletedAt)))
  if (!row) fail(404, "This vault entry no longer exists.")
  return row
}
function access(db: AppDatabase, actorId: string, entryId: string, action: typeof vaultAccessLog.$inferInsert.action, at = new Date(), afterChange = false, expectedUpdatedAt?: Date) {
  const id = ulid(), ip = getRequestHeader("CF-Connecting-IP")?.slice(0, 64) ?? null, agent = getRequestHeader("User-Agent")?.slice(0, 500) ?? null
  const condition = expectedUpdatedAt ? sql`WHERE EXISTS (SELECT 1 FROM vault_entries WHERE id = ${entryId} AND updated_at = ${expectedUpdatedAt.getTime()} AND deleted_at IS NULL)` : afterChange ? sql`WHERE changes() > 0` : sql``
  return db.insert(vaultAccessLog).select(sql`SELECT ${id}, ${entryId}, ${actorId}, ${action}, ${ip}, ${agent}, ${at.getTime()} ${condition}`)
}
export async function list(db: AppDatabase, identity: Identity) {
  const entries = await db.select({ id: vaultEntries.id, label: vaultEntries.label, username: vaultEntries.username, url: vaultEntries.url, category: vaultEntries.category, lastRotatedAt: vaultEntries.lastRotatedAt, createdBy: user.name, keyVersion: vaultEntries.keyVersion }).from(vaultEntries).innerJoin(user, eq(user.id, vaultEntries.createdBy)).where(isNull(vaultEntries.deletedAt)).orderBy(asc(vaultEntries.label), asc(vaultEntries.id))
  return { entries, needsReauthentication: !await fresh(db, identity), ephemeralDevelopment }
}
export async function reauthenticate(db: AppDatabase, identity: Identity, password: string) {
  await consumeLimit(db, identity.user.id, "vault-reauth", 5, 300000)
  try { await getAuth().api.verifyPassword({ headers: getRequestHeaders(), body: { password } }) }
  catch { fail(403, "Password confirmation failed. Check your password and try again.") }
  const at = new Date()
  await db.batch([
    db.insert(vaultReauth).values({ sessionId: identity.session.id, verifiedAt: at }).onConflictDoUpdate({ target: vaultReauth.sessionId, set: { verifiedAt: at } }),
    logActivity(db, { actorId: identity.user.id, entityType: "vault", entityId: identity.user.id, action: "reauthenticated", at }),
  ])
  return { expiresAt: at.getTime() + FRESH_MS }
}
export async function create(db: AppDatabase, identity: Identity, input: z.infer<typeof createVaultInput>) {
  await requireFresh(db, identity)
  const id = ulid(), at = new Date(), master = await currentMasterKey()
  const encrypted = await encryptSecret(id, input.secret, master.key, master.version)
  await db.batch([
    db.insert(vaultEntries).values({ id, label: input.label, username: input.username, url: input.url, category: input.category, ciphertext: Buffer.from(encrypted.ciphertext), iv: Buffer.from(encrypted.iv), wrappedDek: Buffer.from(encrypted.wrappedDek), keyVersion: master.version, createdBy: identity.user.id, createdAt: at, updatedAt: at, lastRotatedAt: at }),
    access(db, identity.user.id, id, "create", at),
    logActivity(db, { actorId: identity.user.id, entityType: "vault", entityId: id, action: "created", at }),
  ])
  return { id }
}
export async function update(db: AppDatabase, identity: Identity, input: z.infer<typeof updateVaultInput>) {
  await requireFresh(db, identity)
  const row = await entry(db, input.id), at = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1))
  const { id, secret, ...metadata } = input
  const master = secret ? await currentMasterKey() : undefined
  const encrypted = master && secret ? await encryptSecret(id, secret, master.key, master.version) : undefined
  const [result] = await db.batch([
    db.update(vaultEntries).set({ ...metadata, updatedAt: at, ...(encrypted ? { ciphertext: Buffer.from(encrypted.ciphertext), iv: Buffer.from(encrypted.iv), wrappedDek: Buffer.from(encrypted.wrappedDek), keyVersion: encrypted.keyVersion, lastRotatedAt: at } : {}) }).where(and(eq(vaultEntries.id, id), eq(vaultEntries.updatedAt, row.updatedAt), isNull(vaultEntries.deletedAt))),
    access(db, identity.user.id, id, "update", at, true),
    logActivity(db, { actorId: identity.user.id, entityType: "vault", entityId: id, action: "updated", at }, true),
  ])
  if (!result.meta.changes) fail(409, "This entry changed. Refresh before editing again.")
  return { id }
}
export async function remove(db: AppDatabase, identity: Identity, id: string) {
  await requireFresh(db, identity)
  const row = await entry(db, id), at = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1))
  const [result] = await db.batch([
    db.update(vaultEntries).set({ label: "[deleted]", username: null, url: null, category: null, ciphertext: null, iv: null, wrappedDek: null, deletedAt: at, updatedAt: at }).where(and(eq(vaultEntries.id, id), eq(vaultEntries.updatedAt, row.updatedAt), isNull(vaultEntries.deletedAt))),
    access(db, identity.user.id, id, "delete", at, true),
    logActivity(db, { actorId: identity.user.id, entityType: "vault", entityId: id, action: "deleted", at }, true),
  ])
  if (!result.meta.changes) fail(409, "This entry changed. Refresh before deleting it.")
  return { id }
}
export async function reveal(db: AppDatabase, identity: Identity, input: z.infer<typeof revealVaultInput>) {
  await consumeLimit(db, identity.user.id, "vault-reveal", 10, 300000)
  await requireFresh(db, identity)
  const row = await entry(db, input.id)
  if (!row.ciphertext || !row.iv || !row.wrappedDek) fail(404, "This secret has been deleted.")
  // Fail closed: audit persistence must succeed before decrypting/returning.
  const [audit] = await db.batch([
    access(db, identity.user.id, row.id, input.action, new Date(), false, row.updatedAt),
    logActivity(db, { actorId: identity.user.id, entityType: "vault", entityId: row.id, action: input.action }, true),
  ])
  if (!audit.meta.changes) fail(409, "This entry changed. Refresh before revealing it.")
  try {
    const secret = await decryptSecret(row.id, { ciphertext: new Uint8Array(row.ciphertext), iv: new Uint8Array(row.iv), wrappedDek: new Uint8Array(row.wrappedDek), keyVersion: row.keyVersion }, await masterKeyFor(row.keyVersion))
    return new Response(secret, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" } })
  } catch { return fail(503, "This secret cannot be opened with the available key. In local development, restarting the server discards the previous key.") }
}
export async function accessLog(db: AppDatabase, page: number) {
  return db.select({ id: vaultAccessLog.id, entryId: vaultAccessLog.entryId, actor: user.name, action: vaultAccessLog.action, ipAddress: vaultAccessLog.ipAddress, userAgent: vaultAccessLog.userAgent, createdAt: vaultAccessLog.createdAt }).from(vaultAccessLog).innerJoin(user, eq(user.id, vaultAccessLog.actorId)).orderBy(desc(vaultAccessLog.createdAt), desc(vaultAccessLog.id)).limit(50).offset(page * 50)
}
export async function rewrap(db: AppDatabase, identity: Identity) {
  await requireFresh(db, identity)
  const master = await currentMasterKey()
  const rows = await db.select().from(vaultEntries).where(and(isNull(vaultEntries.deletedAt), ne(vaultEntries.keyVersion, master.version))).limit(100)
  let changed = 0
  for (const row of rows) {
    if (!row.wrappedDek) continue
    let wrappedDek: Uint8Array<ArrayBuffer>
    try { wrappedDek = await rewrapDek(row.id, new Uint8Array(row.wrappedDek), await masterKeyFor(row.keyVersion), row.keyVersion, master.key, master.version) }
    catch { fail(503, "Key rotation stopped. Verify that all previous master keys are configured, then retry.") }
    const at = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1))
    const [result] = await db.batch([
      db.update(vaultEntries).set({ wrappedDek: Buffer.from(wrappedDek), keyVersion: master.version, updatedAt: at }).where(and(eq(vaultEntries.id, row.id), eq(vaultEntries.updatedAt, row.updatedAt), isNull(vaultEntries.deletedAt))),
      access(db, identity.user.id, row.id, "update", at, true),
      logActivity(db, { actorId: identity.user.id, entityType: "vault", entityId: row.id, action: "key_rewrapped", metadata: { fromVersion: row.keyVersion, toVersion: master.version }, at }, true),
    ])
    changed += result.meta.changes
  }
  return { changed, more: rows.length === 100 }
}
