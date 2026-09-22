import { admin } from "better-auth/plugins/admin"
import { adminAc, userAc } from "better-auth/plugins/admin/access"
import { ulid } from "ulid"

// Shared by the runtime and schema generator; contains no secrets or bindings.
export const authOptions = {
  appName: "IdeaGap",
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  session: {
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
    cookieCache: { enabled: false },
  },
  advanced: { database: { generateId: () => ulid() } },
  rateLimit: { enabled: true, storage: "database" as const, window: 60, max: 60 },
  plugins: [admin({
    defaultRole: "viewer",
    adminRoles: ["admin"],
    roles: { admin: adminAc, editor: userAc, viewer: userAc },
  })],
}
