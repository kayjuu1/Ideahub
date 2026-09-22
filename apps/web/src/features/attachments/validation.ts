import { z } from "zod"

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const fileExtensions = ["pdf", "doc", "docx", "png", "jpg", "jpeg", "webp", "csv", "xlsx"] as const
export const attachmentId = z.object({ personId: z.string().min(1).max(64), id: z.string().min(1).max(64) })
export const attachmentPerson = attachmentId.pick({ personId: true })
export function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(-180) || "attachment"
}
