import { z } from "zod"
import { personStatus } from "../people/validation"

export const kind = z.enum(["group", "tag"])
export const taxonomyInput = z.object({
  kind, id: z.string().max(64).optional(), name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color."), description: z.string().trim().max(1000).default(""),
})
export const deleteTaxonomyInput = z.object({ kind, id: z.string().min(1).max(64), removeMembers: z.boolean().default(false) })
export const mergeTagsInput = z.object({ sourceId: z.string().min(1).max(64), targetId: z.string().min(1).max(64) }).refine((value) => value.sourceId !== value.targetId, "Choose two different tags.")
export const membershipInput = z.object({ personIds: z.array(z.string().min(1).max(64)).min(1).max(100), kind, targetId: z.string().min(1).max(64), remove: z.boolean().default(false) })
export const bulkStatusInput = z.object({ personIds: membershipInput.shape.personIds, status: personStatus })
