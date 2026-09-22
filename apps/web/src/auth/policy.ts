import { z } from "zod"

export const roleSchema = z.enum(["viewer", "editor", "admin"])
export type Role = z.infer<typeof roleSchema>

const rank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 }

export class AccessError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message)
    this.name = "AccessError"
  }
}

export function requireRole(actual: string | null | undefined, minimum: Role): Role {
  const parsed = roleSchema.safeParse(actual)
  if (!parsed.success || rank[parsed.data] < rank[minimum]) {
    throw new AccessError(403, "You do not have permission to perform this action.")
  }
  return parsed.data
}

export function preventSelfLockout(actorId: string, targetId: string) {
  if (actorId === targetId) {
    throw new AccessError(403, "You cannot demote or ban your own account.")
  }
}
