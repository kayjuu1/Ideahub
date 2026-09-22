import { getRequestHeaders } from "@tanstack/react-start/server"
import { and, eq, like } from "drizzle-orm"
import { getAuth } from "../../auth/auth.server"
import { preventSelfLockout, roleSchema } from "../../auth/policy"
import { user, verification } from "../../db/auth-schema"
import { logActivity } from "../../db/activity.server"
import { fail } from "../../lib/errors.server"
import type { AppDatabase } from "../../db/database.server"
import { z } from "zod"
import type { banInput, managedUserInput, roleInput } from "./validation"

function randomPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
export async function list() {
  const result = await getAuth().api.listUsers({ headers: getRequestHeaders(), query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" } })
  const additionalFields = z.object({ lastSignInAt: z.date().nullish(), emailDeliveryStatus: z.string().nullish(), emailDeliveryAt: z.date().nullish() })
  return result.users.map((row) => ({ id: row.id, name: row.name, email: row.email, role: roleSchema.parse(row.role), banned: Boolean(row.banned), banReason: row.banReason, ...additionalFields.parse(row) }))
}
async function target(db: AppDatabase, userId: string) {
  const [row] = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.id, userId))
  if (!row) fail(404, "This account no longer exists.")
  return row
}
export async function create(db: AppDatabase, actorId: string, input: z.infer<typeof managedUserInput>) {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, input.email))
  if (existing.length) fail(409, "An account already uses this email. Use password reset to resend access.")
  // Better Auth owns these multi-statement writes. A durable intent precedes
  // the plugin operation so a failure between auth and audit is discoverable.
  await logActivity(db, { actorId, entityType: "user", entityId: actorId, action: "create_requested", metadata: { email: input.email, role: input.role } })
  const auth = getAuth({ actorId, invitation: true })
  const result = await auth.api.createUser({ headers: getRequestHeaders(), body: { ...input, password: randomPassword() } })
  await logActivity(db, { actorId, entityType: "user", entityId: result.user.id, action: "created", metadata: { role: input.role } })
  let emailSent = true
  try { await auth.api.requestPasswordReset({ body: { email: input.email, redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password` } }) } catch { emailSent = false }
  const [delivery] = await db.select({ status: user.emailDeliveryStatus }).from(user).where(eq(user.id, result.user.id))
  emailSent = emailSent && delivery?.status === "sent"
  return { id: result.user.id, emailSent }
}
export async function changeRole(db: AppDatabase, actorId: string, input: z.infer<typeof roleInput>) {
  if (input.role !== "admin") preventSelfLockout(actorId, input.userId)
  await target(db, input.userId)
  await logActivity(db, { actorId, entityType: "user", entityId: input.userId, action: "role_change_requested", metadata: { role: input.role } })
  await getAuth().api.setRole({ headers: getRequestHeaders(), body: input })
  await logActivity(db, { actorId, entityType: "user", entityId: input.userId, action: "role_changed", metadata: { role: input.role } })
  return { id: input.userId }
}
export async function setBan(db: AppDatabase, actorId: string, input: z.infer<typeof banInput>) {
  if (input.banned) preventSelfLockout(actorId, input.userId)
  await target(db, input.userId)
  await logActivity(db, { actorId, entityType: "user", entityId: input.userId, action: input.banned ? "ban_requested" : "unban_requested" })
  const auth = getAuth(), headers = getRequestHeaders()
  if (input.banned) await auth.api.banUser({ headers, body: { userId: input.userId, banReason: input.reason || "Suspended by administrator" } })
  else await auth.api.unbanUser({ headers, body: { userId: input.userId } })
  await logActivity(db, { actorId, entityType: "user", entityId: input.userId, action: input.banned ? "banned" : "unbanned" })
  return { id: input.userId }
}
export async function resetPassword(db: AppDatabase, actorId: string, userId: string) {
  if (actorId === userId) fail(400, "Use the sign-in page to request a reset for your own account.")
  const row = await target(db, userId), auth = getAuth({ actorId }), headers = getRequestHeaders()
  await logActivity(db, { actorId, entityType: "user", entityId: userId, action: "password_reset_requested" })
  await auth.api.setUserPassword({ headers, body: { userId, newPassword: randomPassword() } })
  await auth.api.revokeUserSessions({ headers, body: { userId } })
  await db.batch([
    db.delete(verification).where(and(eq(verification.value, userId), like(verification.identifier, "reset-password:%"))),
    logActivity(db, { actorId, entityType: "user", entityId: userId, action: "password_reset_forced" }),
  ])
  let emailSent = true
  try { await auth.api.requestPasswordReset({ body: { email: row.email, redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password` } }) } catch { emailSent = false }
  const [delivery] = await db.select({ status: user.emailDeliveryStatus }).from(user).where(eq(user.id, userId))
  emailSent = emailSent && delivery?.status === "sent"
  return { id: userId, emailSent }
}
