import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"
import { authOptions } from "./options"
import * as schema from "../db/auth-schema"
import { eq } from "drizzle-orm"
import { logActivity } from "../db/activity.server"

export interface ResetDelivery { email: string; name: string; url: string; invitation: boolean }
export interface AuthDeliveryOptions { actorId?: string; invitation?: boolean; sendReset?: (message: ResetDelivery) => Promise<void> }

// Only imported by server entrypoints and isolated integration tests.
export function createAuth(database: D1Database, secret: string, baseURL: string, delivery: AuthDeliveryOptions = {}) {
  const db = drizzle(database)
  return betterAuth({
    ...authOptions,
    secret,
    baseURL,
    trustedOrigins: [new URL(baseURL).origin],
    database: drizzleAdapter(drizzle(database, { schema }), { provider: "sqlite", schema }),
    logger: { disabled: true },
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: delivery.invitation ? 86400 : 3600,
      sendResetPassword: async ({ user, url }) => {
        let status = "sent"
        try {
          if (!delivery.sendReset) throw new Error("Email is not configured")
          await delivery.sendReset({ email: user.email, name: user.name, url, invitation: Boolean(delivery.invitation) })
        } catch { status = "failed" }
        const at = new Date()
        await db.batch([
          db.update(schema.user).set({ emailDeliveryStatus: status, emailDeliveryAt: at }).where(eq(schema.user.id, user.id)),
          logActivity(db, { actorId: delivery.actorId ?? user.id, entityType: "user", entityId: user.id, action: `password_email_${status}`, at }),
        ])
        if (status === "failed") throw new Error("Password email could not be delivered.")
      },
      onPasswordReset: async ({ user }) => {
        await logActivity(db, { actorId: user.id, entityType: "user", entityId: user.id, action: "password_reset" })
      },
    },
    databaseHooks: { session: { create: { after: async (session) => {
      const at = new Date()
      await db.batch([
        db.update(schema.user).set({ lastSignInAt: at }).where(eq(schema.user.id, session.userId)),
        logActivity(db, { actorId: session.userId, entityType: "user", entityId: session.userId, action: "signed_in", at }),
      ])
    } } } },
  })
}
