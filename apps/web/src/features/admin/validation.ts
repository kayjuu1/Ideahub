import { z } from "zod"
import { roleSchema } from "../../auth/policy"

export const managedUserInput = z.object({ name: z.string().trim().min(1).max(150), email: z.email().max(254).transform((value) => value.trim().toLowerCase()), role: roleSchema })
export const userIdInput = z.object({ userId: z.string().min(1).max(64) })
export const roleInput = userIdInput.extend({ role: roleSchema })
export const banInput = userIdInput.extend({ banned: z.boolean(), reason: z.string().trim().max(500).default("") })
