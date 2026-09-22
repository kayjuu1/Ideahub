import { AccessError, requireRole } from "./policy"
import type { Role } from "./policy"

interface SessionIdentity {
  user: { id: string; name: string; email: string; role?: string | null; banned?: boolean | null; banExpires?: Date | null }
  session: { id: string; createdAt: Date; expiresAt: Date }
}

export function authenticate(session: SessionIdentity | null, minimum: Role = "viewer") {
  if (!session || session.session.expiresAt.getTime() <= Date.now()) {
    throw new AccessError(401, "Please sign in to continue.")
  }
  if (session.user.banned && (!session.user.banExpires || session.user.banExpires.getTime() > Date.now())) {
    throw new AccessError(403, "Your account is suspended. Contact an administrator.")
  }
  const role = requireRole(session.user.role, minimum)
  return { ...session, user: { ...session.user, role } }
}
