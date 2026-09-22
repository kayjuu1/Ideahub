import { createServerFn } from "@tanstack/react-start"
import { protectedFn } from "../../auth/middleware"
import { peopleQuery, personIdInput, personInput } from "./validation"

export const listPeople = createServerFn({ method: "GET" }).middleware([protectedFn()]).validator(peopleQuery).handler(async ({ data, context }) => {
  const service = await import("./people.server")
  return service.list(context.db, data)
})
export const getPerson = createServerFn({ method: "GET" }).middleware([protectedFn()]).validator(personIdInput).handler(async ({ data, context }) => {
  const service = await import("./people.server")
  return service.get(context.db, data.id)
})
export const getPeopleFilters = createServerFn({ method: "GET" }).middleware([protectedFn()]).handler(async ({ context }) => {
  const service = await import("./people.server")
  return service.filters(context.db)
})
export const createPerson = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(personInput).handler(async ({ data, context }) => {
  const service = await import("./people.server")
  return service.create(context.db, context.identity.user.id, data)
})
export const updatePerson = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(personInput.extend({ id: personIdInput.shape.id })).handler(async ({ data, context }) => {
  const service = await import("./people.server")
  return service.update(context.db, context.identity.user.id, data.id, data)
})
export const deletePerson = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(personIdInput).handler(async ({ data, context }) => {
  const service = await import("./people.server")
  return service.remove(context.db, context.identity.user.id, data.id)
})
