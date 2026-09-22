import { z } from "zod"

export const recordId = z.string().min(1).max(64)
export const personPage = z.object({ personId: recordId, page: z.number().int().min(0).max(10000).default(0) })
export const noteInput = z.object({ personId: recordId, content: z.string().trim().min(1, "Write a note first.").max(20000, "Notes are limited to 20,000 characters.") })
export const noteUpdate = noteInput.extend({ id: recordId })
export const noteDelete = z.object({ id: recordId, personId: recordId })
