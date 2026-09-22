import { validateInput } from "../../lib/validate-input"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { protectedFn } from "../../auth/middleware"

export const listAuditLog = createServerFn({ method: "GET" }).middleware([protectedFn("admin")])
  .validator(validateInput(z.object({ page: z.number().int().min(0).max(10000).default(0), entityType: z.enum(["all", "person", "group", "tag", "note", "attachment", "vault", "user"]).default("all") })))
  .handler(async ({ context, data }) => {
    const { list } = await import("./audit.server")
    return list(context.db, data)
  })
