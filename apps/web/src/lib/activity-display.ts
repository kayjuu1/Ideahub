import { z } from "zod"

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const metadataSchema = z.object({ personId: z.string().optional(), name: z.string().optional(), changes: z.record(z.string(), z.object({ old: scalar, new: scalar })).optional() })
export function activityMetadata(raw: string) {
  try { return metadataSchema.parse(JSON.parse(raw)) } catch { return {} }
}
export function activityLabel(entityType: string, action: string) {
  const labels: Record<string, string> = { group_added: "added to group", group_removed: "removed from group", tag_added: "tagged", tag_removed: "removed tag" }
  return labels[action] ?? `${action} ${entityType}`
}
