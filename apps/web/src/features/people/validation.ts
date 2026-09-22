import { z } from "zod"

export const personStatus = z.enum(["active", "paused", "alumni"])
const optionalText = (max: number) => z.string().trim().max(max)
export const personInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(200),
  email: z.union([z.email(), z.literal("")]), phone: optionalText(80), organization: optionalText(200),
  rolePosition: optionalText(200), status: personStatus, notesSummary: optionalText(1000),
})
export type PersonInput = z.infer<typeof personInput>
export const emptyPerson: PersonInput = { name: "", email: "", phone: "", organization: "", rolePosition: "", status: "active", notesSummary: "" }
export const personIdInput = z.object({ id: z.string().min(1).max(64) })
export const peopleQuery = z.object({
  page: z.number().int().min(0).default(0), pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).default(""), status: personStatus.optional(), groupId: z.string().max(64).optional(),
  tagId: z.string().max(64).optional(), organization: z.string().max(200).optional(),
  sort: z.enum(["name", "organization", "status", "updatedAt"]).default("updatedAt"), desc: z.boolean().default(true),
})
