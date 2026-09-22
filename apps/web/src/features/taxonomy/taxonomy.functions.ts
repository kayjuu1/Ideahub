import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { protectedFn } from "../../auth/middleware"
import { bulkStatusInput, deleteTaxonomyInput, membershipInput, mergeTagsInput, taxonomyInput } from "./validation"

export const listTaxonomy = createServerFn({ method: "GET" }).middleware([protectedFn()]).handler(async ({ context }) => {
  const service = await import("./taxonomy.server")
  return service.list(context.db)
})
export const getMemberships = createServerFn({ method: "GET" }).middleware([protectedFn()]).validator(z.object({ personId: z.string().min(1).max(64) })).handler(async ({ context, data }) => {
  const service = await import("./taxonomy.server")
  return service.memberships(context.db, data.personId)
})
export const saveTaxonomy = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(taxonomyInput).handler(async ({ context, data }) => {
  const service = await import("./taxonomy.server")
  return service.save(context.db, context.identity.user.id, data)
})
export const deleteTaxonomy = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(deleteTaxonomyInput).handler(async ({ context, data }) => {
  const service = await import("./taxonomy.server")
  return service.remove(context.db, context.identity.user.id, data)
})
export const mergeTags = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(mergeTagsInput).handler(async ({ context, data }) => {
  const service = await import("./taxonomy.server")
  return service.merge(context.db, context.identity.user.id, data)
})
export const changeMembership = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(membershipInput).handler(async ({ context, data }) => {
  const service = await import("./taxonomy.server")
  return service.changeMembership(context.db, context.identity.user.id, data)
})
export const changePeopleStatus = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(bulkStatusInput).handler(async ({ context, data }) => {
  const service = await import("./taxonomy.server")
  return service.changeStatus(context.db, context.identity.user.id, data)
})
